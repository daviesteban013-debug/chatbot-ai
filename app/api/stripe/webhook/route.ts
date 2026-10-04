import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/server";
import { activatePlanFromSubscription } from "@/lib/stripe/activate-plan";

export const runtime = "nodejs";

/**
 * Webhook de Stripe. Escucha eventos de las suscripciones.
 * Evento principal para activar planes: `customer.subscription.created` o `customer.subscription.updated`
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) {
    return NextResponse.json({ error: "Webhook no configurado." }, { status: 400 });
  }

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, secret);
  } catch {
    return NextResponse.json({ error: "Firma inválida." }, { status: 400 });
  }

  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;
    const tenantId = subscription.metadata.tenant_id;
    
    // Si la suscripción ya fue pagada y está activa
    if (tenantId && subscription.status === "active") {
      const result = await activatePlanFromSubscription(subscription, tenantId);
      if (!result.ok) {
        console.error("[stripe-webhook] no se activó el plan:", result.reason);
        // Devolvemos 200 en fallos de negocio (ej. "ya activada") para que Stripe no reintente.
      }
    }
  }

  return NextResponse.json({ received: true });
}
