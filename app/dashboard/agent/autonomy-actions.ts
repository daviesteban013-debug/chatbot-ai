"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { autonomyInput } from "@/lib/activity";

/** Owner-only: which low-risk actions Zorax may do without a click. */
export async function saveAutonomy(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  const tenant = await getCurrentTenant();
  if (!user || user.is_anonymous || !tenant || tenant.role !== "owner") return { ok: false, error: "Solo el dueño del negocio puede cambiar la autonomía de Zorax." };
  const parsed = autonomyInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Elige qué puede hacer Zorax por su cuenta." };
  try {
    const { error } = await createAdminClient().rpc("nexo_configure_autonomy", { p_tenant: tenant.tenantId, p_user: user.id, p_settings: parsed.data });
    if (error) return { ok: false, error: "No se pudo guardar. Comprueba que sigas siendo el dueño del negocio." };
  } catch { return { ok: false, error: "No se pudo conectar. Inténtalo de nuevo." }; }
  revalidatePath("/dashboard/agent");
  return { ok: true };
}
