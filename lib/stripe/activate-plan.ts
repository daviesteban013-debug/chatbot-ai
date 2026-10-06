import type Stripe from "stripe";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { plans } from "@/lib/plans";
import { getStripe } from "@/lib/stripe/server";

function adminUntyped() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export type ActivationResult =
  | { ok: true; planId: string; alreadyActive: boolean }
  | { ok: false; reason: string };

/**
 * Activa el plan de un tenant a partir de una Suscripción de Stripe.
 *
 * `tenantId` es el tenant que reclama la suscripción.
 */
export async function activatePlanFromSubscription(
  subscription: Stripe.Subscription,
  tenantId: string
): Promise<ActivationResult> {
  // Las suscripciones en proceso de pago tienen estatus "incomplete"
  if (subscription.status !== "active") return { ok: false, reason: "La suscripción aún no está activa o el pago falló." };

  const planId = subscription.metadata.planId;
  const period = subscription.metadata.period === "annual" ? "annual" : "monthly";
  if (!plans.some((p) => p.id === planId)) return { ok: false, reason: "Plan desconocido en la suscripción." };

  const owner = subscription.metadata.tenant_id;
  if (owner && owner !== tenantId) return { ok: false, reason: "Esta suscripción pertenece a otro negocio." };

  const db = adminUntyped();

  // Verificar si la suscripción ya está en uso
  const { data: existing, error: lookupError } = await db
    .from("tenants")
    .select("id, plan_paid_at")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();

  if (lookupError) return { ok: false, reason: lookupError.message };

  if (existing && existing.id !== tenantId)
    return { ok: false, reason: "Esta suscripción ya está asignada a otro negocio." };

  const endsAt = Math.min(...subscription.items.data.map(item => item.current_period_end));
  if (!Number.isFinite(endsAt) || endsAt * 1000 <= Date.now()) return { ok: false, reason: "El periodo de la suscripción no está vigente." };

  // Activar el plan en el tenant
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  
  const { error } = await db
    .from("tenants")
    .update({
      plan: planId,
      plan_period: period,
      plan_paid_at: existing?.plan_paid_at ?? new Date().toISOString(),
      stripe_subscription_id: subscription.id,
      stripe_customer_id: customerId,
      stripe_subscription_status: subscription.status,
      stripe_current_period_end: new Date(endsAt * 1000).toISOString(),
    })
    .eq("id", tenantId).select("id").single();

  if (error) return { ok: false, reason: error.message };

  return { ok: true, planId, alreadyActive: Boolean(existing) };
}

/** Called with a subscription freshly retrieved from Stripe, so delayed events
 * cannot restore an expired paid allowance or overwrite a later plan change. */
export async function synchronizeSubscription(subscription: Stripe.Subscription): Promise<ActivationResult | null> {
  const db = adminUntyped();
  const { data: existing, error } = await db.from("tenants").select("id")
    .eq("stripe_subscription_id", subscription.id).maybeSingle();
  if (error) return { ok: false, reason: error.message };
  const tenantId = existing?.id ?? subscription.metadata.tenant_id;
  if (!tenantId) return null; // An anonymous purchase is assigned when its authenticated owner claims it.
  if (!existing) {
    const { data: target, error: targetError } = await db.from("tenants").select("stripe_subscription_id")
      .eq("id", tenantId).maybeSingle();
    if (targetError || !target) return { ok: false, reason: "No se pudo verificar el negocio de la suscripción." };
    // A delayed event for an old subscription cannot replace the current one.
    // Switching to a different subscription uses the explicit authenticated claim.
    if (target.stripe_subscription_id && target.stripe_subscription_id !== subscription.id) return null;
  }
  if (subscription.status === "active") return activatePlanFromSubscription(subscription, tenantId);
  const { error: updateError } = await db.from("tenants").update({ stripe_subscription_status: subscription.status })
    .eq("id", tenantId).eq("stripe_subscription_id", subscription.id);
  return updateError ? { ok: false, reason: updateError.message } : null;
}

/** Recupera la suscripción desde Stripe (fuente de verdad) y activa el plan. */
export async function claimSubscription(subscriptionId: string, tenantId: string): Promise<ActivationResult> {
  try {
    const sub = await getStripe().subscriptions.retrieve(subscriptionId);
    return await activatePlanFromSubscription(sub, tenantId);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "No se pudo recuperar la suscripción." };
  }
}
