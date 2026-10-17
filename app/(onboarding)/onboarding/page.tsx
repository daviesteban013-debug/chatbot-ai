import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sanitizeJarvisConfig } from "@/lib/jarvis";
import { sanitizePersonalization } from "@/lib/jarvis-personalization";
import { portalDefaults, type PortalAnswers } from "@/lib/onboarding-portal";
import { voiceAvailability } from "@/lib/voice/elevenlabs";
import { WelcomePortal } from "./portal";

export const metadata: Metadata = {
  title: "Conoce a tu agente — NEXO",
  description: "NEXO se presenta y se configura contigo en dos minutos.",
};

/**
 * The welcome portal: the first screen of a new account (the proxy sends every account whose
 * agent has not completed onboarding here) and, with ?replay=1, a way to meet NEXO again.
 */
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ replay?: string }> }) {
  const [user, current, params] = await Promise.all([getCurrentUser(), getCurrentTenant(), searchParams]);
  if (!user) redirect("/login");
  if (!current) redirect("/login");
  if (current.role !== "owner") redirect("/dashboard");
  const supabase = await createClient();
  const [{ data: agent }, { data: configRow }, { count: products }, { count: whatsapp }] = await Promise.all([
    supabase.from("agents").select("name, tone, max_discount_pct, auto_confirm_max_total, business_rules, onboarding_completed").eq("tenant_id", current.tenantId).limit(1).maybeSingle(),
    supabase.from("jarvis_configs").select("config").eq("tenant_id", current.tenantId).maybeSingle(),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("tenant_id", current.tenantId),
    supabase.from("whatsapp_accounts").select("id", { count: "exact", head: true }).eq("tenant_id", current.tenantId),
  ]);
  const replay = params.replay === "1" && agent?.onboarding_completed === true;
  const config = sanitizeJarvisConfig(configRow?.config);
  const profile = sanitizePersonalization(user.user_metadata?.jarvis_personalization);
  const rules = agent?.business_rules && typeof agent.business_rules === "object" && !Array.isArray(agent.business_rules) ? agent.business_rules as Record<string, unknown> : {};
  // Meeting NEXO again starts from what the owner already chose; a new account starts clean.
  const initial: Partial<PortalAnswers> = replay ? {
    agentName: agent?.name ?? config.name, displayName: profile.displayName, businessName: current.tenant?.name ?? "",
    businessType: typeof rules.tipo_negocio === "string" ? rules.tipo_negocio : "", city: typeof rules.ciudad === "string" ? rules.ciudad : "",
    tone: config.tone, accent: config.accent, voice: profile.voice.enabled,
    maxDiscountPct: agent?.max_discount_pct ?? portalDefaults.maxDiscountPct, autoConfirmMaxTotal: agent?.auto_confirm_max_total ?? portalDefaults.autoConfirmMaxTotal,
    rules: typeof rules.reglas === "string" ? rules.reglas : "",
  } : { displayName: typeof user.user_metadata?.full_name === "string" ? String(user.user_metadata.full_name).split(" ")[0] : "" };
  return <WelcomePortal initial={initial} replay={replay} voiceAvailability={voiceAvailability()} voiceProfile={profile.voice} telemetry={{
    store: current.tenant?.name ?? null, plan: current.tenant?.plan ?? "pilot", products: products ?? 0, whatsapp: (whatsapp ?? 0) > 0, email: user.email ?? "",
  }} />;
}
