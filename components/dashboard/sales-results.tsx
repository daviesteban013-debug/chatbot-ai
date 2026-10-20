"use client";

import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Panel, Segmented, Stat, StatGrid } from "./panel";
import { formatCOP } from "@/lib/utils";
import { METRIC_PERIODS, change, compactCOP, niceMax, ratio, type SalesMetrics } from "@/lib/sales-metrics";

const BAR = "#3f3f46"; // single series: one calm neutral hue on the white surface
const dayLabel = (day: string, options: Intl.DateTimeFormatOptions) =>
  new Date(`${day}T12:00:00-05:00`).toLocaleDateString("es-CO", { timeZone: "America/Bogota", ...options });
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** Compact axis label: "19 sep". */
const shortDay = (day: string) => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;

export function SalesResults({ metrics }: { metrics: SalesMetrics }) {
  const { current: now, previous: before, days } = metrics;
  const empty = !now.orders && !now.conversations;
  const tiles = [
    { label: "Ventas confirmadas", value: formatCOP(now.sales), detail: `${now.orders} pedido${now.orders === 1 ? "" : "s"}`, delta: change(now.sales, before.sales) },
    { label: "Vendido por Zorax", value: formatCOP(now.agentSales), detail: now.sales ? `${ratio(now.agentSales, now.sales)}% de tus ventas` : "Sin ventas aún", delta: change(now.agentSales, before.agentSales) },
    { label: "Cobrado", value: formatCOP(now.collected), detail: `${now.paidOrders} pedido${now.paidOrders === 1 ? "" : "s"} pagado${now.paidOrders === 1 ? "" : "s"}`, delta: change(now.collected, before.collected) },
    { label: "Recuperado con seguimientos", value: formatCOP(now.recovered), detail: `${now.recoveredOrders} pago${now.recoveredOrders === 1 ? "" : "s"} tras un recordatorio`, delta: change(now.recovered, before.recovered) },
  ];

  return (
    <section aria-labelledby="results-title" className="mb-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="results-title" className="text-sm font-semibold text-ink">Resultados de Zorax</h2>
          <p className="mt-0.5 text-xs text-muted">Últimos {days} días frente a los {days} anteriores · hora de Colombia</p>
        </div>
        <Segmented label="Periodo" value={String(days)} options={METRIC_PERIODS.map(period => ({ value: String(period), label: `${period} días`, href: `/dashboard?periodo=${period}` }))} />
      </div>

      <StatGrid className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(({ label, value, detail, delta }) => <Stat key={label} label={label} value={value} detail={detail} delta={<Delta {...delta} />} />)}
      </StatGrid>

      {empty ? (
        <p className="mt-3 rounded-lg border border-dashed border-line-strong bg-surface p-6 text-center text-sm text-muted">
          Aún no hay conversaciones ni ventas en este periodo. Cuando Zorax atienda a tus clientes por WhatsApp, aquí verás lo que vende y cobra.
        </p>
      ) : (
        <div className="mt-3 grid gap-3 xl:grid-cols-[1.4fr_.6fr] xl:items-start">
          <DailySales daily={metrics.daily} />
          <div className="grid gap-3">
            <Funnel metrics={metrics} />
            <TopProducts products={metrics.topProducts} />
          </div>
        </div>
      )}
    </section>
  );
}

function Delta({ direction, percent }: ReturnType<typeof change>) {
  if (percent === null && direction === "flat") return null;
  const Icon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : Minus;
  const tone = direction === "up" ? "text-emerald-700" : direction === "down" ? "text-rose-700" : "text-muted";
  const text = percent === null ? "Nuevo" : `${percent > 0 ? "+" : ""}${percent}%`;
  return <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums ${tone}`} title="Frente al periodo anterior"><Icon className="size-3" />{text}</span>;
}

function DailySales({ daily }: { daily: SalesMetrics["daily"] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(...daily.map(d => d.sales), 0));
  const ticks = [max, max / 2, 0];
  const best = daily.reduce((top, d, i) => (d.sales > (daily[top]?.sales ?? 0) ? i : top), 0);
  const shown = active ?? (daily[best]?.sales ? best : null);
  const labelEvery = daily.length > 31 ? 15 : daily.length > 7 ? 5 : 1;
  return (
    <Panel as="article" className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold text-ink">Ventas confirmadas por día</h3>
          <p className="mt-1 text-xs text-muted">Valor de los pedidos confirmados por el cliente (pagados o no)</p>
        </div>
        {shown !== null && (
          <p className="text-right text-xs text-muted" aria-live="polite">
            <span className="block font-medium text-ink">{dayLabel(daily[shown].day, { weekday: "short", day: "numeric", month: "short" })}</span>
            {formatCOP(daily[shown].sales)} · {daily[shown].orders} pedido{daily[shown].orders === 1 ? "" : "s"}
          </p>
        )}
      </div>
      <div className="mt-5 flex gap-3">
        <div className="flex h-48 flex-col justify-between text-right text-[11px] tabular-nums text-muted" aria-hidden="true">
          {ticks.map(tick => <span key={tick} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">{compactCOP(tick)}</span>)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-48">
          <div className="absolute inset-0 flex flex-col justify-between" aria-hidden="true">
            {ticks.map(tick => <div key={tick} className="border-t border-line" />)}
          </div>
          <div className="relative flex h-48 items-end gap-[2px]" role="list" aria-label="Ventas por día">
            {daily.map((d, index) => (
              <button key={d.day} type="button" role="listitem" onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(index)} onBlur={() => setActive(null)}
                aria-label={`${dayLabel(d.day, { day: "numeric", month: "long" })}: ${formatCOP(d.sales)}, ${d.orders} pedidos`}
                className="group flex h-full flex-1 items-end justify-center focus-visible:outline-none">
                <span className="w-full max-w-6 rounded-t-[4px] transition-opacity group-hover:opacity-80 group-focus-visible:ring-2 group-focus-visible:ring-ink"
                  style={{ height: d.sales ? `${Math.max((d.sales / max) * 100, 1.5)}%` : "0", background: BAR, opacity: active === null || active === index ? 1 : 0.45 }} />
              </button>
            ))}
          </div>
          </div>
          <div className="mt-2 flex gap-[2px] text-[11px] text-muted" aria-hidden="true">
            {daily.map((d, index) => (
              <span key={d.day} className="flex flex-1 justify-center overflow-visible whitespace-nowrap">{(daily.length - 1 - index) % labelEvery === 0 ? (daily.length > 7 ? shortDay(d.day) : dayLabel(d.day, { weekday: "short" })) : ""}</span>
            ))}
          </div>
        </div>
      </div>
      <details className="mt-4 text-xs text-muted">
        <summary className="cursor-pointer select-none hover:text-ink">Ver como tabla</summary>
        <div className="mt-2 max-h-56 overflow-y-auto">
          <table className="w-full text-left tabular-nums">
            <thead><tr className="text-muted"><th className="py-1 font-medium">Día</th><th className="py-1 text-right font-medium">Pedidos</th><th className="py-1 text-right font-medium">Ventas</th></tr></thead>
            <tbody>{daily.map(d => <tr key={d.day} className="border-t border-line"><td className="py-1">{dayLabel(d.day, { day: "numeric", month: "short" })}</td><td className="py-1 text-right">{d.orders}</td><td className="py-1 text-right">{formatCOP(d.sales)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </Panel>
  );
}

function Funnel({ metrics }: { metrics: SalesMetrics }) {
  const { conversations, converted, paidOrders, handoffs, avgReplyMs } = metrics.current;
  const steps = [
    { label: "Conversaciones con clientes", value: conversations },
    { label: "Terminaron en pedido", value: converted },
    { label: "Pedidos pagados", value: paidOrders },
  ];
  const conversion = ratio(converted, conversations);
  const autonomous = ratio(Math.max(conversations - handoffs, 0), conversations);
  return (
    <Panel as="article" className="p-4 sm:p-5">
      <h3 className="text-[13px] font-semibold text-ink">De la conversación al pago</h3>
      <p className="mt-1 text-xs text-muted">{conversion === null ? "Sin conversaciones en el periodo" : `${conversion}% de las conversaciones terminó en pedido`}</p>
      <ul className="mt-4 space-y-3">
        {steps.map(step => (
          <li key={step.label}>
            <div className="flex items-baseline justify-between gap-3 text-xs"><span className="text-ink-soft">{step.label}</span><span className="font-semibold tabular-nums text-ink">{step.value}</span></div>
            <div className="mt-1 h-2 rounded-full bg-subtle"><div className="h-2 rounded-full" style={{ width: `${conversations ? Math.max((step.value / conversations) * 100, step.value ? 2 : 0) : 0}%`, background: BAR }} /></div>
          </li>
        ))}
      </ul>
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-xs">
        <div><dt className="text-muted">Atendidas sin asesor</dt><dd className="mt-0.5 font-semibold text-ink">{autonomous === null ? "—" : `${autonomous}%`}</dd></div>
        <div><dt className="text-muted">Respuesta promedio</dt><dd className="mt-0.5 font-semibold text-ink">{avgReplyMs ? `${Math.max(1, Math.round(avgReplyMs / 1000))} s` : "—"}</dd></div>
      </dl>
    </Panel>
  );
}

function TopProducts({ products }: { products: SalesMetrics["topProducts"] }) {
  const max = Math.max(...products.map(p => p.qty), 1);
  return (
    <Panel as="article" className="p-4 sm:p-5">
      <h3 className="text-[13px] font-semibold text-ink">Lo más vendido</h3>
      {products.length ? (
        <ul className="mt-4 space-y-3">
          {products.map(product => (
            <li key={product.name}>
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="truncate text-ink-soft" title={product.name}>{product.name}</span>
                <span className="shrink-0 tabular-nums text-ink"><span className="font-semibold">{product.qty} u</span> · {compactCOP(product.sales)}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-subtle"><div className="h-2 rounded-full" style={{ width: `${(product.qty / max) * 100}%`, background: BAR }} /></div>
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-xs text-muted">Todavía no hay productos vendidos en este periodo.</p>}
    </Panel>
  );
}
