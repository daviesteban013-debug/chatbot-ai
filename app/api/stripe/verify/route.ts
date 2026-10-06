import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/auth";
import { getStripe } from "@/lib/stripe/server";
import { sameOrigin, stripeMode } from "@/lib/stripe/config";
import { billingAccount } from "@/lib/stripe/billing";
import { synchronizeSubscription } from "@/lib/stripe/activate-plan";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Inicia sesión." }, { status: 401 });
  if (tenant.role !== "owner") return NextResponse.json({ error: "Solo el propietario puede verificar el pago." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (typeof body?.sessionId !== "string" || !/^cs_(test_|live_)?[a-zA-Z0-9]{10,256}$/.test(body.sessionId)) return NextResponse.json({ error: "Pago inválido." }, { status: 400 });
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(body.sessionId);
    const account = await billingAccount(tenant);
    if (session.customer !== account.customer_id || session.client_reference_id !== tenant.tenantId
      || session.livemode !== (stripeMode() === "live")) return NextResponse.json({ error: "Este pago no pertenece a tu negocio." }, { status: 403 });
    if (session.status !== "complete" || session.payment_status !== "paid" || typeof session.subscription !== "string")
      return NextResponse.json({ error: "El pago todavía no está confirmado." }, { status: 409 });
    const result = await synchronizeSubscription(await stripe.subscriptions.retrieve(session.subscription));
    if (!result?.ok) throw new Error("Activación pendiente.");
    return NextResponse.json({ verified: true });
  } catch {
    return NextResponse.json({ error: "No se pudo verificar el pago. No vuelvas a pagar; inténtalo de nuevo." }, { status: 503 });
  }
}
