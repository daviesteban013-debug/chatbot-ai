/**
 * Procesamiento del payload del webhook de WhatsApp, en dos fases. Usa el
 * cliente service-role porque no hay sesión de usuario.
 *
 * 1. `persistWebhookPayload` (antes de responder a Meta):
 *  - Resolver el tenant a partir del `phone_number_id`.
 *  - Crear/actualizar el cliente (teléfono normalizado a E.164).
 *  - Buscar o crear la conversación abierta.
 *  - Persistir el mensaje entrante de forma idempotente (`wa_message_id`).
 *  - Actualizar `conversations.last_message_at`.
 *  Si algo falla, el route responde error y Meta reintenta: ningún mensaje
 *  se pierde aunque el agente se interrumpa después.
 *
 * 2. `runWebhookJobs` (dentro de `after()`, ya respondimos a Meta):
 *  - Transcribir audios y disparar el agente vendedor por conversación.
 *  Nunca lanza: un fallo aquí no debe provocar reintentos de Meta.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { runAgent } from "@/lib/agent/loop";
import { transcribeAudio } from "@/lib/llm";
import { downloadMedia } from "./send";
import { loadWhatsAppSendOptions } from "./credentials";
import type { Json, MessageType } from "@/lib/database.types";
import type {
  WhatsAppWebhookPayload,
  WhatsAppMessage,
} from "./types";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Código de error de Postgres para violación de restricción única. */
const UNIQUE_VIOLATION = "23505";

/** Trabajo pendiente para el agente tras persistir un mensaje entrante. */
export type WebhookAgentJob = {
  tenantId: string;
  conversationId: string;
  customerId: string;
  customerPhone: string;
  messageId: string;
  waMessageId: string;
  phoneNumberId: string;
  audioId: string | null;
  accessToken: string | null;
};

export type PersistResult = { jobs: WebhookAgentJob[]; failed: number };

/**
 * Fase síncrona (antes de responder a Meta): resuelve tenant, clientes y
 * conversaciones y persiste cada mensaje de forma idempotente. `failed > 0`
 * indica que el caller debe responder un error para que Meta reintente; los
 * mensajes ya guardados se omiten en el reintento gracias a `wa_message_id`.
 */
export async function persistWebhookPayload(
  payload: WhatsAppWebhookPayload
): Promise<PersistResult> {
  const result: PersistResult = { jobs: [], failed: 0 };
  if (payload.object !== "whatsapp_business_account") return result;

  const admin = createAdminClient();

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;

      const value = change.value;
      const phoneNumberId = value.metadata.phone_number_id;

      // Resolver tenant por phone_number_id (constraint único en whatsapp_accounts).
      const { data: waAccount, error: accountError } = await admin
        .from("whatsapp_accounts")
        .select("tenant_id")
        .eq("phone_number_id", phoneNumberId)
        .maybeSingle();

      if (accountError) {
        console.error(`[webhook] No se pudo resolver phone_number_id ${phoneNumberId}:`, accountError.message);
        result.failed += value.messages?.length ?? 0;
        continue;
      }
      if (!waAccount) {
        console.error(
          `[webhook] phone_number_id desconocido: ${phoneNumberId}`
        );
        continue;
      }

      const tenantId = waAccount.tenant_id;
      const sendOptions = await loadWhatsAppSendOptions(admin,tenantId,phoneNumberId);
      const waAccessToken = sendOptions?.accessToken ?? null;
      if (value.messages?.length) {
        await admin.from("whatsapp_accounts").update({last_webhook_at:new Date().toISOString()})
          .eq("tenant_id",tenantId).eq("phone_number_id",phoneNumberId);
      }

      // Contactos: crear/actualizar clientes con el nombre de perfil.
      if (value.contacts) {
        for (const contact of value.contacts) {
          try {
            await upsertCustomer(
              admin,
              tenantId,
              contact.wa_id,
              contact.profile?.name
            );
          } catch (error) {
            console.error(
              `[webhook] Error en upsert de cliente ${contact.wa_id}:`,
              error
            );
          }
        }
      }

      // Mensajes entrantes.
      if (value.messages) {
        for (const message of value.messages) {
          try {
            const job = await persistIncomingMessage(admin, tenantId, message, phoneNumberId, waAccessToken);
            if (job) result.jobs.push(job);
          } catch (error) {
            result.failed++;
            console.error(
              `[webhook] Error persistiendo mensaje ${message.id}:`,
              error
            );
          }
        }
      }

      // Estados de entrega (V1: solo registro).
      if (value.statuses) {
        for (const status of value.statuses) {
          console.log(
            `[webhook] Status update: ${status.id} → ${status.status}`,
            status.errors ? JSON.stringify(status.errors) : ""
          );
        }
      }
    }
  }

  return result;
}

/**
 * Fase en background (dentro de `after()`): transcribe audios y dispara el
 * agente. Las conversaciones se procesan en paralelo; dentro de una misma
 * conversación los audios se transcriben en orden y el agente corre una sola
 * vez con el último mensaje, porque su historial ya incluye los anteriores.
 * Nunca lanza.
 */
export async function runWebhookJobs(jobs: WebhookAgentJob[]): Promise<void> {
  const byConversation = new Map<string, WebhookAgentJob[]>();
  for (const job of jobs) {
    const key = `${job.tenantId}:${job.conversationId}`;
    const group = byConversation.get(key);
    if (group) group.push(job);
    else byConversation.set(key, [job]);
  }
  if (!byConversation.size) return;

  const admin = createAdminClient();
  await Promise.allSettled([...byConversation.values()].map(async (group) => {
    try {
      for (const job of group) await transcribeIncomingAudio(admin, job);
      await triggerAgent(admin, group[group.length - 1]);
    } catch (error) {
      console.error(`[webhook] Error procesando conversación ${group[0].conversationId}:`, error);
    }
  }));
}

/** Persiste y procesa el payload completo en un solo paso. Nunca lanza. */
export async function handleWebhookPayload(
  payload: WhatsAppWebhookPayload
): Promise<void> {
  try {
    const { jobs } = await persistWebhookPayload(payload);
    await runWebhookJobs(jobs);
  } catch (error) {
    console.error("[webhook] Error fatal procesando payload:", error);
  }
}

/**
 * Normaliza un teléfono a formato E.164 ("+573001234567").
 * WhatsApp envía los números sin el prefijo "+".
 */
export function normalizePhone(phone: string): string {
  // Limpiar caracteres no numéricos excepto el prefijo "+"
  const cleaned = phone.trim().replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  return `+${cleaned}`;
}

/**
 * Crea u obtiene el cliente del tenant. El upsert con solo `tenant_id`+`phone`
 * preserva el nombre existente (PostgREST actualiza únicamente las columnas
 * provistas). Si viene un nombre distinto, se actualiza por separado.
 *
 * @returns El `id` del cliente.
 */
async function upsertCustomer(
  admin: AdminClient,
  tenantId: string,
  phone: string,
  name?: string | null
): Promise<string> {
  const normalized = normalizePhone(phone);

  const { data: customer, error } = await admin
    .from("customers")
    .upsert(
      { tenant_id: tenantId, phone: normalized },
      { onConflict: "tenant_id,phone" }
    )
    .select("id, name")
    .single();

  if (error || !customer) {
    throw new Error(
      `No se pudo resolver el cliente ${normalized}: ${error?.message ?? "sin datos"}`
    );
  }

  const cleanName = name?.trim();
  if (cleanName && cleanName !== customer.name) {
    await admin
      .from("customers")
      .update({ name: cleanName })
      .eq("id", customer.id);
  }

  return customer.id;
}

/**
 * Persiste un mensaje entrante: idempotencia, resolución de conversación y
 * guardado. Devuelve `null` si el mensaje ya estaba procesado.
 */
async function persistIncomingMessage(
  admin: AdminClient,
  tenantId: string,
  message: WhatsAppMessage,
  phoneNumberId: string,
  accessToken: string | null
): Promise<WebhookAgentJob | null> {
  // 1. Idempotencia (fast path): el índice único en wa_message_id evita duplicados.
  const { data: existing, error: existingError } = await admin
    .from("messages")
    .select("id")
    .eq("wa_message_id", message.id)
    .maybeSingle();

  if (existingError) throw new Error(`Error verificando duplicados: ${existingError.message}`);
  if (existing) {
    console.log(`[webhook] Mensaje ${message.id} ya procesado, omitiendo.`);
    return null;
  }

  // 2. Resolver cliente (garantiza que exista aunque no viniera en contacts).
  const customerId = await upsertCustomer(admin, tenantId, message.from, null);

  // 3. Buscar conversación abierta o crear una nueva.
  const conversationId = await resolveConversation(admin, tenantId, customerId);

  // 4. Persistir el mensaje. Si llega un duplicado en carrera, el índice único
  //    lanza 23505 y lo tratamos como "ya procesado".
  const { data: savedMessage, error } = await admin
    .from("messages")
    .insert({
      tenant_id: tenantId,
      conversation_id: conversationId,
      direction: "inbound",
      sender: "customer",
      type: mapMessageType(message.type),
      body: extractBody(message),
      media_url: extractMediaRef(message),
      wa_message_id: message.id,
      raw: message as unknown as Json,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      console.log(
        `[webhook] Mensaje ${message.id} duplicado (carrera), omitiendo.`
      );
      return null;
    }
    throw new Error(`Error persistiendo mensaje: ${error.message}`);
  }

  // 5. Actualizar last_message_at de la conversación.
  await admin
    .from("conversations")
    .update({ last_message_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", conversationId);

  console.log(
    `[webhook] Mensaje ${savedMessage.id} guardado para tenant ${tenantId} (conversación ${conversationId})`
  );

  return {
    tenantId,
    conversationId,
    customerId,
    customerPhone: message.from,
    messageId: savedMessage.id,
    waMessageId: message.id,
    phoneNumberId,
    audioId: message.type === "audio" ? message.audio?.id ?? null : null,
    accessToken,
  };
}

/**
 * Transcribe el audio antes de disparar el agente para que el transcript esté
 * disponible en el historial. Un fallo no es fatal.
 */
async function transcribeIncomingAudio(admin: AdminClient, job: WebhookAgentJob): Promise<void> {
  if (!job.audioId) return;
  try {
    if (job.accessToken) {
      const { buffer, mimeType } = await downloadMedia(job.audioId, job.accessToken);
      const transcript = await transcribeAudio(buffer, mimeType);
      if (transcript) {
        await admin
          .from("messages")
          .update({ transcript })
          .eq("id", job.messageId);
        console.log(`[webhook] Audio transcrito para mensaje ${job.messageId}`);
      }
    } else {
      console.warn("[webhook] Sin access token para descargar audio, omitiendo transcripción.");
    }
  } catch (error) {
    console.error("[webhook] Audio transcription failed:", error);
    // Non-fatal: continue without transcript
  }
}

/** Dispara el agente vendedor salvo que la conversación esté en handoff. */
async function triggerAgent(admin: AdminClient, job: WebhookAgentJob): Promise<void> {
  const { data: convCheck } = await admin
    .from("conversations")
    .select("status")
    .eq("id", job.conversationId)
    .eq("tenant_id", job.tenantId)
    .maybeSingle();

  if (convCheck?.status === "handoff") {
    console.log(
      `[webhook] Conversación ${job.conversationId} en handoff, omitiendo agente.`
    );
    return;
  }

  // Un fallo del agente NUNCA debe afectar la persistencia del mensaje.
  try {
    await runAgent({
      tenantId: job.tenantId,
      conversationId: job.conversationId,
      customerId: job.customerId,
      customerPhone: job.customerPhone,
      triggerMessageId: job.messageId,
      waMessageId: job.waMessageId,
      sourcePhoneNumberId: job.phoneNumberId,
    });
  } catch (error) {
    console.error("[webhook] Error ejecutando el agente:", error);
  }
}

/**
 * Devuelve la conversación abierta del cliente, o crea una nueva si no existe
 * (o todas están cerradas). Un handoff conserva el mismo hilo y su historial.
 */
async function resolveConversation(
  admin: AdminClient,
  tenantId: string,
  customerId: string
): Promise<string> {
  const { data: openConversation } = await admin
    .from("conversations")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .in("status", ["open", "handoff"])
    .order("status", { ascending: false })
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openConversation) {
    return openConversation.id;
  }

  const { data: created, error } = await admin
    .from("conversations")
    .insert({
      tenant_id: tenantId,
      customer_id: customerId,
      status: "open",
      last_message_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(
      `No se pudo crear la conversación: ${error?.message ?? "sin datos"}`
    );
  }

  return created.id;
}

/**
 * Mapea el tipo de WhatsApp al enum `message_type` del esquema.
 * video → document, sticker → image; el resto no textual → other.
 */
function mapMessageType(type: WhatsAppMessage["type"]): MessageType {
  switch (type) {
    case "text":
      return "text";
    case "audio":
      return "audio";
    case "image":
      return "image";
    case "video":
    case "document":
      return "document";
    case "sticker":
      return "image";
    default:
      // location, contacts, interactive, unknown
      return "other";
  }
}

/** Extrae el cuerpo de texto legible del mensaje, o `null`. */
function extractBody(message: WhatsAppMessage): string | null {
  switch (message.type) {
    case "text":
      return message.text?.body?.trim() || null;
    case "image":
      return message.image?.caption?.trim() || null;
    case "video":
      return message.video?.caption?.trim() || null;
    case "document":
      return (
        message.document?.caption?.trim() ||
        message.document?.filename ||
        null
      );
    case "location": {
      const loc = message.location;
      if (!loc) return null;
      const label = loc.name ? `${loc.name} — ` : "";
      return `${label}${loc.latitude}, ${loc.longitude}`;
    }
    default:
      return null;
  }
}

/**
 * Referencia de media opaca (`wa-media://{id}`). El binario se descarga bajo
 * demanda con `downloadMedia()` de `./send`, ya que la URL real expira.
 */
function extractMediaRef(message: WhatsAppMessage): string | null {
  const id =
    message.image?.id ??
    message.audio?.id ??
    message.video?.id ??
    message.document?.id ??
    message.sticker?.id;
  return id ? `wa-media://${id}` : null;
}
