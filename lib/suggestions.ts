import { z } from "zod";
import { autonomyKeys, type AutonomyKey } from "./activity";

/**
 * "Zorax could do this alone": offered to the owner only after the team confirmed that kind
 * of change by hand repeatedly (counted in the database over the last 30 days).
 */
export const suggestionSchema = z.object({
  key: z.enum(autonomyKeys),
  confirmed: z.number().int().nonnegative(), rejected: z.number().int().nonnegative(), undone: z.number().int().nonnegative(),
});
export type AutomationSuggestion = z.infer<typeof suggestionSchema>;
export const suggestionDecision = z.object({ key: z.enum(autonomyKeys), action: z.enum(["enable", "dismiss"]) }).strict();

export const SUGGESTION_TEXTS: Record<AutonomyKey, { title: string; body: (confirmed: number) => string; enabled: string }> = {
  catalog_stock: {
    title: "¿Dejo que Zorax actualice el stock solo?",
    body: n => `Confirmaste ${n} cambios de stock que Zorax preparó en los últimos 30 días, casi sin rechazar ninguno.`,
    enabled: "Listo: las entradas y salidas de stock quedan aplicadas al instante. Cada una se puede deshacer durante 7 días.",
  },
  catalog_availability: {
    title: "¿Dejo que Zorax oculte y active productos solo?",
    body: n => `Confirmaste ${n} cambios de disponibilidad que Zorax preparó en los últimos 30 días.`,
    enabled: "Listo: ocultar y activar productos queda aplicado al instante; cada cambio se puede deshacer.",
  },
  work_items: {
    title: "¿Dejo que Zorax guarde recuerdos y tareas sin preguntar?",
    body: n => `Confirmaste ${n} propuestas de memoria y tareas en los últimos 30 días.`,
    enabled: "Listo: lo que le pidas recordar o agendar queda activo de una vez; se puede deshacer.",
  },
  learn_from_chat: {
    title: "¿Dejo que Zorax aprenda del chat?",
    body: n => `Confirmaste ${n} datos del negocio que surgieron en conversaciones. Zorax puede anotarlos solo; nunca datos de clientes.`,
    enabled: "Listo: Zorax anotará los datos estables del negocio que menciones; cada uno se puede deshacer.",
  },
};
