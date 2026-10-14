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
  // Idempotent and serialized per user in the database: concurrent calls (auth
  // callback, finish page, double submit) return the same business instead of
  // creating two. Tenant and owner membership are created in one transaction.
  const { data: tenantId, error: provisionError } = await createAdminClient().rpc("nexo_provision_tenant", {
    p_user: user.id, p_name: name, p_slug: buildSlug(name),
  });
  if (provisionError || typeof tenantId !== "string") return { ok: false };
  return { ok: true, tenantId };
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
