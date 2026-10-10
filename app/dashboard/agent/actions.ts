"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { salesPaymentsSchema } from "@/lib/sales-payments";

export async function saveSalesPayments(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  const tenant = await getCurrentTenant();
  if (!user || user.is_anonymous || !tenant || tenant.role !== "owner") return { ok: false, error: "Solo el dueño del negocio puede configurar sus cobros." };
  const parsed = salesPaymentsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa los datos de pago." };
  const { error } = await createAdminClient().rpc("nexo_configure_sales_payments", {
    p_tenant: tenant.tenantId, p_user: user.id, p_link: parsed.data.linkUrl, p_transfer: parsed.data.transferInstructions,
  });
  if (error) return { ok: false, error: "No se pudo guardar. Comprueba que el negocio tenga un agente activo y que sigas siendo su dueño." };
  revalidatePath("/dashboard/agent");
  return { ok: true };
}
