import { getStripe } from "./server";
import { type Plan, planTotal } from "@/lib/plans";
import type Stripe from "stripe";

/**
 * Busca o crea un Producto y un Precio (recurrente) en Stripe
 * basándose en el plan seleccionado (mensual o anual).
 * Esto evita tener que configurar los productos manualmente en el dashboard.
 */
export async function getOrCreateStripePrice(
  plan: Plan,
  annual: boolean
): Promise<string> {
  const stripe = getStripe();
  const productId = `prod_${plan.id}`;

  // 1. Verificar si el producto existe
  let product: Stripe.Product | null = null;
  try {
    product = await stripe.products.retrieve(productId);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === "resource_missing") {
      // 404 significa que no existe
    } else {
      throw err;
    }
  }

  // 2. Si no existe, crearlo
  if (!product) {
    product = await stripe.products.create({
      id: productId,
      name: `Nexo · Plan ${plan.name}`,
      description: plan.description,
      metadata: { nexo: "true", planId: plan.id },
    }, { idempotencyKey: `nexo-product-${plan.id}` });
  }

  // 3. Buscar precios activos de este producto con las características pedidas
  const amount = planTotal(plan, annual) * 100; // En centavos de USD (ej: $30 = 3000)
  const interval = annual ? "year" : "month";

  const { data: prices } = await stripe.prices.list({
    product: productId,
    active: true,
    currency: "usd",
    type: "recurring",
  });

  const existingPrice = prices.find(
    (p) => p.unit_amount === amount && p.recurring?.interval === interval && p.recurring.interval_count === 1
  );

  if (existingPrice) {
    if (existingPrice.metadata.planId !== plan.id) await stripe.prices.update(existingPrice.id, { metadata: { planId: plan.id, period: annual ? "annual" : "monthly" } });
    return existingPrice.id;
  }

  // 4. Si el precio no existe, crearlo
  const newPrice = await stripe.prices.create({
    product: productId,
    unit_amount: amount,
    currency: "usd",
    recurring: { interval },
    metadata: { planId: plan.id, period: annual ? "annual" : "monthly" },
  }, { idempotencyKey: `nexo-price-${plan.id}-${interval}-${amount}` });

  return newPrice.id;
}
