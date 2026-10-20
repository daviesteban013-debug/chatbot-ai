import { z } from "zod";

/** One thing Zorax did on its own: a chat change, a WhatsApp payment reminder, a WhatsApp sale or a finished job. */
export const activityItemSchema = z.object({
  at: z.string(),
  kind: z.enum(["catalog", "work", "job", "reminder", "sale"]),
  text: z.string(),
  href: z.string().startsWith("/dashboard"),
  log_id: z.string().uuid().nullable(),
  status: z.enum(["applied", "undone"]),
  undoable: z.boolean(),
});
export type ActivityItem = z.infer<typeof activityItemSchema>;

export const undoInput = z.object({ log_id: z.string().uuid() }).strict();

export const undoErrors: Record<string, string> = {
  undone: "Esto ya se había deshecho.",
  too_old: "Pasaron más de 7 días. Cámbialo a mano desde su pantalla.",
  changed: "Alguien cambió estos datos después. No deshice nada para no pisar ese cambio.",
  not_undoable: "Un trabajo terminado no se deshace; revisa sus resultados en Trabajos.",
};

/** Low-risk actions the owner can let Zorax do alone. Prices, new products and orders always need a click. */
export const autonomyKeys = ["catalog_stock", "catalog_availability", "work_items", "learn_from_chat"] as const;
export type AutonomyKey = (typeof autonomyKeys)[number];
export type AutonomySettings = Record<AutonomyKey, boolean>;
/** A partial patch: keys left out keep their value in the database. */
export const autonomyInput = z.object({ catalog_stock: z.boolean(), catalog_availability: z.boolean(), work_items: z.boolean(), learn_from_chat: z.boolean() })
  .partial().strict().refine(value => Object.keys(value).length > 0, "Elige al menos un permiso.");
export const defaultAutonomy: AutonomySettings = { catalog_stock: false, catalog_availability: false, work_items: false, learn_from_chat: false };
