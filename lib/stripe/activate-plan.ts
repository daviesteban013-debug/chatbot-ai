import type Stripe from "stripe";
import { plans, planTotal } from "@/lib/plans";
import { getStripe } from "@/lib/stripe/server";
import { stripeMode } from "@/lib/stripe/config";
import { assertBillingMode, billingDatabase } from "@/lib/stripe/billing";

export type ActivationResult =
  | { ok: true; planId: string; alreadyActive: boolean }
  | { ok: false; reason: string };

export async function activatePlanFromSubscription(subscription: Stripe.Subscription, tenantId: string): Promise<ActivationResult> {
  if (!["active", "trialing"].includes(subscription.status)) return { ok: false, reason: "La suscripción aún no está activa." };
  if (subscription.metadata.tenant_id !== tenantId || subscription.livemode !== (stripeMode() === "live"))
    return { ok: false, reason: "La suscripción pertenece a otro negocio o entorno." };
  await assertBillingMode();
  const item = subscription.items.data[0];
  const price = item?.price;
  const plan = plans.find(p => p.id === price?.metadata.planId);
  const annual = price?.recurring?.interval === "year";
  if (subscription.items.data.length !== 1 || !plan || item.quantity !== 1 || price.currency !== "usd"
    || price.product !== `prod_${plan.id}`
    || price.unit_amount !== planTotal(plan, annual) * 100 || price.recurring?.interval_count !== 1
    || !["month", "year"].includes(price.recurring.interval))
    return { ok: false, reason: "El precio no corresponde a un plan disponible." };
  const endsAt = item.current_period_end;
  if (!Number.isFinite(endsAt) || endsAt * 1000 <= Date.now()) return { ok: false, reason: "El periodo de la suscripción no está vigente." };
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const db = billingDatabase();
  const { data: account, error: accountError } = await db.from("billing_accounts").select("customer_id,subscription_id")
    .eq("tenant_id", tenantId).eq("mode", stripeMode()).maybeSingle();
  if (accountError || !account || account.customer_id !== customerId) return { ok: false, reason: "No se pudo verificar la cuenta de pagos." };
  if (account.subscription_id && account.subscription_id !== subscription.id) {
    const previous = await getStripe().subscriptions.retrieve(account.subscription_id);
    if (!["canceled", "incomplete_expired"].includes(previous.status) || previous.created >= subscription.created)
      return { ok: false, reason: "El negocio tiene otra suscripción vigente." };
  }
  const { data: tenant, error: tenantError } = await db.from("tenants").select("stripe_subscription_id,plan_paid_at").eq("id", tenantId).single();
  if (tenantError) return { ok: false, reason: "No se pudo verificar el negocio." };
  const { error: accountSaveError } = await db.from("billing_accounts").update({ subscription_id: subscription.id })
    .eq("tenant_id", tenantId).eq("mode", stripeMode()).select("tenant_id").single();
  if (accountSaveError) return { ok: false, reason: "No se pudo guardar la suscripción." };
  const alreadyActive = tenant.stripe_subscription_id === subscription.id;
  const { error } = await db.from("tenants").update({
    plan: plan.id, plan_period: annual ? "annual" : "monthly",
    plan_paid_at: alreadyActive ? tenant.plan_paid_at : new Date().toISOString(),
    stripe_subscription_id: subscription.id, stripe_customer_id: customerId, stripe_mode: stripeMode(),
    stripe_subscription_status: subscription.status, stripe_current_period_end: new Date(endsAt * 1000).toISOString(),
  }).eq("id", tenantId).select("id").single();
  return error ? { ok: false, reason: "No se pudo activar el plan." } : { ok: true, planId: plan.id, alreadyActive };
}

/** Always receives the current subscription from Stripe, never an old event snapshot. */
export async function synchronizeSubscription(subscription: Stripe.Subscription): Promise<ActivationResult | null> {
  if (subscription.livemode !== (stripeMode() === "live")) return null;
  const tenantId = subscription.metadata.tenant_id;
  if (!tenantId) return null; // Legacy anonymous subscriptions cannot be claimed by knowing an ID.
  await assertBillingMode();
  if (["active", "trialing"].includes(subscription.status)) return activatePlanFromSubscription(subscription, tenantId);
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const db = billingDatabase();
  const { data: account, error } = await db.from("billing_accounts").select("customer_id,subscription_id")
    .eq("tenant_id", tenantId).eq("mode", stripeMode()).maybeSingle();
  if (error) return { ok: false, reason: "No se pudo verificar la suscripción." };
  if (!account || account.customer_id !== customerId || account.subscription_id !== subscription.id) return null;
  const { error: updateError } = await db.from("tenants").update({ stripe_subscription_status: subscription.status })
    .eq("id", tenantId).eq("stripe_subscription_id", subscription.id).eq("stripe_mode", stripeMode());
  return updateError ? { ok: false, reason: "No se pudo actualizar el plan." } : null;
}
