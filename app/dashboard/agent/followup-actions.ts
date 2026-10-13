"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const settingsSchema = z.object({
  enabled: z.boolean(),
  delayMinutes: z.number().int().min(30).max(720),
  maxReminders: z.number().int().min(1).max(2),
}).strict();
const cancelSchema = z.object({ id: z.string().uuid() }).strict();
type Result = { ok: boolean; error?: string };

export async function saveSalesFollowups(input: unknown): Promise<Result> {
  const user = await getCurrentUser();
  const tenant = await getCurrentTenant();
  if (!user || user.is_anonymous || !tenant || tenant.role !== "owner") {
    return { ok: false, error: "Solo el dueño del negocio puede configurar los seguimientos." };
  }
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Elige entre 30 y 720 minutos y un máximo de uno o dos recordatorios." };
  }
  try {
    const { data, error } = await createAdminClient().rpc("nexo_configure_sales_followups", {
      p_tenant: tenant.tenantId,
      p_user: user.id,
      p_enabled: parsed.data.enabled,
      p_delay: parsed.data.delayMinutes,
      p_max: parsed.data.maxReminders,
    });
    if (error || !data || typeof data !== "object" || Array.isArray(data) || data.enabled !== parsed.data.enabled) {
      return { ok: false, error: "No se pudo guardar el seguimiento. Comprueba tu acceso al negocio y vuelve a intentarlo." };
    }
    revalidatePath("/dashboard/agent");
    revalidatePath("/dashboard/conversations", "layout");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo conectar para guardar los seguimientos. Inténtalo de nuevo." };
  }
}

export async function cancelSalesFollowup(input: unknown): Promise<Result> {
  const user = await getCurrentUser();
  const tenant = await getCurrentTenant();
  if (!user || user.is_anonymous || !tenant || !["owner", "agent"].includes(tenant.role)) {
    return { ok: false, error: "Solo el dueño o un agente del negocio puede cancelar un seguimiento." };
  }
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "El seguimiento no es válido." };
  try {
    const { data, error } = await createAdminClient().rpc("nexo_cancel_sales_followup", {
      p_tenant: tenant.tenantId,
      p_user: user.id,
      p_id: parsed.data.id,
    });
    if (error) {
      return {
        ok: false,
        error: error.message?.includes("SALES_FOLLOWUP_ALREADY_DISPATCHED")
          ? "El envío ya comenzó o terminó y no se puede cancelar. Actualiza la página para ver su estado."
          : "No se pudo cancelar. Comprueba que el seguimiento pertenezca a este negocio y siga pendiente.",
      };
    }
    if (!data || typeof data !== "object" || Array.isArray(data) || data.status !== "canceled" || data.id !== parsed.data.id) {
      return { ok: false, error: "No se pudo confirmar la cancelación. Actualiza la página antes de volver a intentarlo." };
    }
    revalidatePath("/dashboard/agent");
    revalidatePath("/dashboard/conversations", "layout");
    return { ok: true };
  } catch {
    return { ok: false, error: "No se pudo conectar para cancelar el seguimiento. Inténtalo de nuevo." };
  }
}
