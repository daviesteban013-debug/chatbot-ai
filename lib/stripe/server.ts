import Stripe from "stripe";
import { stripeMode } from "./config";

export function getStripe(): Stripe {
  const secret = process.env.STRIPE_SECRET_KEY;
  const mode = stripeMode();
  if (!secret?.startsWith(`sk_${mode}_`)) throw new Error("Los pagos no están configurados para este entorno.");
  const publishable = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (publishable && !publishable.startsWith(`pk_${mode}_`)) throw new Error("Las claves de pagos pertenecen a entornos distintos.");
  return new Stripe(secret);
}
