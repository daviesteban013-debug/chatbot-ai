/**
 * Utilidades de verificación del webhook de WhatsApp Cloud API (Meta).
 *
 * - `verifyWebhookSignature`: valida el header `X-Hub-Signature-256` (HMAC SHA-256)
 *   de los POST usando el `WHATSAPP_APP_SECRET`.
 * - `verifyWebhookToken`: valida el handshake de suscripción (GET).
 */

import crypto from "node:crypto";

const SIGNATURE_PREFIX = "sha256=";

/**
 * Verifica el header `X-Hub-Signature-256` que Meta adjunta a cada POST.
 * Devuelve `true` solo si la firma coincide con el payload, usando una
 * comparación constante en tiempo para evitar timing attacks.
 *
 * @param payload    Body crudo del request (string o Buffer).
 * @param signature  Valor del header, p. ej. `"sha256=abc123..."`.
 * @param appSecret  Secreto de la app de Meta (`WHATSAPP_APP_SECRET`).
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  appSecret: string
): boolean {
  if (!signature.startsWith(SIGNATURE_PREFIX)) return false;

  const expected = crypto
    .createHmac("sha256", appSecret)
    .update(payload)
    .digest("hex");
  const received = signature.slice(SIGNATURE_PREFIX.length);

  // `timingSafeEqual` lanza si los buffers miden distinto; comparamos antes.
  if (expected.length !== received.length) return false;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(received, "utf8")
    );
  } catch {
    return false;
  }
}

/**
 * Verifica el challenge de suscripción del webhook (GET).
 *
 * @param mode         Valor de `hub.mode` (debe ser `"subscribe"`).
 * @param token        Valor de `hub.verify_token` enviado por Meta.
 * @param verifyToken  Token configurado (`WHATSAPP_VERIFY_TOKEN`).
 * @returns `null` si es válido (el caller debe responder el `hub.challenge`),
 *          o `"invalid"` en caso contrario.
 */
export function verifyWebhookToken(
  mode: string | undefined,
  token: string | undefined,
  verifyToken: string
): string | null {
  if (mode === "subscribe" && token === verifyToken) {
    return null; // Válido — el caller debe devolver el challenge.
  }
  return "invalid";
}
