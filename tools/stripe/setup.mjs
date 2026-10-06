import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { moduleUrl } from "./load-module.mjs";

nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });

async function saveEnv(updates) {
  const file = ".env.local";
  let source = (await readFile(file, "utf8")).replace(/\r\n?/g, "\n");
  for (const [name,value] of Object.entries(updates)) {
    const line = `${name}=${JSON.stringify(value)}`;
    const pattern = new RegExp(`^[ \\t]*(?:export[ \\t]+)?${name}[ \\t]*=.*$`, "m");
    source = pattern.test(source) ? source.replace(pattern, () => line) : `${source.trimEnd()}\n${line}\n`;
  }
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, source, { mode: 0o600 });
  await rename(temp, file);
  console.log(JSON.stringify({ saved: Object.keys(updates) }));
}

try {
  const { getStripe } = await import(await moduleUrl("lib/stripe/server.ts"));
  const { stripeMode, billingOrigin } = await import(await moduleUrl("lib/stripe/config.ts"));
  const { plans } = await import(await moduleUrl("lib/plans.ts"));
  const { getOrCreateStripePrice } = await import(await moduleUrl("lib/stripe/sync-plan.ts"));
  const mode = stripeMode();
  if (mode === "live" && !process.argv.includes("--live")) throw new Error("Live requiere ejecutar setup con --live de forma explícita.");
  const stripe = getStripe();
  const account = await stripe.accounts.retrieve();
  if (mode === "live" && !account.charges_enabled) throw new Error("Stripe todavía no permite cobros reales en esta cuenta.");
  const products = [];
  for (const plan of plans) {
    const prices = [];
    for (const annual of [false,true]) prices.push(await getOrCreateStripePrice(plan, annual));
    products.push({ product: `prod_${plan.id}`, prices });
  }
  const configurations = await stripe.billingPortal.configurations.list({ limit: 100 });
  const existing = configurations.data.find(c => c.metadata?.nexo === "true");
  const options = {
    business_profile: { headline: "Nexo.ai · Tu espacio con Jarvis" },
    default_return_url: `${billingOrigin()}/dashboard/billing`, metadata: { nexo: "true" },
    features: {
      invoice_history: { enabled: true }, payment_method_update: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ["email", "name", "address"] },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
      subscription_update: { enabled: true, default_allowed_updates: ["price"], products, proration_behavior: "always_invoice" },
    },
  };
  const portal = existing ? await stripe.billingPortal.configurations.update(existing.id, { ...options, active: true }) : await stripe.billingPortal.configurations.create(options);
  const url = `${billingOrigin()}/api/stripe/webhook`;
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const known = endpoints.data.find(e => e.id === process.env.STRIPE_WEBHOOK_ENDPOINT_ID && e.url === url);
  const events = ["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"];
  const updates = { STRIPE_MODE: mode, APP_URL: billingOrigin(), STRIPE_PORTAL_CONFIGURATION_ID: portal.id };
  if (known && process.env.STRIPE_WEBHOOK_SECRET) {
    await stripe.webhookEndpoints.update(known.id, { enabled_events: events, disabled: false });
    updates.STRIPE_WEBHOOK_ENDPOINT_ID = known.id;
  } else {
    const endpoint = await stripe.webhookEndpoints.create({ url, enabled_events: events, description: `Nexo Jarvis · ${mode}`, metadata: { nexo: "true" } });
    updates.STRIPE_WEBHOOK_ENDPOINT_ID = endpoint.id;
    updates.STRIPE_WEBHOOK_SECRET = endpoint.secret;
  }
  await saveEnv(updates);
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await db.from("billing_settings").update({ mode }).eq("id", true).select("mode").single();
  if (error) throw new Error("Falta aplicar la migración de pagos o no se pudo sincronizar el modo.");
  await mkdir(".codex/stripe", { recursive: true });
  await writeFile(`.codex/stripe/setup-${mode}.json`, JSON.stringify({ mode, account: account.id, portal: portal.id, endpoint: updates.STRIPE_WEBHOOK_ENDPOINT_ID, products, checked_at: new Date().toISOString() }, null, 2));
  console.log(JSON.stringify({ ok: true, mode, products: products.length, prices: products.reduce((n,p) => n+p.prices.length,0), portal: "configured", webhook: "configured", requires_deploy: true }));
} catch (error) {
  // Stripe errors can include request parameters. Never log the raw SDK error.
  const message = error?.type ? "Stripe rechazó la configuración. Revisa la cuenta y los permisos de la clave." : error.message;
  console.error(JSON.stringify({ ok: false, error: message, stripe_code: error?.code ?? null }));
  process.exitCode = 1;
}
