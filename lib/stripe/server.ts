import Stripe from "stripe";

export function getStripe(): Stripe {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) throw new Error("Falta configurar STRIPE_SECRET_KEY en el servidor.");
  return new Stripe(secret);
}
