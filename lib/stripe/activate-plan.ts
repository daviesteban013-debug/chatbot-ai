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
  const { data: existing } = await db
    .from("tenants")
    .select("id")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();

  if (existing) {
    return existing.id === tenantId
      ? { ok: true, planId, alreadyActive: true }
      : { ok: false, reason: "Esta suscripción ya está asignada a otro negocio." };
  }

  // Activar el plan en el tenant
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  
  const { error } = await db
    .from("tenants")
    .update({
      plan: planId,
      plan_period: period,
      plan_paid_at: new Date().toISOString(),
      stripe_subscription_id: subscription.id,
      stripe_customer_id: customerId,
    })
    .eq("id", tenantId);

  if (error) return { ok: false, reason: error.message };

  return { ok: true, planId, alreadyActive: false };
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
