export const METRIC_PERIODS = [7, 30, 90] as const;
export type MetricPeriod = typeof METRIC_PERIODS[number];

export type SalesWindow = {
  conversations: number; converted: number; orders: number; sales: number;
  agentOrders: number; agentSales: number; paidOrders: number; collected: number;
  recoveredOrders: number; recovered: number; handoffs: number; avgReplyMs: number | null;
};
export type SalesMetrics = {
  days: MetricPeriod; since: string; current: SalesWindow; previous: SalesWindow;
  daily: { day: string; orders: number; sales: number }[];
  topProducts: { name: string; qty: number; sales: number }[];
};

export function metricPeriod(value: unknown): MetricPeriod {
  const number = Number(Array.isArray(value) ? value[0] : value);
  return (METRIC_PERIODS as readonly number[]).includes(number) ? number as MetricPeriod : 7;
}

/** Change against the previous period. No percentage when there was nothing to compare. */
export function change(current: number, previous: number): { direction: "up" | "down" | "flat"; percent: number | null } {
  if (current === previous) return { direction: "flat", percent: previous ? 0 : null };
  return { direction: current > previous ? "up" : "down", percent: previous ? Math.round(((current - previous) / previous) * 100) : null };
}

export const ratio = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);

/** A clean axis maximum (1, 2, 2.5 or 5 × 10ⁿ) at or above the largest value. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  return ([1, 2, 2.5, 5, 10].find(step => step * power >= value) ?? 10) * power;
}

const compact = new Intl.NumberFormat("es-CO", { notation: "compact", maximumFractionDigits: 1 });
export const compactCOP = (amount: number) => `$${compact.format(amount)}`;
