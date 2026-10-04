"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentTenant } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sanitizeJarvisConfig, type JarvisConfig } from "@/lib/jarvis";

export async function saveJarvisConfig(
  input: JarvisConfig
): Promise<{ ok: true } | { ok: false; error: string }> {
  const tenantContext = await getCurrentTenant();
  if (!tenantContext) return { ok: false, error: "Sesión no válida." };

  // Tabla nueva (migración 003) aún fuera de database.types.ts: cliente sin tipar, con RLS.
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { error } = await supabase.from("jarvis_configs").upsert({
    tenant_id: tenantContext.tenantId,
    config: sanitizeJarvisConfig(input),
    updated_at: new Date().toISOString(),
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}
