"use server";

import { createAdminClient } from "@/lib/supabase/admin";

type ProvisionResult = {
  ok: boolean;
  tenantId?: string;
};

/**
 * Aprovisiona el tenant (negocio) de un usuario recién registrado.
 *
 * La tabla `tenants` solo tiene política RLS de SELECT y no existe un trigger
 * `handle_new_user`, por lo que la creación debe hacerse con el cliente
 * service-role (admin) desde el servidor. Se valida que el `userId` exista en
 * Auth y que el correo coincida con el enviado por el formulario para evitar
 * aprovisionar tenants a cuenta de terceros.
 */
export async function provisionTenant(input: {
  userId: string;
  email: string;
  businessName: string;
}): Promise<ProvisionResult> {
  const admin = createAdminClient();

  // 1) Verificar que el usuario existe y que el correo coincide.
  const { data: found, error: foundError } =
    await admin.auth.admin.getUserById(input.userId);
  if (foundError || !found?.user) {
    return { ok: false };
  }
  if (
    (found.user.email ?? "").toLowerCase() !== input.email.trim().toLowerCase()
  ) {
    return { ok: false };
  }

  // 2) Idempotencia: si ya pertenece a un tenant, no crear otro.
  const { data: existing } = await admin
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", input.userId)
    .limit(1)
    .maybeSingle();
  if (existing) {
    return { ok: true, tenantId: existing.tenant_id };
  }

  // 3) Crear el tenant y la membresía owner.
  const slug = buildSlug(input.businessName);
  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .insert({ name: input.businessName.trim(), slug, plan: "pilot" })
    .select("id")
    .single();
  if (tenantError || !tenant) {
    return { ok: false };
  }

  const { error: memberError } = await admin
    .from("tenant_members")
    .insert({
      tenant_id: tenant.id,
      user_id: input.userId,
      role: "owner",
    });
  if (memberError) {
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
