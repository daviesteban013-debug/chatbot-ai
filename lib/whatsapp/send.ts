/**
 * Biblioteca de envío para la WhatsApp Cloud API de Meta.
 *
 * - Reintentos acotados con backoff exponencial en 5xx y 429 (rate limit).
 * - Lanza `WhatsAppApiError` en errores permanentes (4xx distinto de 429).
 * - Helpers de conveniencia para texto e imagen, y descarga de media entrante.
 */

import type {
  WhatsAppSendPayload,
  WhatsAppSendResponse,
  WhatsAppErrorResponse,
} from "./types";
import { graphBaseUrl } from "./cloud";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const GRAPH_BASE_URL = graphBaseUrl();

/** Límite de caracteres de un mensaje de texto según Meta. */
const TEXT_MAX_LENGTH = 4096;

export interface SendOptions {
  phoneNumberId: string;
  accessToken: string;
}

/** Error estructurado devuelto por la Graph API de WhatsApp. */
export class WhatsAppApiError extends Error {
  constructor(
    public code: number,
    public type: string,
    message: string,
    public fbtraceId?: string
  ) {
    super(message);
    this.name = "WhatsAppApiError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Determina si un código HTTP es reintentable (5xx o 429). */
function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

/** Convierte una respuesta de error de la Graph API en `WhatsAppApiError`. */
async function toApiError(
  status: number,
  response: Response
): Promise<WhatsAppApiError> {
  let message = `WhatsApp API error ${status}`;
  let type = "unknown";
  let code = status;
  let fbtraceId: string | undefined;

  try {
    const body = (await response.json()) as WhatsAppErrorResponse;
    if (body?.error) {
      message = body.error.error_data?.details || body.error.message || message;
      type = body.error.type ?? type;
      code = body.error.code ?? code;
      fbtraceId = body.error.fbtrace_id;
    }
  } catch {
    // El cuerpo no era JSON válido; usamos el mensaje por defecto.
  }

  return new WhatsAppApiError(code, type, message, fbtraceId);
}

/**
 * Envía un mensaje vía WhatsApp Cloud API.
 * Reintenta en 5xx y 429 con backoff exponencial (1s, 2s, 4s...).
 * Lanza `WhatsAppApiError` en errores permanentes o al agotar los reintentos.
 */
export async function sendWhatsAppMessage(
  payload: WhatsAppSendPayload,
  options: SendOptions
): Promise<WhatsAppSendResponse> {
  const url = `${GRAPH_BASE_URL}/${options.phoneNumberId}/messages`;
  const body = JSON.stringify(payload);

  let lastError: unknown = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.accessToken}`,
          "Content-Type": "application/json",
        },
        body,
      });

      if (response.ok) {
        return (await response.json()) as WhatsAppSendResponse;
      }

      const apiError = await toApiError(response.status, response);

      // Error permanente (4xx que no es rate limit): no reintentar.
      if (!isRetryableStatus(response.status)) {
        throw apiError;
      }

      // Reintentable: guardar y esperar con backoff exponencial.
      lastError = apiError;
      if (attempt < MAX_RETRIES - 1) {
        await sleep(BASE_DELAY_MS * Math.pow(2, attempt));
      }
    } catch (error) {
      // Los `WhatsAppApiError` permanentes se relanzan de inmediato.
      if (error instanceof WhatsAppApiError) {
        throw error;
      }
      // Error de red/timeout: reintentable.
      lastError = error;
      if (attempt < MAX_RETRIES - 1) {
        await sleep(BASE_DELAY_MS * Math.pow(2, attempt));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new WhatsAppApiError(0, "unknown", "WhatsApp send failed after retries");
}

/** Conveniencia: enviar un mensaje de texto. */
export async function sendText(
  to: string,
  text: string,
  options: SendOptions
): Promise<WhatsAppSendResponse> {
  const payload: WhatsAppSendPayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body: text.slice(0, TEXT_MAX_LENGTH) },
  };
  return sendWhatsAppMessage(payload, options);
}

/** Conveniencia: enviar una imagen a partir de una URL pública. */
export async function sendImage(
  to: string,
  imageUrl: string,
  caption: string | undefined,
  options: SendOptions
): Promise<WhatsAppSendResponse> {
  const payload: WhatsAppSendPayload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "image",
    image: caption ? { link: imageUrl, caption } : { link: imageUrl },
  };
  return sendWhatsAppMessage(payload, options);
}

/**
 * Marca un mensaje entrante como leído (doble check azul en el cliente).
 * Es una operación best-effort: si falla no lanza, solo registra el error,
 * porque no debe bloquear la respuesta del agente.
 */
export async function markAsRead(
  messageId: string,
  options: SendOptions
): Promise<void> {
  const url = `${GRAPH_BASE_URL}/${options.phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    }),
  });
  if (!res.ok) {
    // No lanzamos — marcar como leído es best-effort.
    console.error(`[whatsapp] No se pudo marcar como leído: ${res.status}`);
  }
}

/**
 * Descarga media desde los servidores de WhatsApp.
 * Paso 1: `GET /{media_id}` para obtener la URL real.
 * Paso 2: descargar el archivo desde esa URL.
 */
export async function downloadMedia(
  mediaId: string,
  accessToken: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  // Paso 1: metadata del media (URL + mime_type).
  const metaResponse = await fetch(`${GRAPH_BASE_URL}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!metaResponse.ok) {
    throw await toApiError(metaResponse.status, metaResponse);
  }

  const meta = (await metaResponse.json()) as { url: string; mime_type: string };
  if (!meta?.url) {
    throw new WhatsAppApiError(
      0,
      "unknown",
      `Media metadata sin URL para el id ${mediaId}`
    );
  }

  // Paso 2: descargar el binario desde la URL firmada.
  const fileResponse = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!fileResponse.ok) {
    throw await toApiError(fileResponse.status, fileResponse);
  }

  const arrayBuffer = await fileResponse.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: meta.mime_type ?? "application/octet-stream",
  };
}

/**
 * Comprueba si estamos dentro de la ventana de servicio de 24h.
 * La ventana abre cuando el cliente envía un mensaje y cierra 24h después.
 * Fuera de la ventana solo se pueden enviar plantillas aprobadas (HSM).
 */
export function isWithinServiceWindow(lastInboundAt: Date): boolean {
  const hoursSinceLastMessage =
    (Date.now() - lastInboundAt.getTime()) / (1000 * 60 * 60);
  return hoursSinceLastMessage < 24;
}
