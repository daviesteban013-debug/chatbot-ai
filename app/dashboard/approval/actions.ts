"use server";
import { loadWhatsAppSendOptions } from "@/lib/whatsapp/credentials";


import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth";
import { sendText, isWithinServiceWindow, type SendOptions } from "@/lib/whatsapp/send";

type ActionResult = { ok: boolean; error?: string };

async function loadSendOptions(tenantId: string) { return loadWhatsAppSendOptions(createAdminClient(), tenantId); }

/**
 * Claims the proposed run before sending, so a double click or two teammates
 * approving at once send the reply only once. If WhatsApp rejects the message,
 * the run goes back to "proposed" so it can be retried.
 */
async function claimAndSend(
  tenantId: string, runId: string, status: "approved" | "edited", text: string, phone: string, sendOptions: SendOptions,
): Promise<{ ok: true; waMessageId: string | null } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: claimed, error } = await admin.from("agent_runs")
    .update({ status, final_reply: text })
    .eq("id", runId).eq("tenant_id", tenantId).eq("status", "proposed")
    .select("id").maybeSingle();
  if (error) return { ok: false, error: "No se pudo procesar la respuesta. Inténtalo de nuevo." };
  if (!claimed) return { ok: false, error: "Esta respuesta ya fue procesada." };
  try {
    const sent = await sendText(phone, text, sendOptions);
    return { ok: true, waMessageId: sent.messages?.[0]?.id ?? null };
  } catch (err) {
    await admin.from("agent_runs").update({ status: "proposed", final_reply: null })
      .eq("id", runId).eq("tenant_id", tenantId).eq("status", status);
    const msg = err instanceof Error ? err.message : "Error enviando mensaje";
    return { ok: false, error: `Error enviando por WhatsApp: ${msg}` };
  }
}

/**
 * Aprueba una respuesta propuesta por el agente y la envía por WhatsApp.
 */
export async function approveReply(agentRunId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || user.is_anonymous) return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const tenantCtx = await getCurrentTenant();
  if (!tenantCtx) return { ok: false, error: "No encontramos tu negocio." };
  if (!["owner", "agent"].includes(tenantCtx.role)) return { ok: false, error: "Tu acceso es de solo lectura." };
  const tenantId = tenantCtx.tenantId;

  const supabase = await createClient();

  // Load the agent run
  const { data: run } = await supabase
    .from("agent_runs")
    .select("id, conversation_id, proposed_reply, status, tenant_id")
    .eq("id", agentRunId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!run) return { ok: false, error: "Respuesta no encontrada." };
  if (run.status !== "proposed") return { ok: false, error: "Esta respuesta ya fue procesada." };

  // Load conversation → customer
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, customer_id, customers(id, phone, name)")
    .eq("id", run.conversation_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!conversation) return { ok: false, error: "Conversación no encontrada." };

  const customer = Array.isArray(conversation.customers)
    ? conversation.customers[0]
    : conversation.customers;

  if (!customer?.phone) return { ok: false, error: "No se pudo resolver el teléfono del cliente." };

  // Check 24h service window — use last inbound message
  const { data: lastInbound } = await supabase
    .from("messages")
    .select("created_at")
    .eq("conversation_id", run.conversation_id)
    .eq("tenant_id", tenantId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lastInbound) return { ok: false, error: "No hay mensajes entrantes en esta conversación." };

  const windowOpen = isWithinServiceWindow(new Date(lastInbound.created_at));
  if (!windowOpen) return { ok: false, error: "Fuera de la ventana de 24h. No se puede enviar el mensaje." };

  // Load WhatsApp send options
  const sendOptions = await loadSendOptions(tenantId);
  if (!sendOptions) return { ok: false, error: "No hay credenciales de WhatsApp configuradas." };

  const replyText = run.proposed_reply?.trim();
  if (!replyText) return { ok: false, error: "La respuesta propuesta está vacía." };

  const sent = await claimAndSend(tenantId, run.id, "approved", replyText, customer.phone, sendOptions);
  if (!sent.ok) return sent;
  const admin = createAdminClient();

  // Insert outbound message
  const now = new Date().toISOString();
  await admin.from("messages").insert({
    tenant_id: tenantId,
    conversation_id: run.conversation_id,
    direction: "outbound",
    sender: "human",
    type: "text",
    body: replyText,
    wa_message_id: sent.waMessageId,
    created_at: now,
  });

  // Update conversation last_message_at
  await admin
    .from("conversations")
    .update({ last_message_at: now })
    .eq("id", run.conversation_id)
    .eq("tenant_id", tenantId);

  revalidatePath("/dashboard/approval");
  return { ok: true };
}

/**
 * Edita y aprueba una respuesta propuesta — envía el texto editado.
 */
export async function editAndApproveReply(
  agentRunId: string,
  editedText: string
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || user.is_anonymous) return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const tenantCtx = await getCurrentTenant();
  if (!tenantCtx) return { ok: false, error: "No encontramos tu negocio." };
  if (!["owner", "agent"].includes(tenantCtx.role)) return { ok: false, error: "Tu acceso es de solo lectura." };
  const tenantId = tenantCtx.tenantId;

  const supabase = await createClient();

  const { data: run } = await supabase
    .from("agent_runs")
    .select("id, conversation_id, status, tenant_id")
    .eq("id", agentRunId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!run) return { ok: false, error: "Respuesta no encontrada." };
  if (run.status !== "proposed") return { ok: false, error: "Esta respuesta ya fue procesada." };

  const trimmed = editedText.trim();
  if (!trimmed) return { ok: false, error: "El texto editado no puede estar vacío." };
  if (trimmed.length > 4096) return { ok: false, error: "WhatsApp admite hasta 4.096 caracteres por mensaje." };

  // Load conversation → customer
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, customer_id, customers(id, phone, name)")
    .eq("id", run.conversation_id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!conversation) return { ok: false, error: "Conversación no encontrada." };

  const customer = Array.isArray(conversation.customers)
    ? conversation.customers[0]
    : conversation.customers;

  if (!customer?.phone) return { ok: false, error: "No se pudo resolver el teléfono del cliente." };

  // Check 24h window
  const { data: lastInbound } = await supabase
    .from("messages")
    .select("created_at")
    .eq("conversation_id", run.conversation_id)
    .eq("tenant_id", tenantId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!lastInbound) return { ok: false, error: "No hay mensajes entrantes en esta conversación." };

  const windowOpen = isWithinServiceWindow(new Date(lastInbound.created_at));
  if (!windowOpen) return { ok: false, error: "Fuera de la ventana de 24h. No se puede enviar el mensaje." };

  // Load send options
  const sendOptions = await loadSendOptions(tenantId);
  if (!sendOptions) return { ok: false, error: "No hay credenciales de WhatsApp configuradas." };

  const sent = await claimAndSend(tenantId, run.id, "edited", trimmed, customer.phone, sendOptions);
  if (!sent.ok) return sent;
  const admin = createAdminClient();

  // Insert outbound message
  const now = new Date().toISOString();
  await admin.from("messages").insert({
    tenant_id: tenantId,
    conversation_id: run.conversation_id,
    direction: "outbound",
    sender: "human",
    type: "text",
    body: trimmed,
    wa_message_id: sent.waMessageId,
    created_at: now,
  });

  // Update conversation
  await admin
    .from("conversations")
    .update({ last_message_at: now })
    .eq("id", run.conversation_id)
    .eq("tenant_id", tenantId);

  revalidatePath("/dashboard/approval");
  return { ok: true };
}

/**
 * Rechaza una respuesta propuesta (no se envía nada).
 */
export async function rejectReply(agentRunId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || user.is_anonymous) return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const tenantCtx = await getCurrentTenant();
  if (!tenantCtx) return { ok: false, error: "No encontramos tu negocio." };
  if (!["owner", "agent"].includes(tenantCtx.role)) return { ok: false, error: "Tu acceso es de solo lectura." };
  const tenantId = tenantCtx.tenantId;

  const supabase = await createClient();

  const { data: run } = await supabase
    .from("agent_runs")
    .select("id, status")
    .eq("id", agentRunId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!run) return { ok: false, error: "Respuesta no encontrada." };
  if (run.status !== "proposed") return { ok: false, error: "Esta respuesta ya fue procesada." };

  const { data: rejected } = await createAdminClient()
    .from("agent_runs")
    .update({ status: "rejected" })
    .eq("id", agentRunId)
    .eq("tenant_id", tenantId)
    .eq("status", "proposed")
    .select("id")
    .maybeSingle();
  if (!rejected) return { ok: false, error: "Esta respuesta ya fue procesada." };

  revalidatePath("/dashboard/approval");
  return { ok: true };
}

/**
 * Aprueba (→ pending_payment) o rechaza (→ canceled, liberando el stock reservado) un
 * pedido pendiente. La base de datos bloquea el pedido: un doble clic o una aprobación
 * y un rechazo simultáneos solo se aplican una vez.
 */
async function reviewOrder(orderId: string, approve: boolean): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user || user.is_anonymous) return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const tenantCtx = await getCurrentTenant();
  if (!tenantCtx) return { ok: false, error: "No encontramos tu negocio." };
  if (!["owner", "agent"].includes(tenantCtx.role)) return { ok: false, error: "Tu acceso es de solo lectura." };

  const { data, error } = await createAdminClient().rpc("nexo_review_pending_order", {
    p_tenant: tenantCtx.tenantId, p_user: user.id, p_order: orderId, p_approve: approve,
  });
  if (error) return { ok: false, error: error.message.includes("order_forbidden") ? "Tu acceso es de solo lectura." : "No se pudo actualizar el pedido. Inténtalo de nuevo." };
  const result = data as { ok: boolean; reason?: string } | null;
  if (!result?.ok) return { ok: false, error: result?.reason === "not_found" ? "Pedido no encontrado." : "Este pedido ya fue procesado." };

  revalidatePath("/dashboard/approval");
  return { ok: true };
}

/** Aprueba un pedido pendiente → lo mueve a 'pending_payment'. */
export async function approveOrder(orderId: string): Promise<ActionResult> {
  return reviewOrder(orderId, true);
}

/** Rechaza un pedido pendiente → libera stock reservado y lo marca como cancelado. */
export async function rejectOrder(orderId: string): Promise<ActionResult> {
  return reviewOrder(orderId, false);
}
