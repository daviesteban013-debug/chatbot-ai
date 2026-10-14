export type BillingMode = "test" | "live";

/** Test and production access tokens share the APP_USR- prefix, so the mode is explicit. */
export function mercadoPagoMode(): BillingMode {
  const mode = process.env.MERCADOPAGO_MODE ?? "test";
  if (mode !== "test" && mode !== "live") throw new Error("Modo de pagos inválido.");
  return mode;
}

export class MercadoPagoError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

/** Minimal REST client: server-only token, idempotent writes and a bounded wait. */
export async function mercadoPago<T>(path: string, init: { method?: "GET" | "POST" | "PUT"; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!token) throw new MercadoPagoError(503, "Mercado Pago no está configurado.");
  const method = init.method ?? "GET";
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    method, cache: "no-store", signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${token}`, Accept: "application/json",
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(method === "GET" ? {} : { "X-Idempotency-Key": init.idempotencyKey ?? crypto.randomUUID() }),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!response.ok) throw new MercadoPagoError(response.status, `Mercado Pago respondió ${response.status}.`);
  return await response.json() as T;
}
