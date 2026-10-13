import { z } from "zod";
import type { ToolContext, ToolResult } from "./tools";

export const CUSTOMER_PREFERENCE_CATEGORIES = [
  "product_color", "product_size", "product_category", "contact_format", "language",
] as const;

const category = z.enum(CUSTOMER_PREFERENCE_CATEGORIES);
const rememberSchema = z.object({
  category,
  value: z.string().trim().min(1).max(60),
  evidence_quote: z.string().trim().min(4).max(160),
}).strict();
const forgetSchema = z.object({
  category: z.enum([...CUSTOMER_PREFERENCE_CATEGORIES, "all"]),
  evidence_quote: z.string().trim().min(4).max(160),
}).strict();

export type CustomerSalesContext = {
  preferences: Array<{ category: typeof CUSTOMER_PREFERENCE_CATEGORIES[number]; value: string; updated_at: string }>;
  purchases: Array<{ ordered_at: string; status: string; total: number; items: Array<{ name: string; qty: number }> }>;
};

/** Customer-visible facts only. SQL never returns CRM notes, addresses or message quotes. */
export async function getCustomerContext(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  if (!z.object({}).strict().safeParse(args).success) return { ok: false, error: "Esta consulta no admite identificadores ni filtros del modelo." };
  try {
    const { data, error } = await ctx.supabase.rpc("nexo_get_customer_sales_context", {
      p_tenant: ctx.tenantId, p_conversation: ctx.conversationId, p_customer: ctx.customerId,
    });
    if (error || !data) return { ok: false, error: "No se pudo consultar la memoria comercial de este cliente." };
    return { ok: true, data };
  } catch {
    return { ok: false, error: "No se pudo consultar la memoria comercial de este cliente." };
  }
}

export async function rememberCustomerPreference(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const parsed = rememberSchema.safeParse(args);
  if (!parsed.success) return { ok: false, error: "Indica una categoría comercial, un valor breve y una cita literal de la preferencia explícita del cliente." };
  if (ctx.simulate || ctx.mode !== "autonomous") return { ok: true, data: { simulated: true, persisted: false } };
  if (!ctx.triggerMessageId) return { ok: false, error: "Falta el mensaje actual del cliente como evidencia." };
  try {
    const { data, error } = await ctx.supabase.rpc("nexo_remember_customer_preference", {
      p_tenant: ctx.tenantId, p_conversation: ctx.conversationId, p_customer: ctx.customerId,
      p_trigger: ctx.triggerMessageId, p_category: parsed.data.category,
      p_value: parsed.data.value, p_quote: parsed.data.evidence_quote,
    });
    if (error || !data) return { ok: false, error: "No se guardó: se requiere una preferencia comercial explícita y literal del mensaje actual, sin datos sensibles ni instrucciones." };
    return { ok: true, data };
  } catch {
    return { ok: false, error: "No se pudo guardar la preferencia. No la presentes como recordada." };
  }
}

export async function forgetCustomerPreference(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const parsed = forgetSchema.safeParse(args);
  if (!parsed.success) return { ok: false, error: "Indica qué preferencia olvidar y la solicitud textual del cliente." };
  if (ctx.simulate || ctx.mode !== "autonomous") return { ok: true, data: { simulated: true, persisted: false } };
  if (!ctx.triggerMessageId) return { ok: false, error: "Falta el mensaje actual del cliente como evidencia." };
  try {
    const { data, error } = await ctx.supabase.rpc("nexo_forget_customer_preference", {
      p_tenant: ctx.tenantId, p_conversation: ctx.conversationId, p_customer: ctx.customerId,
      p_trigger: ctx.triggerMessageId, p_category: parsed.data.category, p_quote: parsed.data.evidence_quote,
    });
    if (error || !data) return { ok: false, error: "No se borró: el mensaje actual debe pedir explícitamente olvidar esa preferencia." };
    return { ok: true, data };
  } catch {
    return { ok: false, error: "No se pudo borrar la preferencia. No la presentes como olvidada." };
  }
}
