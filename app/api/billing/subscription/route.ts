import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/auth";
import { sameOrigin } from "@/lib/billing/origin";
import { BillingError, cancelSubscription } from "@/lib/mercadopago/billing";

export const runtime = "nodejs";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

/** Cancels the automatic subscription. The paid period stays available until it ends. */
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Origen no permitido." }, 403);
  const tenant = await getCurrentTenant();
  if (!tenant) return json({ error: "Inicia sesión." }, 401);
  if (tenant.role !== "owner") return json({ error: "Solo el propietario puede cancelar la suscripción." }, 403);
  try {
    await cancelSubscription(tenant.tenantId);
    return json({ canceled: true });
  } catch (error) {
    if (error instanceof BillingError && error.status === 409) return json({ error: error.message }, 409);
    return json({ error: "No se pudo cancelar la suscripción. Inténtalo de nuevo en unos minutos." }, 503);
  }
}
