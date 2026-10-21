"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth";
import type { Json } from "@/lib/database.types";
import { sanitizeJarvisConfig } from "@/lib/jarvis";
import { sanitizePersonalization } from "@/lib/jarvis-personalization";
import { chatCompletion, llmStatus } from "@/lib/llm/client";
import { PORTAL_SCENES, fillLine, parseSpokenAnswer, portalSubmission, TONE_LABELS, validateAnswer, type PortalKey, type SpokenResult } from "@/lib/onboarding-portal";

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

// ---------- Spoken answers ----------
const spokenInput = z.object({
  key: z.enum(PORTAL_SCENES.map(scene => scene.key) as [PortalKey, ...PortalKey[]]),
  transcript: z.string().trim().min(1).max(300),
  answers: z.object({ agentName: z.string().max(24), displayName: z.string().max(40), businessName: z.string().max(48) }).partial().optional(),
}).strict();
const TEXT_SCENES = new Set<PortalKey>(["agentName", "displayName", "businessName", "businessType", "city", "rules"]);
const FIELD_HINTS: Record<string, string> = {
  agentName: "el nombre que el dueño quiere darle al agente: un nombre propio corto, de 2 a 24 letras",
  displayName: "cómo quiere el dueño que lo llamen: un nombre o apodo corto (David, Jefe, Doña Ana)",
  businessName: "el nombre de la tienda o negocio, tal como se escribe",
  businessType: "qué vende el negocio, en dos a cinco palabras (Ropa y moda, Calzado deportivo, Comida saludable)",
  city: "la ciudad desde la que opera, sin el país",
  rules: "las reglas del negocio que dijo el dueño, redactadas en una o pocas frases claras (envíos, cambios, horarios); cadena vacía si dijo que no hay",
};
const recentSpoken = new Map<string, number[]>();
function allowSpoken(userId: string): boolean {
  const now = Date.now();
  const list = (recentSpoken.get(userId) ?? []).filter(at => now - at < 600_000);
  if (list.length >= 60) return false;
  list.push(now); recentSpoken.set(userId, list);
  return true;
}

/**
 * Turns what the owner said out loud into the value a portal scene expects. Choices, amounts and
 * yes/no are read locally; names and free text go through the model so "eh, quiero que te
 * llames Lía" becomes "Lía". The local reading is the fallback when the model is slow or down.
 */
export async function interpretPortalAnswer(input: unknown): Promise<SpokenResult> {
  const parsed = spokenInput.safeParse(input);
  if (!parsed.success) return { ok: false, reply: "No alcancé a oírte. ¿Me lo repites?" };
  const user = await getCurrentUser();
  if (!user || user.is_anonymous) return { ok: false, reply: "Tu sesión expiró. Vuelve a iniciar sesión." };
  if (!allowSpoken(user.id)) return { ok: false, reply: "Vamos muy rápido. Escríbelo abajo, por favor." };
  const scene = PORTAL_SCENES.find(item => item.key === parsed.data.key)!;
  const local = parseSpokenAnswer(scene, parsed.data.transcript);
  if (!TEXT_SCENES.has(scene.key) || !llmStatus().ready) return local;
  const question = fillLine(scene.say, parsed.data.answers ?? {});
  try {
    const response = await chatCompletion([
      { role: "system", content: "Configuras a Zorax, un agente de ventas, a partir de respuestas habladas de un dueño de tienda en Colombia. Devuelve únicamente un JSON {\"value\": string|null}. Extrae el dato pedido tal como debe guardarse, sin muletillas ni frases como «me llamo» o «se llama», respetando mayúsculas de nombres propios y sin inventar nada. Si la respuesta no contiene el dato, o el dueño pide que repitas la pregunta, value es null." },
      { role: "user", content: `Pregunta de Zorax: ${question}\nDato que se guarda: ${FIELD_HINTS[scene.key]}\nRespuesta hablada: «${parsed.data.transcript}»` },
    ], undefined, { temperature: 0, maxTokens: 120, signal: AbortSignal.timeout(8_000) });
    const match = /\{[\s\S]*\}/.exec(response.content ?? "");
    const value = match ? (JSON.parse(match[0]) as { value?: unknown }).value : undefined;
    if (typeof value === "string") {
      const clean = value.replace(/\s+/g, " ").trim();
      if (scene.key === "rules" && !clean) return { ok: true, value: "" };
      if (clean && !validateAnswer(scene, clean)) return { ok: true, value: clean };
    }
    // The model read nothing usable: ask again rather than guessing from the raw words (rules may be empty).
    if (value === null && scene.key !== "rules") return { ok: false, reply: `No te entendí bien. ${question}` };
  } catch { /* Slow or unavailable model: the local reading below still answers. */ }
  return local;
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
