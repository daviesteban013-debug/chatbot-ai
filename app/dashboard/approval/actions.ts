"use server";
import { loadWhatsAppSendOptions } from "@/lib/whatsapp/credentials";


import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth";
import { sendText, isWithinServiceWindow } from "@/lib/whatsapp/send";

type ActionResult = { ok: boolean; error?: string };

async function loadSendOptions(tenantId: string) { return loadWhatsAppSendOptions(createAdminClient(), tenantId); }

/**
 * Aprueba una respuesta propuesta por el agente y la envía por WhatsApp.
 */
export async function approveReply(agentRunId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const tenantCtx = await getCurrentTenant();
  if (!tenantCtx) return { ok: false, error: "No encontramos tu negocio." };
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

  // Send via WhatsApp
  try {
    await sendText(customer.phone, replyText, sendOptions);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error enviando mensaje";
    return { ok: false, error: `Error enviando por WhatsApp: ${msg}` };
  }

  // Update agent_run status
  const admin = createAdminClient();
  await admin
    .from("agent_runs")
    .update({ status: "approved", final_reply: replyText })
    .eq("id", run.id)
    .eq("tenant_id", tenantId);

  // Insert outbound message
  const now = new Date().toISOString();
  await admin.from("messages").insert({
    tenant_id: tenantId,
    conversation_id: run.conversation_id,
    direction: "outbound",
    sender: "human",
    type: "text",
    body: replyText,
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
  if (!user) return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const tenantCtx = await getCurrentTenant();
  if (!tenantCtx) return { ok: false, error: "No encontramos tu negocio." };
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

  // Send edited text
  try {
    await sendText(customer.phone, trimmed, sendOptions);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error enviando mensaje";
    return { ok: false, error: `Error enviando por WhatsApp: ${msg}` };
  }

  // Update agent_run
  const admin = createAdminClient();
  await admin
    .from("agent_runs")
    .update({ status: "edited", final_reply: trimmed })
    .eq("id", run.id)
    .eq("tenant_id", tenantId);

  // Insert outbound message
  const now = new Date().toISOString();
  await admin.from("messages").insert({
    tenant_id: tenantId,
    conversation_id: run.conversation_id,
    direction: "outbound",
    sender: "human",
    type: "text",
    body: trimmed,
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
  if (!user) return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const tenantCtx = await getCurrentTenant();
  if (!tenantCtx) return { ok: false, error: "No encontramos tu negocio." };
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

  const admin = createAdminClient();
  await admin
    .from("agent_runs")
    .update({ status: "rejected" })
    .eq("id", agentRunId)
    .eq("tenant_id", tenantId);

  revalidatePath("/dashboard/approval");
  return { ok: true };
}

/**
 * Aprueba un pedido pendiente → lo mueve a 'pending_payment'.
 */
export async function approveOrder(orderId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const tenantCtx = await getCurrentTenant();
  if (!tenantCtx) return { ok: false, error: "No encontramos tu negocio." };
  const tenantId = tenantCtx.tenantId;

  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!order) return { ok: false, error: "Pedido no encontrado." };
  if (order.status !== "pending_approval") {
    return { ok: false, error: "Este pedido ya fue procesado." };
  }

  const admin = createAdminClient();
  await admin
    .from("orders")
    .update({ status: "pending_payment", updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("tenant_id", tenantId);

  revalidatePath("/dashboard/approval");
  return { ok: true };
}

/**
 * Rechaza un pedido pendiente → libera stock reservado y lo marca como cancelado.
 */
export async function rejectOrder(orderId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const tenantCtx = await getCurrentTenant();
  if (!tenantCtx) return { ok: false, error: "No encontramos tu negocio." };
  const tenantId = tenantCtx.tenantId;

  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!order) return { ok: false, error: "Pedido no encontrado." };
  if (order.status !== "pending_approval") {
    return { ok: false, error: "Este pedido ya fue procesado." };
  }

  // Load order items to release stock
  const { data: items } = await supabase
    .from("order_items")
    .select("variant_id, qty")
    .eq("order_id", orderId)
    .eq("tenant_id", tenantId);

  // Release reserved stock for each item
  const admin = createAdminClient();
  if (items && items.length > 0) {
    for (const item of items) {
      await admin.rpc("release_variant_stock", {
        p_variant: item.variant_id,
        p_qty: item.qty,
      });
    }
  }

  // Cancel the order
  await admin
    .from("orders")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("tenant_id", tenantId);

  revalidatePath("/dashboard/approval");
  return { ok: true };
}
