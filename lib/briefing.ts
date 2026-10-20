import type { SalesWindow } from "@/lib/sales-metrics";

/** Facts from nexo_daily_briefing. The text is built from them by rules: no model, no invention. */
export type BriefingData = {
  date: string;
  today: SalesWindow; yesterday: SalesWindow; dayBefore: SalesWindow;
  unpaid: { count: number; total: number; oldest: string | null };
  pendingApproval: number;
  handoffs: { count: number; oldest: string | null; customer: string | null };
  lowStock: { count: number; outOfStock: number; items: { name: string; sku: string; available: number }[] };
  tasksDue: number;
};
export type BriefingItem = { id: string; tone: "good" | "warning" | "info"; text: string; action?: { label: string; href: string } };
export type Briefing = { date: string; headline: string; items: BriefingItem[] };

const money = (value: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
function waited(since: string | null, now: number): string | null {
  if (!since) return null;
  const minutes = Math.max(1, Math.round((now - Date.parse(since)) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} días`;
}
function greeting(now: number, name?: string) {
  const hour = Number(new Date(now).toLocaleString("en-US", { timeZone: "America/Bogota", hour: "numeric", hour12: false })) % 24;
  const salute = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
  return name ? `${salute}, ${name}.` : `${salute}.`;
}

export function buildBriefing(data: BriefingData, options: { name?: string; now?: number } = {}): Briefing {
  const now = options.now ?? Date.now();
  const items: BriefingItem[] = [];
  const { yesterday, dayBefore, today } = data;

  if (yesterday.orders > 0) {
    const delta = dayBefore.sales > 0 ? Math.round(((yesterday.sales - dayBefore.sales) / dayBefore.sales) * 100) : null;
    const trend = delta === null || delta === 0 ? "" : delta > 0 ? ` (${delta}% más que el día anterior)` : ` (${Math.abs(delta)}% menos que el día anterior)`;
    const nexo = yesterday.agentOrders > 0 ? ` Zorax cerró ${yesterday.agentOrders === yesterday.orders ? "todos" : yesterday.agentOrders}.` : "";
    items.push({ id: "yesterday", tone: delta !== null && delta < 0 ? "info" : "good", text: `Ayer vendiste ${money(yesterday.sales)} en ${plural(yesterday.orders, "pedido", "pedidos")}${trend}.${nexo}`, action: { label: "Ver resultados", href: "/dashboard" } });
  } else {
    items.push({ id: "yesterday", tone: "info", text: "Ayer no hubo ventas confirmadas." });
  }
  if (today.orders > 0) items.push({ id: "today", tone: "good", text: `Hoy llevas ${money(today.sales)} en ${plural(today.orders, "pedido", "pedidos")}.` });
  if (data.handoffs.count > 0) {
    const wait = waited(data.handoffs.oldest, now);
    const who = data.handoffs.customer ? `${data.handoffs.customer}${data.handoffs.count > 1 ? ` y ${plural(data.handoffs.count - 1, "cliente más", "clientes más")}` : ""}` : plural(data.handoffs.count, "cliente", "clientes");
    items.push({ id: "handoffs", tone: "warning", text: `${who} ${data.handoffs.count > 1 ? "esperan" : "espera"} un asesor${wait ? ` desde hace ${wait}` : ""}.`, action: { label: "Atender", href: "/dashboard/handoffs" } });
  }
  if (data.unpaid.count > 0) items.push({ id: "unpaid", tone: "warning", text: `${plural(data.unpaid.count, "pedido espera", "pedidos esperan")} pago por ${money(data.unpaid.total)}.`, action: { label: "Ver pedidos", href: "/dashboard/orders" } });
  if (data.pendingApproval > 0) items.push({ id: "approval", tone: "warning", text: `${plural(data.pendingApproval, "pedido necesita", "pedidos necesitan")} tu aprobación.`, action: { label: "Revisar", href: "/dashboard/approval" } });
  if (data.lowStock.count > 0) {
    const first = data.lowStock.items[0];
    const text = data.lowStock.count === 1 && first
      ? first.available <= 0 ? `${first.name} está agotado.` : `A ${first.name} le ${first.available === 1 ? "queda 1 unidad" : `quedan ${first.available} unidades`}.`
      : `${plural(data.lowStock.count, "producto está agotado o por agotarse", "productos están agotados o por agotarse")}${data.lowStock.outOfStock ? ` (${data.lowStock.outOfStock} sin stock)` : ""}: ${data.lowStock.items.slice(0, 3).map(item => item.name).join(", ")}.`;
    items.push({ id: "stock", tone: "warning", text, action: { label: "Actualizar stock", href: "/dashboard/catalog" } });
  }
  if (data.tasksDue > 0) items.push({ id: "tasks", tone: "info", text: `Tienes ${plural(data.tasksDue, "tarea", "tareas")} para hoy.`, action: { label: "Ver tareas", href: "/dashboard/workspace" } });
  if (!items.some(item => item.tone === "warning")) items.push({ id: "clear", tone: "good", text: "Todo en orden: nadie espera un asesor y no hay pedidos por cobrar." });

  // Spoken version: greeting plus the three most useful facts, kept short.
  const spoken = [items.find(i => i.id === "yesterday"), ...items.filter(i => i.tone === "warning")].filter(Boolean).slice(0, 3).map(i => i!.text);
  return { date: data.date, headline: [greeting(now, options.name), ...spoken].join(" "), items };
}
