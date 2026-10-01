import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Tenant, TenantMemberRole } from "@/lib/database.types";

/**
 * Contexto de tenant del usuario autenticado.
 * `tenant` puede venir como objeto o arreglo según la inferencia del join.
 */
export interface CurrentTenant {
  tenantId: string;
  role: TenantMemberRole;
  tenant: Tenant | null;
}

/**
 * Usuario autenticado actual (o `null`).
 * Envuelto en `cache` de React para deduplicar llamadas dentro de un mismo
 * render de servidor (layout + página comparten la petición).
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Resuelve el tenant del usuario autenticado a partir de `tenant_members`.
 * Devuelve `null` si no hay sesión o si el usuario aún no pertenece a ningún
 * tenant (p. ej. recién registrado sin aprovisionar).
 */
export const getCurrentTenant = cache(async (): Promise<CurrentTenant | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("tenant_members")
    .select("tenant_id, role, tenants(*)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const joined = data.tenants as Tenant | Tenant[] | null | undefined;
  const tenant = Array.isArray(joined) ? (joined[0] ?? null) : (joined ?? null);

  return {
    tenantId: data.tenant_id,
    role: data.role,
    tenant,
  };
});
