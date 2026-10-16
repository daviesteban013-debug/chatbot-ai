import type { JobProgress } from "../types";
import type { Checkpoint, Recipe } from "../worker";

export type CollectionOrder = {
  id: string; total: number; created_at: string; payment_method: string | null; conversation_id: string | null;
  customer: { id: string; name: string | null; phone: string };
  state: "scheduled" | "reminded" | "requires_call"; reason?: string; due_at?: string; reminded_at?: string; reminders: number;
};
export type CollectionCustomer = { id: string; name: string | null; phone: string; total: number; orders: Omit<CollectionOrder, "customer">[] };
type State = { enqueued: boolean; after: { created_at: string; id: string } | null; orders: CollectionOrder[]; pages: number; warnings: string[] };

const PAGE = 100;
const MAX_ORDERS = 2000;
const MAX_CSV_BYTES = 64 * 1024;
const MIN_STEP_MS = 6000;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const money = (value: number) => `$ ${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value)}`;
const csvCell = (value: unknown) => { const text = value === null || value === undefined ? "" : String(value); return /[",\n;]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text; };

const stateOf = (checkpoint: Checkpoint): State => ({
  enqueued: checkpoint.enqueued === true,
  after: record(checkpoint.after) && typeof checkpoint.after.created_at === "string" && typeof checkpoint.after.id === "string" ? { created_at: checkpoint.after.created_at, id: checkpoint.after.id } : null,
  orders: Array.isArray(checkpoint.orders) ? checkpoint.orders as CollectionOrder[] : [],
  pages: typeof checkpoint.pages === "number" ? checkpoint.pages : 0,
  warnings: Array.isArray(checkpoint.warnings) ? checkpoint.warnings as string[] : [],
});
const progressOf = (cp: State): JobProgress => ({ done: cp.orders.length, step: "Revisando pedidos por cobrar" });

function orderOf(raw: unknown, status: unknown): CollectionOrder | null {
  if (!record(raw) || typeof raw.id !== "string" || !record(raw.customer) || typeof raw.customer.phone !== "string" || typeof raw.customer.id !== "string") return null;
  const s = record(status) ? status : {};
  const state = s.state === "scheduled" || s.state === "reminded" ? s.state : "requires_call";
  return {
    id: raw.id, total: Number(raw.total) || 0, created_at: String(raw.created_at ?? ""), payment_method: typeof raw.payment_method === "string" ? raw.payment_method : null,
    conversation_id: typeof raw.conversation_id === "string" ? raw.conversation_id : null,
    customer: { id: raw.customer.id, name: typeof raw.customer.name === "string" ? raw.customer.name : null, phone: raw.customer.phone },
    state, reminders: Number(s.reminders) || 0,
    ...(state === "requires_call" ? { reason: typeof s.reason === "string" ? s.reason : "not_eligible" } : {}),
    ...(typeof s.due_at === "string" ? { due_at: s.due_at } : {}), ...(typeof s.reminded_at === "string" ? { reminded_at: s.reminded_at } : {}),
  };
}

/** Deterministic report: who owes what, and whether NEXO is already reminding them. No model. */
export function buildReport(orders: CollectionOrder[]) {
  const byCustomer = new Map<string, CollectionCustomer>();
  for (const { customer, ...order } of orders) {
    const entry = byCustomer.get(customer.id) ?? { ...customer, total: 0, orders: [] };
    entry.total += order.total; entry.orders.push(order);
    byCustomer.set(customer.id, entry);
  }
  const customers = [...byCustomer.values()].sort((a, b) => b.total - a.total || a.phone.localeCompare(b.phone));
  const counts = {
    orders: orders.length, customers: customers.length, total: orders.reduce((sum, order) => sum + order.total, 0),
    scheduled: orders.filter(order => order.state === "scheduled").length, reminded: orders.filter(order => order.state === "reminded").length,
    requires_call: orders.filter(order => order.state === "requires_call").length,
  };
  const lines = ["Cliente,Teléfono,Pedido,Fecha,Total,Estado,Motivo"];
  let bytes = lines[0].length + 1; let csvTruncated = false;
  for (const customer of customers) for (const order of customer.orders) {
    const line = [customer.name ?? "", customer.phone, order.id, order.created_at.slice(0, 10), order.total, order.state, order.reason ?? ""].map(csvCell).join(",");
    if (bytes + line.length + 1 > MAX_CSV_BYTES) { csvTruncated = true; break; }
    lines.push(line); bytes += line.length + 1;
  }
  const summary = counts.orders
    ? `Revisé ${counts.orders} pedido${counts.orders === 1 ? "" : "s"} por cobrar (${money(counts.total)}): ${counts.scheduled} con recordatorio en cola, ${counts.reminded} ya recordado${counts.reminded === 1 ? "" : "s"}, ${counts.requires_call} requiere${counts.requires_call === 1 ? "" : "n"} tu llamada`
    : "No hay pedidos por cobrar ahora mismo";
  return { summary, counts, customers, csv: lines.join("\n"), csv_truncated: csvTruncated };
}

/** Reads every unpaid order and where it stands with the reminder queue. Never sends anything. */
export const collectionsReview: Recipe = async ctx => {
  const cp = stateOf(ctx.checkpoint);
  const snapshot = (): Checkpoint => ({ ...cp });
  if (!cp.enqueued) {
    // The reminder queue decides by itself which orders qualify; refreshing it first makes the report current.
    const { error } = await ctx.admin.rpc("nexo_enqueue_sales_followups").abortSignal(AbortSignal.timeout(20_000));
    if (error) cp.warnings.push("No pude actualizar la cola de recordatorios; el informe usa su estado anterior.");
    cp.enqueued = true;
    await ctx.heartbeat(progressOf(cp), snapshot());
  }
  while (cp.orders.length < MAX_ORDERS) {
    if (ctx.remaining() < MIN_STEP_MS) return { kind: "release", checkpoint: snapshot(), progress: progressOf(cp) };
    const { data: page, error } = await ctx.admin.rpc("nexo_unpaid_orders", {
      p_tenant: ctx.job.tenant_id, p_after_created: cp.after?.created_at ?? null, p_after_id: cp.after?.id ?? null, p_limit: PAGE,
    }).abortSignal(AbortSignal.timeout(15_000));
    if (error || !Array.isArray(page)) throw new Error("No pude leer los pedidos por cobrar. Inténtalo de nuevo.");
    if (!page.length) break;
    const ids = page.flatMap(order => record(order) && typeof order.id === "string" ? [order.id] : []);
    const { data: statuses, error: statusError } = await ctx.admin.rpc("nexo_collections_status", { p_tenant: ctx.job.tenant_id, p_orders: ids }).abortSignal(AbortSignal.timeout(15_000));
    if (statusError || !record(statuses)) throw new Error("No pude leer los pedidos por cobrar. Inténtalo de nuevo.");
    for (const raw of page) {
      const order = orderOf(raw, record(raw) && typeof raw.id === "string" ? statuses[raw.id] : null);
      if (order) cp.orders.push(order);
    }
    const last = page[page.length - 1];
    cp.after = record(last) && typeof last.created_at === "string" && typeof last.id === "string" ? { created_at: last.created_at, id: last.id } : cp.after;
    cp.pages++;
    await ctx.heartbeat(progressOf(cp), snapshot());
    if (page.length < PAGE) break;
  }
  const report = buildReport(cp.orders);
  if (cp.orders.length >= MAX_ORDERS) cp.warnings.push(`Revisé los ${MAX_ORDERS} pedidos más antiguos; los demás no están en este informe.`);
  return { kind: "done", result: { ...report, warnings: cp.warnings, truncated: cp.orders.length >= MAX_ORDERS } };
};
