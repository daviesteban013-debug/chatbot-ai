/**
 * Tipos canónicos del webhook y del envío de WhatsApp Cloud API (Meta).
 * Basado en la documentación oficial:
 * https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 *
 * Todos los nombres van prefijados con `WhatsApp*` para evitar colisiones.
 */

// ---------- Webhook (entrada) ----------

/** Query params del handshake de verificación (GET). */
export interface WhatsAppWebhookVerifyQuery {
  "hub.mode": string;
  "hub.verify_token": string;
  "hub.challenge": string;
}

/** Payload completo que Meta envía al webhook (POST). */
export interface WhatsAppWebhookPayload {
  object: string;
  entry: WhatsAppEntry[];
}

export interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

export interface WhatsAppChange {
  value: WhatsAppValue;
  field: string;
}

export interface WhatsAppValue {
  messaging_product: string;
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  contacts?: WhatsAppContact[];
  messages?: WhatsAppMessage[];
  statuses?: WhatsAppStatus[];
}

export interface WhatsAppContact {
  profile: { name: string };
  /** Número de teléfono del contacto (sin el prefijo "+"). */
  wa_id: string;
}

export interface WhatsAppMessage {
  /** Teléfono del remitente, p. ej. "573001234567". */
  from: string;
  /** ID del mensaje; se usa como `wa_message_id` para idempotencia. */
  id: string;
  timestamp: string;
  type:
    | "text"
    | "image"
    | "audio"
    | "video"
    | "document"
    | "sticker"
    | "location"
    | "contacts"
    | "interactive"
    | "unknown";
  text?: { body: string };
  image?: { id: string; mime_type: string; sha256: string; caption?: string };
  audio?: { id: string; mime_type: string; sha256: string };
  video?: { id: string; mime_type: string; sha256: string; caption?: string };
  document?: {
    id: string;
    mime_type: string;
    sha256: string;
    filename: string;
    caption?: string;
  };
  sticker?: { id: string; mime_type: string; sha256: string; animated?: boolean };
  location?: {
    latitude: number;
    longitude: number;
    name?: string;
    address?: string;
  };
  contacts?: unknown[];
  interactive?: unknown;
  /** Presente cuando el mensaje es respuesta a otro. */
  context?: { from: string; id: string };
}

export interface WhatsAppStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
  errors?: { code: number; title: string; message: string }[];
}

// ---------- Outgoing (envío) ----------

export interface WhatsAppSendTextPayload {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "text";
  text: { preview_url?: boolean; body: string };
}

export interface WhatsAppSendImagePayload {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "image";
  image: { link: string; caption?: string } | { id: string; caption?: string };
}

export type WhatsAppSendPayload =
  | WhatsAppSendTextPayload
  | WhatsAppSendImagePayload;

export interface WhatsAppSendResponse {
  messaging_product: string;
  contacts: { input: string; wa_id: string }[];
  messages: { id: string; message_status: string }[];
}

export interface WhatsAppErrorResponse {
  error: {
    message: string;
    type: string;
    code: number;
    error_data?: { messaging_product: string; details: string };
    error_subcode?: number;
    fbtrace_id: string;
  };
}
