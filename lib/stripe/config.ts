export type StripeMode = "test" | "live";

export function stripeMode(): StripeMode {
  const mode = process.env.STRIPE_MODE ?? "test";
  if (mode !== "test" && mode !== "live") throw new Error("Modo de pagos inválido.");
  return mode;
}

export function billingOrigin(): string {
  const url = new URL(process.env.APP_URL ?? "https://chatbot-ai-gold-two.vercel.app");
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.hostname === "localhost")) throw new Error("URL de pagos inválida.");
  return url.origin;
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin === new URL(request.url).origin && origin === billingOrigin();
}
