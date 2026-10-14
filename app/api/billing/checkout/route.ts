import { NextResponse } from "next/server";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth";
import { plans } from "@/lib/plans";
import { sameOrigin } from "@/lib/billing/origin";
import { BillingError, createCheckout } from "@/lib/mercadopago/billing";

export const runtime = "nodejs";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
const dateLabel = (value?: string) => value ? new Date(value).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "long" }) : "que termine tu periodo";

/** Opens Mercado Pago for the owner. Plan, amount and business are resolved on the server. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return json({ error: "Origen no permitido." }, 403);
  const [user, tenant] = await Promise.all([getCurrentUser(), getCurrentTenant()]);
  if (!user || user.is_anonymous || !tenant) return json({ error: "Inicia sesión para elegir tu plan." }, 401);
  if (tenant.role !== "owner") return json({ error: "Solo el propietario puede gestionar los pagos." }, 403);
  if (!user.email) return json({ error: "Tu cuenta necesita un correo para pagar con Mercado Pago." }, 409);
  const body = await request.json().catch(() => null);
  const plan = plans.find(p => p.id === body?.planId);
  if (!plan || typeof body?.annual !== "boolean" || !["subscription", "one_time"].includes(body?.kind))
    return json({ error: "Plan, periodo o forma de pago inválidos." }, 400);
  try {
    const result = await createCheckout({ tenantId: tenant.tenantId, userId: user.id, email: user.email, plan, annual: body.annual, kind: body.kind });
    if (result.ok) return json({ url: result.url });
    if (result.reason === "subscribed") return json({ error: "Ya tienes una suscripción automática activa. Cancélala en Planes y pagos antes de cambiarla." }, 409);
    if (result.reason === "plan_change") return json({ error: `Tu plan actual sigue vigente hasta ${dateLabel(result.activeUntil)}. Podrás elegir otro plan cuando termine, o renovar el mismo.` }, 409);
    return json({ error: "No se pudo abrir el pago." }, 409);
  } catch (error) {
    return json({ error: error instanceof BillingError && error.status < 500 ? error.message : "No se pudo abrir el pago. Inténtalo de nuevo en unos minutos." }, 503);
  }
}
