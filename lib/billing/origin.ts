export function billingOrigin(): string {
  const url = new URL(process.env.APP_URL ?? "https://zoraxpilot.com");
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.hostname === "localhost")) throw new Error("URL de pagos inválida.");
  return url.origin;
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin === new URL(request.url).origin && origin === billingOrigin();
}
