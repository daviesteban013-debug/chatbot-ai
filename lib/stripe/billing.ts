import { createClient } from "@supabase/supabase-js";
import { getStripe } from "./server";
import { stripeMode } from "./config";
import type { CurrentTenant } from "@/lib/auth";

export function billingDatabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function assertBillingMode() {
  const { data, error } = await billingDatabase().from("billing_settings").select("mode").eq("id", true).single();
  if (error || data.mode !== stripeMode()) throw new Error("La configuración de pagos está pendiente de sincronizar.");
}

export async function billingAccount(tenant: CurrentTenant) {
  const mode = stripeMode();
  const db = billingDatabase();
  const { data, error } = await db.from("billing_accounts").select("*").eq("tenant_id", tenant.tenantId).eq("mode", mode).maybeSingle();
  if (error) throw new Error("No se pudo consultar la cuenta de pagos.");
  if (data) return data as { tenant_id: string; mode: string; customer_id: string; subscription_id: string | null };
  const customer = await getStripe().customers.create({
    name: tenant.tenant?.name ?? "Mi negocio",
    metadata: { tenant_id: tenant.tenantId, nexo: "true" },
  }, { idempotencyKey: `nexo-customer-${mode}-${tenant.tenantId}` });
  const { error: saveError } = await db.from("billing_accounts").upsert({ tenant_id: tenant.tenantId, mode, customer_id: customer.id }, { onConflict: "tenant_id,mode", ignoreDuplicates: true });
  if (saveError) throw new Error("No se pudo guardar la cuenta de pagos.");
  return { tenant_id: tenant.tenantId, mode, customer_id: customer.id, subscription_id: null };
}

export async function currentSubscription(customerId: string) {
  const list = await getStripe().subscriptions.list({ customer: customerId, status: "all", limit: 100 });
  return list.data.find(s => !["canceled", "incomplete_expired"].includes(s.status)) ?? null;
}

export function checkoutPending(expiresAt: string | null): boolean {
  return Boolean(expiresAt && new Date(expiresAt).getTime() > Date.now());
}
