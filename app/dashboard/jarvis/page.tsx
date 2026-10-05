import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth";
import { sanitizePersonalization } from "@/lib/jarvis-personalization";
import { createClient } from "@/lib/supabase/server";
import { jarvisDefaults, sanitizeJarvisConfig } from "@/lib/jarvis";
import { claimSubscription } from "@/lib/stripe/activate-plan";
import { JarvisView } from "./jarvis-view";

export const metadata = { title: "Jarvis · Asistente IA 3D" };

export default async function JarvisPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; paid?: string; sub?: string }>;
}) {
  const { sub: subId, paid } = await searchParams;
  const tenantContext = await getCurrentTenant();
  const user = await getCurrentUser();

  // Reclama el pago recién hecho (cubre pagos creados sin sesión iniciada).
  let claimError: string | null = null;
  let paidPlan: string | null = null;
  if (subId && tenantContext) {
    const result = await claimSubscription(subId, tenantContext.tenantId);
    if (result.ok) paidPlan = result.planId;
    else claimError = result.reason;
  }

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

  // El plan vigente sale de la BD (recién actualizado si el pago se reclamó arriba).
  let currentPlan: string | null = paidPlan;
  if (!currentPlan && tenantContext) {
    const { data } = await supabase.from("tenants").select("plan").eq("id", tenantContext.tenantId).maybeSingle();
    currentPlan = (data as { plan?: string } | null)?.plan ?? null;
  }

  const justPaid = Boolean(paidPlan || paid === "1");

  return (
    <JarvisView
      key={user?.id ?? "public"}
      initial={initial}
      initialProfile={sanitizePersonalization(user?.user_metadata?.jarvis_personalization)}
      userId={user?.id}
      plan={currentPlan ?? undefined}
      justPaid={justPaid}
      claimError={claimError}
    />
  );
}
