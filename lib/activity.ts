import { z } from "zod";

/** One thing NEXO did on its own: a chat change, a WhatsApp payment reminder or a WhatsApp sale. */
export const activityItemSchema = z.object({
  at: z.string(),
  kind: z.enum(["catalog", "work", "reminder", "sale"]),
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
};

/** Low-risk actions the owner can let NEXO do alone. Prices, new products and orders always need a click. */
export const autonomyKeys = ["catalog_stock", "catalog_availability", "work_items"] as const;
export type AutonomyKey = (typeof autonomyKeys)[number];
export const autonomyInput = z.object({ catalog_stock: z.boolean(), catalog_availability: z.boolean(), work_items: z.boolean() }).strict();
export type AutonomySettings = z.infer<typeof autonomyInput>;
