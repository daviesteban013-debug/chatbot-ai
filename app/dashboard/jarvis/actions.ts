"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentTenant } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sanitizeJarvisConfig, type JarvisConfig } from "@/lib/jarvis";
import { sanitizePersonalization, type JarvisPersonalization } from "@/lib/jarvis-personalization";

export async function saveJarvisConfig(
  input: JarvisConfig
): Promise<{ ok: true; config: JarvisConfig } | { ok: false; error: string }> {
  const tenantContext = await getCurrentTenant();
  if (!tenantContext) return { ok: false, error: "Sesión no válida." };

  // Tabla nueva (migración 003) aún fuera de database.types.ts: cliente sin tipar, con RLS.
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const config = sanitizeJarvisConfig(input);
  const { error } = await supabase.from("jarvis_configs").upsert({
    tenant_id: tenantContext.tenantId,
    config,
    updated_at: new Date().toISOString(),
  });
  return error ? { ok: false, error: "No se pudo guardar la configuración. Inténtalo de nuevo." } : { ok: true, config };
}

export async function saveJarvisPersonalization(input: unknown): Promise<
  { ok: true; profile: JarvisPersonalization } | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Inicia sesión para guardar tu personalización." };
  const profile = sanitizePersonalization(input);
  const { error } = await supabase.auth.updateUser({ data: { jarvis_personalization: profile } });
  return error ? { ok: false, error: "No se pudo guardar tu personalización. Inténtalo de nuevo." } : { ok: true, profile };
}
