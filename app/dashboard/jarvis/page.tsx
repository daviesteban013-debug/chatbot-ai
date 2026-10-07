import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth";
import { sanitizePersonalization } from "@/lib/jarvis-personalization";
import { createClient } from "@/lib/supabase/server";
import { jarvisDefaults, sanitizeJarvisConfig } from "@/lib/jarvis";
import { JarvisView } from "./jarvis-view";
import { voiceAvailability } from "@/lib/voice/elevenlabs";

export const metadata = { title: "NEXO · Asistente IA 3D" };

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

  // El plan vigente sale de la BD (recién actualizado si el pago se reclamó arriba).
  let currentPlan: string | null = null;
  if (!currentPlan && tenantContext) {
    const { data } = await supabase.from("tenants").select("plan").eq("id", tenantContext.tenantId).maybeSingle();
    currentPlan = (data as { plan?: string } | null)?.plan ?? null;
  }

  return (
    <JarvisView
      key={user?.id ?? "public"}
      initial={initial}
      initialProfile={sanitizePersonalization(user?.user_metadata?.jarvis_personalization)}
      userId={user?.id}
      voiceAvailability={voiceAvailability()}
      plan={currentPlan ?? undefined}
      justPaid={false}
      claimError={null}
    />
  );
}
