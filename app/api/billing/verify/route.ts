import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/auth";
import { sameOrigin } from "@/lib/billing/origin";
import { BillingError, applyPayment, syncPreapproval } from "@/lib/mercadopago/billing";

export const runtime = "nodejs";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
const ID = /^[\w-]{1,64}$/;

/**
 * Called when the owner returns from Mercado Pago. The ids in the return URL are only
 * hints: the payment or subscription is re-read from Mercado Pago and must belong to
 * this business before anything is recorded.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Origen no permitido." }, 403);
  const tenant = await getCurrentTenant();
  if (!tenant) return json({ error: "Inicia sesión." }, 401);
  if (tenant.role !== "owner") return json({ error: "Solo el propietario puede verificar el pago." }, 403);
  const body = await request.json().catch(() => null);
  const paymentId = typeof body?.paymentId === "string" && ID.test(body.paymentId) ? body.paymentId : null;
  const preapprovalId = typeof body?.preapprovalId === "string" && ID.test(body.preapprovalId) ? body.preapprovalId : null;
  if (!paymentId && !preapprovalId) return json({ error: "Pago inválido." }, 400);
  try {
    if (preapprovalId) {
      const result = await syncPreapproval(preapprovalId, tenant.tenantId);
      if (!result.ok) return json({ error: "No encontramos esta suscripción en tu negocio." }, 404);
    }
    if (paymentId) {
      const result = await applyPayment(paymentId, tenant.tenantId);
      if (!result.ok && result.reason === "plan_conflict") return json({ error: "Recibimos el pago, pero tu negocio ya tiene otro plan vigente. Lo revisaremos y te contactaremos." }, 409);
      if (!result.ok) return json({ error: "No encontramos este pago en tu negocio." }, 404);
    }
    return json({ verified: true });
  } catch (error) {
    if (error instanceof BillingError && error.status === 403) return json({ error: error.message }, 403);
    return json({ error: "No se pudo verificar el pago. No vuelvas a pagar; inténtalo de nuevo en unos minutos." }, 503);
  }
}
