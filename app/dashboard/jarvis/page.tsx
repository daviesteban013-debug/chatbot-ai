import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth";
import { sanitizePersonalization } from "@/lib/jarvis-personalization";
import { createClient } from "@/lib/supabase/server";
import { jarvisDefaults, sanitizeJarvisConfig } from "@/lib/jarvis";
import { JarvisView } from "./jarvis-view";
import { voiceAvailability } from "@/lib/voice/elevenlabs";
import { activePlan, type BillingRow } from "@/lib/billing/entitlement";
import { mercadoPagoMode } from "@/lib/mercadopago/client";

export const metadata = { title: "Zorax" };

export default async function JarvisPage() {
  const tenantContext = await getCurrentTenant();
  const user = await getCurrentUser();

  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { data: row } = tenantContext
    ? await supabase
        .from("jarvis_configs")
        .select("config")
        .eq("tenant_id", tenantContext.tenantId)
        .maybeSingle()
    : { data: null };

  const initial = row?.config
    ? sanitizeJarvisConfig(row.config)
    : { ...jarvisDefaults, business: tenantContext?.tenant?.name ?? "" };

  const currentPlan = tenantContext ? await planLabel(supabase, tenantContext.tenantId) : undefined;

  return (
    <JarvisView
      key={user?.id ?? "public"}
      initial={initial}
      initialProfile={sanitizePersonalization(user?.user_metadata?.jarvis_personalization)}
      userId={user?.id}
      voiceAvailability={voiceAvailability()}
      plan={currentPlan}
    />
  );
}

/** The plan in force (same rule as the credits), not the last one stored on the business. */
async function planLabel(supabase: SupabaseClient, tenantId: string): Promise<string | undefined> {
  const { data } = await supabase.from("tenants").select("plan,plan_active_until,billing_mode,mp_preapproval_status").eq("id", tenantId).maybeSingle();
  if (!data) return undefined;
  let mode = "test";
  try { mode = mercadoPagoMode(); } catch { /* Invalid configuration shows the trial label. */ }
  return activePlan(data as BillingRow, mode)?.name ?? "de prueba";
}
