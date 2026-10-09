"use server";
import { loadWhatsAppSendOptions } from "@/lib/whatsapp/credentials";


import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth";
import { sendText } from "@/lib/whatsapp/send";

/**
 * Resultado serializable de una Server Action de handoffs.
 * `ok=false` + `error` se muestra en la UI; nunca lanzamos al cliente para
 * que el formulario pueda reintentar sin romper la navegación.
 */
export type ActionResult = { ok: true } | { ok: false; error: string };

const loadSendOptions = loadWhatsAppSendOptions;

/**
 * Toma un handoff abierto y lo asigna al usuario actual.
 * Verifica tenant y que el estado siga siendo `open` (evita carreras).
 */
export async function takeHandoff(handoffId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  const tenantContext = await getCurrentTenant();
  if (!user || !tenantContext) {
    return { ok: false, error: "Sesión no válida. Vuelve a iniciar sesión." };
  }

  const supabase = await createClient();
  const tenantId = tenantContext.tenantId;

  const { data: handoff } = await supabase
    .from("handoffs")
    .select("id, status, taken_by")
    .eq("tenant_id", tenantId)
    .eq("id", handoffId)
    .maybeSingle();

  if (!handoff) {
    return { ok: false, error: "Handoff no encontrado." };
  }
  if (handoff.status !== "open") {
    return { ok: false, error: "Este handoff ya no está disponible." };
  }

  const { error } = await supabase
    .from("handoffs")
    .update({ status: "taken", taken_by: user.id })
    .eq("tenant_id", tenantId)
    .eq("id", handoffId)
    .eq("status", "open");

  if (error) {
    return { ok: false, error: "No se pudo tomar el handoff." };
  }

  revalidatePath("/dashboard/handoffs");
  revalidatePath(`/dashboard/handoffs/${handoffId}`);
  return { ok: true };
}

/**
 * Envía una respuesta humana al cliente de la conversación del handoff.
 * Solo permitido si el handoff está `taken` por el usuario actual.
 * Usa el cliente service-role para leer el token de WhatsApp y enviar.
 */
export async function sendHumanReply(
  handoffId: string,
  messageText: string
): Promise<ActionResult> {
  const text = messageText.trim();
  if (!text) {
    return { ok: false, error: "El mensaje está vacío." };
  }

  const user = await getCurrentUser();
  const tenantContext = await getCurrentTenant();
  if (!user || !tenantContext) {
    return { ok: false, error: "Sesión no válida. Vuelve a iniciar sesión." };
  }

  const tenantId = tenantContext.tenantId;
  const admin = createAdminClient();

  // 1. Cargar handoff + conversación + cliente (todo con service-role para
  //    poder leer el teléfono y las credenciales).
  const { data: handoff } = await admin
    .from("handoffs")
    .select("id, status, taken_by, conversation_id")
    .eq("tenant_id", tenantId)
    .eq("id", handoffId)
    .maybeSingle();

  if (!handoff) {
    return { ok: false, error: "Handoff no encontrado." };
  }
  if (handoff.status !== "taken" || handoff.taken_by !== user.id) {
    return {
      ok: false,
      error: "Solo puedes responder en un handoff que hayas tomado.",
    };
  }

  const { data: conversation } = await admin
    .from("conversations")
    .select("id, customer_id, customers(phone)")
    .eq("tenant_id", tenantId)
    .eq("id", handoff.conversation_id)
    .maybeSingle();

  if (!conversation) {
    return { ok: false, error: "Conversación no encontrada." };
  }

  const joinedCustomer = conversation.customers as
    | { phone: string }
    | { phone: string }[]
    | null;
  const customer = Array.isArray(joinedCustomer)
    ? (joinedCustomer[0] ?? null)
    : (joinedCustomer ?? null);

  const customerPhone = customer?.phone;
  if (!customerPhone) {
    return { ok: false, error: "No se pudo resolver el teléfono del cliente." };
  }

  // 2. Credenciales de envío del tenant.
  const sendOptions = await loadSendOptions(admin, tenantId);
  if (!sendOptions) {
    return {
      ok: false,
      error: "No hay una cuenta de WhatsApp configurada para enviar.",
    };
  }

  // 3. Enviar vía WhatsApp Cloud API.
  try {
    await sendText(customerPhone, text, sendOptions);
  } catch (error) {
    console.error("[handoffs] Error enviando respuesta humana:", error);
    return {
      ok: false,
      error: "No se pudo enviar el mensaje. La ventana de 24h pudo haber cerrado.",
    };
  }

  // 4. Persistir el mensaje saliente como `human`.
  const { error: insertError } = await admin.from("messages").insert({
    tenant_id: tenantId,
    conversation_id: conversation.id,
    direction: "outbound",
    sender: "human",
    type: "text",
    body: text,
  });

  if (insertError) {
    console.error("[handoffs] Error persistiendo mensaje humano:", insertError);
    return { ok: false, error: "El mensaje se envió pero no se pudo registrar." };
  }

  // 5. Actualizar last_message_at de la conversación.
  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", conversation.id);

  revalidatePath(`/dashboard/handoffs/${handoffId}`);
  return { ok: true };
}

/**
 * Resuelve un handoff y devuelve la conversación al agente.
 * Solo permitido si el handoff está `taken` por el usuario actual.
 */
export async function resolveHandoff(handoffId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  const tenantContext = await getCurrentTenant();
  if (!user || !tenantContext) {
    return { ok: false, error: "Sesión no válida. Vuelve a iniciar sesión." };
  }

  const supabase = await createClient();
  const tenantId = tenantContext.tenantId;

  const { data: handoff } = await supabase
    .from("handoffs")
    .select("id, status, taken_by, conversation_id")
    .eq("tenant_id", tenantId)
    .eq("id", handoffId)
    .maybeSingle();

  if (!handoff) {
    return { ok: false, error: "Handoff no encontrado." };
  }
  if (handoff.status !== "taken" || handoff.taken_by !== user.id) {
    return {
      ok: false,
      error: "Solo puedes resolver un handoff que hayas tomado.",
    };
  }

  const { error } = await supabase
    .from("handoffs")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", handoffId);

  if (error) {
    return { ok: false, error: "No se pudo resolver el handoff." };
  }

  // Devolver la conversación al agente para que vuelva a responder.
  await supabase
    .from("conversations")
    .update({ status: "open" })
    .eq("tenant_id", tenantId)
    .eq("id", handoff.conversation_id);

  revalidatePath("/dashboard/handoffs");
  revalidatePath(`/dashboard/handoffs/${handoffId}`);
  return { ok: true };
}
