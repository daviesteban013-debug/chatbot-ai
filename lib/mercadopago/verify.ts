import crypto from "node:crypto";

/**
 * Valida el header `x-signature` (`ts=…,v1=…`) de las notificaciones de Mercado Pago.
 * Manifiesto oficial: `id:{data.id};request-id:{x-request-id};ts:{ts};`, con `data.id`
 * de la URL en minúsculas; las partes ausentes se omiten. HMAC-SHA256 en hex.
 */
export function verifyMercadoPagoSignature(params: {
  signature: string | null; requestId: string | null; dataId: string | null; secret: string;
}): boolean {
  if (!params.signature || !params.secret) return false;
  const parts = Object.fromEntries(params.signature.split(",").map(part => {
    const [key, ...value] = part.split("=");
    return [key.trim(), value.join("=").trim()];
  }));
  const ts = parts.ts, received = parts.v1;
  if (!ts || !/^\d{1,16}$/.test(ts) || !received || !/^[0-9a-f]{64}$/i.test(received)) return false;
  const manifest = `${params.dataId ? `id:${params.dataId.toLowerCase()};` : ""}${params.requestId ? `request-id:${params.requestId};` : ""}ts:${ts};`;
  const expected = crypto.createHmac("sha256", params.secret).update(manifest).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(received.toLowerCase(), "utf8"));
}
