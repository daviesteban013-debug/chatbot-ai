import { z } from "zod";

export const timezoneSchema = z.string().max(100).refine(value => {
  try { new Intl.DateTimeFormat("es-CO", { timeZone: value }); return true; } catch { return false; }
}, "Indica una zona horaria válida.");
export const workInput = z.object({
  kind: z.enum(["memory", "task"]),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().max(4000).default(""),
  customer_id: z.string().uuid().optional(),
  assignee_id: z.string().uuid().optional(),
  due_at: z.string().datetime({ offset: true }).optional(),
  timezone: timezoneSchema.default("America/Bogota"),
}).strict().superRefine((value, ctx) => {
  if (value.kind === "task" && (!value.due_at || Date.parse(value.due_at) <= Date.now() || Date.parse(value.due_at) > Date.now() + 732 * 86400000))
    ctx.addIssue({ code: "custom", message: "La tarea necesita una fecha futura, con zona horaria, dentro de dos años.", path: ["due_at"] });
  if (value.kind === "memory" && (value.due_at || value.assignee_id))
    ctx.addIssue({ code: "custom", message: "Un recuerdo no tiene vencimiento ni responsable." });
});
export type WorkInput = z.infer<typeof workInput>;
export type WorkItem = {
  id: string; tenant_id: string; kind: "memory" | "task"; title: string; body: string;
  customer_id: string | null; assignee_id: string | null; due_at: string | null; timezone: string;
  status: "proposed" | "active" | "done" | "canceled"; created_by: string; confirmed_by: string | null;
  source_session: string | null; request_key: string; revision: number; created_at: string; updated_at: string; expires_at: string;
};
export type TaskReminder = { id: string; tenant_id: string; item_id: string; user_id: string; due_at: string; created_at: string; read_at: string | null };
export const workDecision = z.object({
  id: z.string().uuid(), revision: z.number().int().positive(),
  action: z.enum(["confirm", "cancel", "complete", "delete", "edit"]),
  patch: z.object({ title: z.string().trim().min(1).max(160), body: z.string().trim().max(4000), due_at: z.string().datetime({ offset: true }).optional(), timezone: timezoneSchema.optional(), assignee_id: z.string().uuid().optional() }).strict().optional(),
}).strict().refine(value => value.action !== "edit" || !!value.patch, "Faltan los cambios.");

export function workDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(value));
}
