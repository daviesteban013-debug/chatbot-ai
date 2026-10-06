import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/auth";
import { plans } from "@/lib/plans";
import { getStripe } from "@/lib/stripe/server";
import { billingOrigin, sameOrigin, stripeMode } from "@/lib/stripe/config";
import { assertBillingMode, billingAccount, billingDatabase, currentSubscription } from "@/lib/stripe/billing";
import { getOrCreateStripePrice } from "@/lib/stripe/sync-plan";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Inicia sesión para elegir tu plan." }, { status: 401 });
  if (tenant.role !== "owner") return NextResponse.json({ error: "Solo el propietario puede gestionar los pagos." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const plan = plans.find(p => p.id === body?.planId);
  if ((!plan && body?.action !== "discard") || (body?.action !== "discard" && typeof body?.annual !== "boolean")) return NextResponse.json({ error: "Plan o periodo inválido." }, { status: 400 });
  try {
    await assertBillingMode();
    const account = await billingAccount(tenant);
    const stripe = getStripe();
    if (body.action === "discard") {
      const sessions = await stripe.checkout.sessions.list({ customer: account.customer_id, status: "open", limit: 100 });
      for (const session of sessions.data) await stripe.checkout.sessions.expire(session.id);
      const { error } = await billingDatabase().from("billing_accounts").update({ checkout_expires_at: null })
        .eq("tenant_id", tenant.tenantId).eq("mode", stripeMode());
      if (error) throw new Error("No se pudo liberar el pago pendiente.");
      return NextResponse.json({ discarded: true });
    }
    if (!plan) return NextResponse.json({ error: "Plan inválido." }, { status: 400 });
    if (await currentSubscription(account.customer_id)) return NextResponse.json({ error: "Ya tienes una suscripción. Gestiona el plan desde el portal de pagos." }, { status: 409 });
    const open = await stripe.checkout.sessions.list({ customer: account.customer_id, status: "open", limit: 100 });
    const reusable = open.data.find(s => s.metadata?.planId === plan.id && s.metadata?.period === (body.annual ? "annual" : "monthly"));
    if (reusable?.url) return NextResponse.json({ url: reusable.url }, { headers: { "Cache-Control": "no-store" } });
    if (open.data.length) return NextResponse.json({ error: "Hay un pago pendiente. Complétalo antes de elegir otro plan, o espera 30 minutos a que expire." }, { status: 409 });
    const { data: attempt, error } = await billingDatabase().rpc("claim_billing_checkout", {
      p_tenant_id: tenant.tenantId, p_mode: stripeMode(), p_plan: plan.id, p_annual: body.annual,
    });
    if (error) throw new Error("No se pudo reservar el pago.");
    if (!attempt.ok) return NextResponse.json({ error: "Hay otro pago pendiente. Descártalo antes de cambiar de plan." }, { status: 409 });
    const price = await getOrCreateStripePrice(plan, body.annual);
    const metadata = { tenant_id: tenant.tenantId, planId: plan.id, period: body.annual ? "annual" : "monthly" };
    const session = await stripe.checkout.sessions.create({
      mode: "subscription", customer: account.customer_id, client_reference_id: tenant.tenantId,
      line_items: [{ price, quantity: 1 }], allowed_payment_method_types: ["card"],
      subscription_data: { metadata }, metadata, locale: "es", expires_at: attempt.expiresAt,
      success_url: `${billingOrigin()}/dashboard/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${billingOrigin()}/dashboard/billing?checkout=canceled`,
    }, { idempotencyKey: `nexo-checkout-${attempt.attempt}` });
    if (!session.url) throw new Error("Checkout no disponible.");
    return NextResponse.json({ url: session.url }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "No se pudo abrir el pago. Inténtalo de nuevo en unos minutos." }, { status: 503 });
  }
}
