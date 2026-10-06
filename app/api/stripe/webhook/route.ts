import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/server";
import { synchronizeSubscription } from "@/lib/stripe/activate-plan";

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

  if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    try {
      const current = await getStripe().subscriptions.retrieve(subscription.id);
      const result = await synchronizeSubscription(current);
      if (result && !result.ok) return NextResponse.json({ error: "No se pudo sincronizar la suscripción." }, { status: 503 });
    } catch {
      return NextResponse.json({ error: "No se pudo sincronizar la suscripción." }, { status: 503 });
    }
  }

  return NextResponse.json({ received: true });
}
