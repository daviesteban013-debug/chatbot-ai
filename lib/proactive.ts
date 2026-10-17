import { z } from "zod";
import type { BriefingData, BriefingItem } from "@/lib/briefing";
import type { SalesMetrics } from "@/lib/sales-metrics";
import { jobKinds } from "@/lib/jobs/types";
import { jobShortLabels } from "@/lib/jobs/labels";

/**
 * NEXO's proactive bubble: alerts about what happens in the business and scheduled
 * routines. Everything here is deterministic (no model) so it costs no credits.
 */
export type AlertKind = "handoff" | "approval" | "payment" | "sale" | "stock" | "task" | "job";
export const ALERT_KINDS: { kind: AlertKind; label: string }[] = [
  { kind: "handoff", label: "Un cliente espera un asesor" },
  { kind: "approval", label: "Pedido por aprobar" },
  { kind: "payment", label: "Pago recibido" },
  { kind: "sale", label: "Venta cerrada por NEXO" },
  { kind: "stock", label: "Producto agotado" },
  { kind: "task", label: "Tarea vencida" },
  { kind: "job", label: "Trabajo terminado" },
];

export type RoutineId = "morning" | "evening" | "weekly";
export const ROUTINES: { id: RoutineId; label: string; detail: string; monday?: boolean }[] = [
  { id: "morning", label: "Resumen de la mañana", detail: "Ventas de ayer y lo que necesita atención hoy" },
  { id: "evening", label: "Cierre del día", detail: "Lo vendido hoy y lo que quedó por cobrar" },
  { id: "weekly", label: "Cierre de la semana", detail: "Los lunes: la semana frente a la anterior", monday: true },
];

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const routine = z.object({ enabled: z.boolean(), time });
// New kinds default to on so settings saved by older versions keep working.
const kinds = z.object({ handoff: z.boolean(), approval: z.boolean(), payment: z.boolean(), sale: z.boolean(), stock: z.boolean(), task: z.boolean(), job: z.boolean().default(true) });
export const settingsSchema = z.object({
  alerts: z.boolean(), kinds, voice: z.boolean(), system: z.boolean(),
  quiet: z.object({ enabled: z.boolean(), from: time, to: time }),
  routines: z.object({ morning: routine, evening: routine, weekly: routine }),
  asked: z.boolean(),
});
export type ProactiveSettings = z.infer<typeof settingsSchema>;
/** Everything starts off: the owner of the computer decides what NEXO announces. */
export const defaultSettings: ProactiveSettings = {
  alerts: false, voice: false, system: true, asked: false,
  kinds: { handoff: true, approval: true, payment: true, sale: true, stock: true, task: true, job: true },
  quiet: { enabled: true, from: "21:00", to: "07:00" },
  routines: { morning: { enabled: false, time: "08:00" }, evening: { enabled: false, time: "18:00" }, weekly: { enabled: false, time: "08:30" } },
};
export function parseSettings(value: unknown): ProactiveSettings {
  const parsed = settingsSchema.safeParse(value);
  return parsed.success ? parsed.data : defaultSettings;
}

const person = z.object({ id: z.string().uuid(), at: z.string(), customer: z.string() });
const sale = person.extend({ total: z.number() });
export const pulseSchema = z.object({
  at: z.string(),
  handoffs: z.array(person), approvals: z.array(sale), payments: z.array(sale), sales: z.array(sale),
  stockouts: z.array(z.object({ id: z.string().uuid(), label: z.string() })),
  tasks: z.array(z.object({ id: z.string().uuid(), title: z.string(), due_at: z.string() })),
  jobs: z.array(z.object({ id: z.string().uuid(), kind: z.enum(jobKinds), status: z.enum(["done", "failed"]), at: z.string(), summary: z.string().nullable() })).default([]),
});
export type Pulse = z.infer<typeof pulseSchema>;

export type ProactiveAlert = { key: string; kind: AlertKind; text: string; action: string; href: string; at: string; amount?: number };
export const money = (value: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function pulseAlerts(pulse: Pulse): ProactiveAlert[] {
  return [
    ...pulse.handoffs.map(h => ({ key: `handoff:${h.id}`, kind: "handoff" as const, text: `${h.customer} espera un asesor`, action: "Atender", href: `/dashboard/handoffs/${h.id}`, at: h.at })),
    ...pulse.approvals.map(o => ({ key: `approval:${o.id}`, kind: "approval" as const, text: `Pedido de ${money(o.total)} de ${o.customer} por aprobar`, action: "Revisar", href: "/dashboard/approval", at: o.at, amount: o.total })),
    ...pulse.payments.map(o => ({ key: `payment:${o.id}`, kind: "payment" as const, text: `${o.customer} pagó ${money(o.total)}`, action: "Ver pedido", href: `/dashboard/orders/${o.id}`, at: o.at, amount: o.total })),
    ...pulse.sales.map(o => ({ key: `sale:${o.id}`, kind: "sale" as const, text: `NEXO vendió ${money(o.total)} a ${o.customer}`, action: "Ver pedido", href: `/dashboard/orders/${o.id}`, at: o.at, amount: o.total })),
    ...pulse.stockouts.map(v => ({ key: `stock:${v.id}`, kind: "stock" as const, text: `Se agotó ${v.label}`, action: "Actualizar stock", href: "/dashboard/catalog", at: pulse.at })),
    ...pulse.tasks.map(t => ({ key: `task:${t.id}:${t.due_at}`, kind: "task" as const, text: `Tarea vencida: ${t.title}`, action: "Ver tareas", href: "/dashboard/workspace", at: t.due_at })),
    ...pulse.jobs.map(j => ({ key: `job:${j.id}`, kind: "job" as const, text: j.status === "done" ? `Terminé: ${j.summary ?? jobShortLabels[j.kind]}` : `No pude terminar: ${jobShortLabels[j.kind]}${j.summary ? ` (${j.summary})` : ""}`,
      action: j.status === "done" ? "Ver resultado" : "Ver detalle", href: `/dashboard/jobs/${j.id}`, at: j.at })),
  ];
}

/** Keys NEXO already knows about, with the last time each was present. */
export type Seen = Record<string, number>;
const FORGET_AFTER = 2 * 86400000;

/**
 * What is new since the last check. The first check only learns the current state, so
 * turning alerts on never floods the bubble with old cases. Something that stays
 * present (an open case, a sold-out product) is announced once.
 */
export function diffPulse(pulse: Pulse, seen: Seen | null, now: number): { fresh: ProactiveAlert[]; seen: Seen } {
  const next: Seen = {};
  for (const [key, at] of Object.entries(seen ?? {})) if (now - at < FORGET_AFTER) next[key] = at;
  const fresh: ProactiveAlert[] = [];
  for (const alert of pulseAlerts(pulse)) {
    if (seen && !(alert.key in next)) fresh.push(alert);
    next[alert.key] = now;
  }
  return { fresh, seen: next };
}

const GROUPED: Record<AlertKind, (items: ProactiveAlert[], total: number) => Pick<ProactiveAlert, "text" | "action" | "href">> = {
  handoff: items => ({ text: `${items.length} clientes esperan un asesor`, action: "Atender", href: "/dashboard/handoffs" }),
  approval: items => ({ text: `${items.length} pedidos esperan tu aprobación`, action: "Revisar", href: "/dashboard/approval" }),
  payment: (items, total) => ({ text: `Recibiste ${items.length} pagos por ${money(total)}`, action: "Ver pedidos", href: "/dashboard/orders" }),
  sale: (items, total) => ({ text: `NEXO vendió ${items.length} pedidos por ${money(total)}`, action: "Ver pedidos", href: "/dashboard/orders" }),
  stock: items => ({ text: `Se agotaron ${items.length} productos`, action: "Actualizar stock", href: "/dashboard/catalog" }),
  task: items => ({ text: `Tienes ${items.length} tareas vencidas`, action: "Ver tareas", href: "/dashboard/workspace" }),
  job: items => ({ text: `Terminaron ${items.length} trabajos`, action: "Ver trabajos", href: "/dashboard/jobs" }),
};
/** Only the kinds the person wants, and three or more of a kind become a single alert. */
export function selectAlerts(fresh: ProactiveAlert[], settings: ProactiveSettings): ProactiveAlert[] {
  const result: ProactiveAlert[] = [];
  for (const { kind } of ALERT_KINDS) {
    if (!settings.kinds[kind]) continue;
    const items = fresh.filter(alert => alert.kind === kind);
    if (items.length >= 3) {
      const total = items.reduce((sum, item) => sum + (item.amount ?? 0), 0);
      result.push({ ...items[0], key: `group:${kind}:${items.map(item => item.key).join(",")}`, ...GROUPED[kind](items, total) });
    } else result.push(...items);
  }
  return result;
}

/** Wall clock in Colombia, independent of the computer's timezone. */
export function bogota(now: number) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" })
    .formatToParts(new Date(now)).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute), monday: parts.weekday === "Mon" };
}
const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));

export function isQuiet(settings: ProactiveSettings, now: number): boolean {
  if (!settings.quiet.enabled) return false;
  const current = bogota(now).minutes, from = minutes(settings.quiet.from), to = minutes(settings.quiet.to);
  return from <= to ? current >= from && current < to : current >= from || current < to;
}

/** Routines whose time arrived today and were not delivered yet (up to 4 hours late). */
export function dueRoutines(settings: ProactiveSettings, now: number, delivered: Partial<Record<RoutineId, string>>): RoutineId[] {
  const clock = bogota(now);
  return ROUTINES.filter(({ id, monday }) => {
    const routine = settings.routines[id];
    if (!routine.enabled || (monday && !clock.monday) || delivered[id] === clock.date) return false;
    const late = clock.minutes - minutes(routine.time);
    return late >= 0 && late <= 240;
  }).map(({ id }) => id);
}

export type RoutineCard = { id: RoutineId; title: string; headline: string; items: BriefingItem[] };

export function buildEvening(data: BriefingData): RoutineCard {
  const { today } = data;
  const items: BriefingItem[] = [];
  if (today.orders > 0) {
    const nexo = today.agentOrders > 0 ? ` NEXO cerró ${today.agentOrders === today.orders ? "todos" : today.agentOrders}.` : "";
    items.push({ id: "today", tone: "good", text: `Hoy vendiste ${money(today.sales)} en ${plural(today.orders, "pedido", "pedidos")}.${nexo}`, action: { label: "Ver pedidos", href: "/dashboard/orders" } });
  } else items.push({ id: "today", tone: "info", text: "Hoy no hubo ventas confirmadas." });
  if (today.collected > 0) items.push({ id: "collected", tone: "good", text: `Cobraste ${money(today.collected)} en ${plural(today.paidOrders, "pedido", "pedidos")}.` });
  if (data.unpaid.count > 0) items.push({ id: "unpaid", tone: "warning", text: `Quedan ${plural(data.unpaid.count, "pedido", "pedidos")} por cobrar por ${money(data.unpaid.total)}.`, action: { label: "Ver pedidos", href: "/dashboard/orders" } });
  if (data.handoffs.count > 0) items.push({ id: "handoffs", tone: "warning", text: `${plural(data.handoffs.count, "cliente sigue", "clientes siguen")} esperando un asesor.`, action: { label: "Atender", href: "/dashboard/handoffs" } });
  if (data.tasksDue > 0) items.push({ id: "tasks", tone: "info", text: `Te ${data.tasksDue === 1 ? "queda" : "quedan"} ${plural(data.tasksDue, "tarea", "tareas")} para hoy.`, action: { label: "Ver tareas", href: "/dashboard/workspace" } });
  return { id: "evening", title: "Cierre del día", headline: items.slice(0, 3).map(item => item.text).join(" "), items };
}

export function buildWeekly(metrics: SalesMetrics): RoutineCard {
  const { current: now, previous: before } = metrics;
  const items: BriefingItem[] = [];
  if (now.orders > 0) {
    const delta = before.sales > 0 ? Math.round(((now.sales - before.sales) / before.sales) * 100) : null;
    const trend = delta === null || delta === 0 ? "" : ` (${Math.abs(delta)}% ${delta > 0 ? "más" : "menos"} que la anterior)`;
    items.push({ id: "sales", tone: delta !== null && delta < 0 ? "info" : "good", text: `Esta semana vendiste ${money(now.sales)} en ${plural(now.orders, "pedido", "pedidos")}${trend}.`, action: { label: "Ver resultados", href: "/dashboard" } });
    if (now.agentOrders > 0) items.push({ id: "nexo", tone: "good", text: `NEXO cerró ${plural(now.agentOrders, "venta", "ventas")} por ${money(now.agentSales)}.` });
  } else items.push({ id: "sales", tone: "info", text: "Esta semana no hubo ventas confirmadas." });
  if (now.collected > 0) items.push({ id: "collected", tone: "good", text: `Cobraste ${money(now.collected)}${now.recovered > 0 ? `; ${money(now.recovered)} llegaron tras un recordatorio` : ""}.` });
  if (metrics.topProducts[0]) items.push({ id: "top", tone: "info", text: `Lo más vendido: ${metrics.topProducts[0].name} (${metrics.topProducts[0].qty} u).` });
  return { id: "weekly", title: "Cierre de la semana", headline: items.slice(0, 3).map(item => item.text).join(" "), items };
}
