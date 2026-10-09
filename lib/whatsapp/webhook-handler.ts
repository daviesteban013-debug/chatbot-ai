/**
 * Procesamiento en background del payload del webhook de WhatsApp.
 *
 * Se invoca desde `after()` en `app/api/whatsapp/route.ts`, fuera del ciclo de
 * vida del request (ya respondimos 200 a Meta). Usa el cliente service-role
 * porque no hay sesión de usuario.
 *
 * Responsabilidades:
 *  - Resolver el tenant a partir del `phone_number_id`.
 *  - Crear/actualizar el cliente (teléfono normalizado a E.164).
 *  - Buscar o crear la conversación abierta.
 *  - Persistir el mensaje entrante de forma idempotente (`wa_message_id`).
 *  - Actualizar `conversations.last_message_at`.
 *  - Disparar el agente vendedor (integración de Fase 3).
 *
 * Nunca lanza: ya respondimos 200 y un fallo no debe provocar reintentos de Meta.
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
  WhatsAppValue,
} from "./types";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Código de error de Postgres para violación de restricción única. */
const UNIQUE_VIOLATION = "23505";

/**
 * Procesa el payload completo del webhook. Recorre entries y changes, resolviendo
 * el tenant por `phone_number_id` y delegando cada mensaje. Los fallos individuales
 * no bloquean el resto del payload.
 */
export async function handleWebhookPayload(
  payload: WhatsAppWebhookPayload
): Promise<void> {
  try {
    if (payload.object !== "whatsapp_business_account") {
      return;
    }

    const admin = createAdminClient();

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        if (change.field !== "messages") continue;

        const value = change.value;
        const phoneNumberId = value.metadata.phone_number_id;

        // Resolver tenant por phone_number_id (constraint único en whatsapp_accounts).
        const { data: waAccount } = await admin
          .from("whatsapp_accounts")
          .select("tenant_id")
          .eq("phone_number_id", phoneNumberId)
          .maybeSingle();

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
              await processIncomingMessage(admin, tenantId, message, value, waAccessToken);
            } catch (error) {
              console.error(
                `[webhook] Error procesando mensaje ${message.id}:`,
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
 * Procesa un mensaje entrante: idempotencia, resolución de conversación,
 * persistencia, transcripción de audio y disparo del agente.
 */
async function processIncomingMessage(
  admin: AdminClient,
  tenantId: string,
  message: WhatsAppMessage,
  _value: WhatsAppValue,
  accessToken: string | null
): Promise<void> {
  // 1. Idempotencia (fast path): el índice único en wa_message_id evita duplicados.
  const { data: existing } = await admin
    .from("messages")
    .select("id")
    .eq("wa_message_id", message.id)
    .maybeSingle();

  if (existing) {
    console.log(`[webhook] Mensaje ${message.id} ya procesado, omitiendo.`);
    return;
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
      return;
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

  // 6. Transcripción de audio (antes de disparar el agente para que el
  //    transcript esté disponible en el historial).
  if (message.type === "audio" && message.audio?.id) {
    try {
      if (accessToken) {
        const { buffer, mimeType } = await downloadMedia(message.audio.id, accessToken);
        const transcript = await transcribeAudio(buffer, mimeType);
        if (transcript) {
          await admin
            .from("messages")
            .update({ transcript })
            .eq("id", savedMessage.id);
          console.log(`[webhook] Audio transcrito para mensaje ${savedMessage.id}`);
        }
      } else {
        console.warn("[webhook] Sin access token para descargar audio, omitiendo transcripción.");
      }
    } catch (error) {
      console.error("[webhook] Audio transcription failed:", error);
      // Non-fatal: continue without transcript
    }
  }

  // 7. Verificar que la conversación no esté en handoff antes de disparar el agente.
  const { data: convCheck } = await admin
    .from("conversations")
    .select("status")
    .eq("id", conversationId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (convCheck?.status === "handoff") {
    console.log(
      `[webhook] Conversación ${conversationId} en handoff, omitiendo agente.`
    );
    return;
  }

  // 8. Disparar el agente vendedor. Un fallo del agente NUNCA debe afectar la
  //    persistencia del mensaje, por eso va en su propio try/catch.
  try {
    await runAgent({
      tenantId,
      conversationId,
      customerId,
      customerPhone: message.from,
      triggerMessageId: savedMessage.id,
      waMessageId: message.id,
      sourcePhoneNumberId: _value.metadata.phone_number_id,
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
