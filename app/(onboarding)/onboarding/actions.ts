"use server";

import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth";
import type { Json } from "@/lib/database.types";
import { sanitizeJarvisConfig } from "@/lib/jarvis";
import { sanitizePersonalization } from "@/lib/jarvis-personalization";
import { portalSubmission, TONE_LABELS } from "@/lib/onboarding-portal";

export type SavePortalResult = { ok: true } | { ok: false; error: string };

/**
 * Persists everything the welcome portal collected, so the bubble, the desktop app and the
 * WhatsApp agent are personalized at once:
 *  1. `tenants.name` — the store.
 *  2. `agents` — name, tone, limits, rules and the base system prompt (WhatsApp seller).
 *  3. `jarvis_configs` — Zorax's name, business, tone and color (bubble, CRM, desktop).
 *  4. The person's profile — how Zorax calls them and whether it speaks out loud.
 *  5. `onboarding_completed = true` plus the `onboarding_done` cookie the proxy reads.
 * Only the owner of the business can run it; the admin client is used because `tenants`
 * and `jarvis_configs` are not writable from the browser roles.
 */
export async function savePortal(input: unknown): Promise<SavePortalResult> {
  const parsed = portalSubmission.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisa los datos e inténtalo de nuevo." };
  const data = parsed.data;

  const user = await getCurrentUser();
  if (!user || user.is_anonymous) return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  const current = await getCurrentTenant();
  if (!current) return { ok: false, error: "No encontramos tu negocio. Contacta soporte." };
  if (current.role !== "owner") return { ok: false, error: "Solo el dueño puede configurar el negocio." };
  const tenantId = current.tenantId;

  const businessRules: Json = {
    tipo_negocio: data.businessType, ciudad: data.city, pais: "Colombia",
    descuento_max_pct: data.maxDiscountPct, auto_confirmar_hasta_cop: data.autoConfirmMaxTotal, reglas: data.rules || null,
  };
  const systemPrompt = buildSystemPrompt({ agentName: data.agentName, businessName: data.businessName, businessType: data.businessType, city: data.city, tone: data.tone, rules: data.rules });
  const admin = createAdminClient();

  const { error: tenantError } = await admin.from("tenants").update({ name: data.businessName }).eq("id", tenantId);
  if (tenantError) return { ok: false, error: "No pudimos guardar el nombre del negocio." };

  const { data: existing } = await admin.from("agents").select("id, mode, business_rules").eq("tenant_id", tenantId).limit(1).maybeSingle();
  const previousRules = existing?.business_rules && typeof existing.business_rules === "object" && !Array.isArray(existing.business_rules) ? existing.business_rules : {};
  const agentFields = {
    name: data.agentName, tone: data.tone, system_prompt: systemPrompt,
    business_rules: { ...previousRules, ...businessRules as Record<string, Json> },
    max_discount_pct: data.maxDiscountPct, auto_confirm_max_total: data.autoConfirmMaxTotal,
    mode: existing?.mode ?? "autonomous", active: true, onboarding_completed: true, updated_at: new Date().toISOString(),
  };
  const agentError = existing
    ? (await admin.from("agents").update(agentFields).eq("id", existing.id).eq("tenant_id", tenantId)).error
    : (await admin.from("agents").insert({ tenant_id: tenantId, ...agentFields })).error;
  if (agentError) return { ok: false, error: "No pudimos configurar tu agente." };

  // Zorax's identity for the bubble and the CRM keeps whatever else the owner tuned before.
  const { data: configRow } = await admin.from("jarvis_configs").select("config").eq("tenant_id", tenantId).maybeSingle();
  const config = sanitizeJarvisConfig({ ...(configRow?.config && typeof configRow.config === "object" ? configRow.config : {}),
    name: data.agentName, business: data.businessName, tone: data.tone, accent: data.accent });
  const { error: configError } = await admin.from("jarvis_configs").upsert({ tenant_id: tenantId, config: config as unknown as Json, updated_at: new Date().toISOString() });
  if (configError) return { ok: false, error: "No pudimos guardar la personalización de Zorax." };

  // The person's own profile lives in their auth metadata, like the Personalización panel.
  const supabase = await createClient();
  const profile = sanitizePersonalization(user.user_metadata?.jarvis_personalization);
  const { error: profileError } = await supabase.auth.updateUser({ data: { jarvis_personalization: { ...profile, displayName: data.displayName, voice: { ...profile.voice, enabled: data.voice } } } });
  if (profileError) return { ok: false, error: "No pudimos guardar cómo quieres que te llame." };

  const cookieStore = await cookies();
  cookieStore.set("onboarding_done", user.id, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  return { ok: true };
}

/** The WhatsApp seller's base prompt, from the portal's answers. */
function buildSystemPrompt(input: { agentName: string; businessName: string; businessType: string; city: string; tone: string; rules: string }): string {
  const { agentName, businessName, businessType, city, tone, rules } = input;
  const parts = [
    `Eres ${agentName}, el asistente virtual de ${businessName}.`,
    `Vendes ${businessType} en ${city}, Colombia.`,
    `Tu tono es ${(TONE_LABELS[tone] ?? tone).toLowerCase()}: habla en español colombiano, con mensajes cortos, claros y cálidos.`,
  ];
  if (rules) parts.push(`Reglas del negocio que debes respetar:\n${rules}`);
  parts.push("Resuelve la venta completa por este canal. Para precios, stock y totales, usa las herramientas; si falta información, pregunta o busca alternativas reales. No pases la venta a un asesor. Envía el resumen y espera la aceptación del cliente antes de confirmar. No afirmes pagos ni despachos que el sistema no haya verificado.");
  return parts.join("\n\n");
}
