-- =====================================================================
-- Migración 002: bandera de onboarding completado en la tabla `agents`.
-- Permite que proxy.ts sepa si el dueño ya configuró su agente y lo
-- redirija a /onboarding cuando aún no lo ha hecho.
-- =====================================================================

alter table agents
  add column if not exists onboarding_completed boolean not null default false;

-- Los agentes que ya tienen un system_prompt configurado (p. ej. el seed
-- de "Bellisima") se consideran con onboarding completado.
update agents
   set onboarding_completed = true
 where system_prompt is not null
   and btrim(system_prompt) <> '';
