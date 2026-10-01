"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth";
import type { Json } from "@/lib/database.types";

/** Esquema de validación de las respuestas del onboarding. */
const onboardingSchema = z.object({
  businessName: z.string().min(2, "El nombre es muy corto").max(80),
  businessType: z.string().min(2, "Cuéntanos qué vendes").max(120),
  city: z.string().min(2, "Indica tu ciudad").max(120),
  agentName: z.string().min(2, "El agente necesita un nombre").max(40),
  agentTone: z.string().min(2).max(40),
  maxDiscountPct: z.number().min(0).max(50),
  autoConfirmMaxTotal: z.number().int().min(0),
  businessRules: z.string().max(2000).default(""),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

export type SaveOnboardingResult = {
  ok: boolean;
  error?: string;
};

/**
 * Persiste los datos del onboarding conversacional:
 *  1. Actualiza `tenants.name` con el nombre del negocio.
 *  2. Crea o actualiza el registro `agents` con nombre, tono, límites y reglas.
 *  3. Genera un `system_prompt` base a partir de las respuestas.
 *  4. Marca `onboarding_completed = true` y fija la cookie `onboarding_done`.
 *
 * Usa el cliente service-role porque `tenants` solo expone política RLS de
 * SELECT. Se valida que el usuario pertenezca al tenant antes de escribir.
 */
export async function saveOnboardingData(
  formData: OnboardingInput
): Promise<SaveOnboardingResult> {
  const parsed = onboardingSchema.safeParse(formData);
  if (!parsed.success) {
    return { ok: false, error: "Revisa los datos e inténtalo de nuevo." };
  }
  const data = parsed.data;

  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
  }

  const current = await getCurrentTenant();
  if (!current) {
    return { ok: false, error: "No encontramos tu negocio. Contacta soporte." };
  }
  const tenantId = current.tenantId;

  const businessName = data.businessName.trim();
  const businessType = data.businessType.trim();
  const city = data.city.trim();
  const agentName = data.agentName.trim();
  const tone = data.agentTone.trim();
  const rules = data.businessRules.trim();

  // Reglas de negocio estructuradas (contexto reutilizable por el agente).
  const businessRules: Json = {
    tipo_negocio: businessType,
    ciudad: city,
    pais: "Colombia",
    descuento_max_pct: data.maxDiscountPct,
    auto_confirmar_hasta_cop: data.autoConfirmMaxTotal,
    reglas: rules || null,
  };

  const systemPrompt = buildSystemPrompt({
    agentName,
    businessName,
    businessType,
    city,
    tone,
    rules,
  });

  const admin = createAdminClient();

  // 1) Nombre del negocio.
  const { error: tenantError } = await admin
    .from("tenants")
    .update({ name: businessName })
    .eq("id", tenantId);
  if (tenantError) {
    return { ok: false, error: "No pudimos guardar el nombre del negocio." };
  }

  // 2) Agente: actualizar el existente del tenant o crearlo.
  const { data: existing } = await admin
    .from("agents")
    .select("id")
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();

  const agentFields = {
    name: agentName,
    tone,
    system_prompt: systemPrompt,
    business_rules: businessRules,
    max_discount_pct: data.maxDiscountPct,
    auto_confirm_max_total: data.autoConfirmMaxTotal,
    mode: "shadow" as const,
    active: true,
    onboarding_completed: true,
    updated_at: new Date().toISOString(),
  };

  const agentError = existing
    ? (
        await admin
          .from("agents")
          .update(agentFields)
          .eq("id", existing.id)
      ).error
    : (
        await admin
          .from("agents")
          .insert({ tenant_id: tenantId, ...agentFields })
      ).error;

  if (agentError) {
    return { ok: false, error: "No pudimos configurar tu agente." };
  }

  // 3) Cookie de onboarding completado (la lee proxy.ts para evitar la consulta).
  //    Guardamos el id del usuario para que otra cuenta en el mismo navegador
  //    no herede el estado y vuelva a verificarse contra la BD.
  const cookieStore = await cookies();
  cookieStore.set("onboarding_done", user.id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });

  return { ok: true };
}

/** Construye el `system_prompt` base del agente a partir del onboarding. */
function buildSystemPrompt(input: {
  agentName: string;
  businessName: string;
  businessType: string;
  city: string;
  tone: string;
  rules: string;
}): string {
  const { agentName, businessName, businessType, city, tone, rules } = input;
  const partes: string[] = [
    `Eres ${agentName}, el asistente virtual de ${businessName}.`,
    `Vendes ${businessType} en ${city}, Colombia.`,
    `Tu tono es ${tone}: habla en español colombiano, con mensajes cortos, claros y cálidos.`,
  ];

  if (rules) {
    partes.push(`Reglas del negocio que debes respetar:\n${rules}`);
  }

  partes.push(
    "Para cualquier precio, stock o total, usa las tools disponibles; si no tienes la información, dilo con honestidad y escala la conversación a una persona del equipo."
  );

  return partes.join("\n\n");
}
