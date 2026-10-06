"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type ProvisionResult = {
  ok: boolean;
  tenantId?: string;
};

/**
 * Aprovisiona el tenant (negocio) de un usuario recién registrado.
 *
 * La tabla `tenants` solo tiene política RLS de SELECT y no existe un trigger
 * `handle_new_user`, por lo que la creación debe hacerse con el cliente
 * service-role desde el servidor, exclusivamente para el dueño de una sesión
 * verificada. El nombre del negocio es descriptivo, nunca una autorización.
 */
export async function provisionTenant(): Promise<ProvisionResult> {
  // The caller's verified session owns the business. Client-supplied IDs and
  // emails must never authorize a service-role write, including before signup confirmation.
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || !user.email_confirmed_at) return { ok: false };
  const businessName = typeof user.user_metadata?.business_name === "string"
    ? user.user_metadata.business_name.trim().slice(0, 60) : "Mi negocio";
  const name = businessName.length >= 2 ? businessName : "Mi negocio";
  const admin = createAdminClient();

  // 2) Idempotencia: si ya pertenece a un tenant, no crear otro.
  const { data: existing, error: existingError } = await admin
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (existingError) return { ok: false };
  if (existing) {
    return { ok: true, tenantId: existing.tenant_id };
  }

  // 3) Crear el tenant y la membresía owner.
  const slug = buildSlug(name);
  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .insert({ name, slug, plan: "pilot" })
    .select("id")
    .single();
  if (tenantError || !tenant) {
    return { ok: false };
  }

  const { error: memberError } = await admin
    .from("tenant_members")
    .insert({
      tenant_id: tenant.id,
      user_id: user.id,
      role: "owner",
    });
  if (memberError) {
    // Do not leave an orphan business if the membership write fails.
    await admin.from("tenants").delete().eq("id", tenant.id);
    return { ok: false };
  }

  return { ok: true, tenantId: tenant.id };
}

/** Genera un slug único y seguro a partir del nombre del negocio. */
function buildSlug(name: string): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "")
      .slice(0, 32) || "negocio";
  const suffix = crypto.randomUUID().slice(0, 6);
  return `${base}-${suffix}`;
}
