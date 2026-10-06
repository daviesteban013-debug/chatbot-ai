import { NextResponse } from "next/server";
import { getCurrentTenant } from "@/lib/auth";
import { billingOrigin, sameOrigin, stripeMode } from "@/lib/stripe/config";
import { assertBillingMode, billingAccount } from "@/lib/stripe/billing";
import { getStripe } from "@/lib/stripe/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  const tenant = await getCurrentTenant();
  if (!tenant) return NextResponse.json({ error: "Inicia sesión para gestionar tus pagos." }, { status: 401 });
  if (tenant.role !== "owner") return NextResponse.json({ error: "Solo el propietario puede gestionar los pagos." }, { status: 403 });
  try {
    await assertBillingMode();
    const account = await billingAccount(tenant);
    const stripe = getStripe();
    const configuration = process.env.STRIPE_PORTAL_CONFIGURATION_ID;
    if (!configuration) throw new Error("Portal pendiente de configurar.");
    const config = await stripe.billingPortal.configurations.retrieve(configuration);
    if (!config.active || config.livemode !== (stripeMode() === "live")) throw new Error("Portal de otro entorno.");
    const session = await stripe.billingPortal.sessions.create({
      customer: account.customer_id, configuration, locale: "es", return_url: `${billingOrigin()}/dashboard/billing`,
    });
    return NextResponse.json({ url: session.url }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "No se pudo abrir el portal. Inténtalo de nuevo en unos minutos." }, { status: 503 });
  }
}
