import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/server";
import { plans } from "@/lib/plans";
import { getCurrentTenant } from "@/lib/auth";
import { getOrCreateStripePrice } from "@/lib/stripe/sync-plan";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function adminUntyped() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * Crea una Subscription en lugar de un PaymentIntent aislado.
 * Los usuarios pueden estar o no autenticados en este punto (viajarán luego a Jarvis).
 */
export async function POST(request: Request) {
  let body: { planId?: string; annual?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  const plan = plans.find((p) => p.id === body.planId);
  if (!plan) return NextResponse.json({ error: "Plan no encontrado." }, { status: 400 });
  const annual = body.annual === true;

  try {
    const tenantContext = await getCurrentTenant().catch(() => null);
    const tenantId = tenantContext?.tenantId;
    const stripe = getStripe();
    const db = adminUntyped();

    let customerId: string | undefined = undefined;

    // Si hay un tenant, buscar su customer_id en la BD o crear uno
    if (tenantId) {
      const { data } = await db.from("tenants").select("name, stripe_customer_id").eq("id", tenantId).maybeSingle();
      if (data?.stripe_customer_id) {
        customerId = data.stripe_customer_id;
      } else {
        const customer = await stripe.customers.create({
          name: data?.name,
          metadata: { tenant_id: tenantId },
        });
        customerId = customer.id;
        await db.from("tenants").update({ stripe_customer_id: customerId }).eq("id", tenantId);
      }
    } else {
      // Si el usuario no ha hecho login/registro, creamos un Customer suelto
      const customer = await stripe.customers.create({ metadata: { anonymous: "true" } });
      customerId = customer.id;
    }

    // 2. Obtener o crear el precio en Stripe
    const priceId = await getOrCreateStripePrice(plan, annual);

    // 3. Crear la Suscripción en modo incompleto
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.confirmation_secret"],
      metadata: {
        planId: plan.id,
        period: annual ? "annual" : "monthly",
        ...(tenantId ? { tenant_id: tenantId } : {}),
      },
    });

    const invoice = subscription.latest_invoice as
      | (Stripe.Invoice & {
          confirmation_secret?: { client_secret?: string } | null;
          payment_intent?: Stripe.PaymentIntent | string | null;
        })
      | null;

    let clientSecret: string | undefined = invoice?.confirmation_secret?.client_secret;

    // Fallback para versiones antiguas de la API de Stripe.
    if (!clientSecret && invoice?.payment_intent && typeof invoice.payment_intent !== "string") {
      clientSecret = invoice.payment_intent.client_secret ?? undefined;
    }

    if (!clientSecret) {
      throw new Error(
        `No se pudo obtener el client_secret de la suscripción (estado de factura: ${invoice?.status ?? "sin factura"}, total: ${invoice?.amount_due ?? "?"}).`
      );
    }

    return NextResponse.json({ 
      clientSecret,
      subscriptionId: subscription.id 
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error de Stripe.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
