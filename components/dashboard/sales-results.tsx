"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Bot, Minus, ShoppingBag, Sparkles, Wallet } from "lucide-react";
import { formatCOP } from "@/lib/utils";
import { METRIC_PERIODS, change, compactCOP, niceMax, ratio, type SalesMetrics } from "@/lib/sales-metrics";

const BAR = "#2563eb"; // single series: one hue (blue-600) on the white card surface
const dayLabel = (day: string, options: Intl.DateTimeFormatOptions) =>
  new Date(`${day}T12:00:00-05:00`).toLocaleDateString("es-CO", { timeZone: "America/Bogota", ...options });
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** Compact axis label: "19 sep". */
const shortDay = (day: string) => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;

export function SalesResults({ metrics }: { metrics: SalesMetrics }) {
  const { current: now, previous: before, days } = metrics;
  const empty = !now.orders && !now.conversations;
  const tiles = [
    { label: "Ventas confirmadas", value: formatCOP(now.sales), detail: `${now.orders} pedido${now.orders === 1 ? "" : "s"}`, icon: ShoppingBag, delta: change(now.sales, before.sales) },
    { label: "Vendido por NEXO", value: formatCOP(now.agentSales), detail: now.sales ? `${ratio(now.agentSales, now.sales)}% de tus ventas` : "Sin ventas aún", icon: Bot, delta: change(now.agentSales, before.agentSales) },
    { label: "Cobrado", value: formatCOP(now.collected), detail: `${now.paidOrders} pedido${now.paidOrders === 1 ? "" : "s"} pagado${now.paidOrders === 1 ? "" : "s"}`, icon: Wallet, delta: change(now.collected, before.collected) },
    { label: "Recuperado con seguimientos", value: formatCOP(now.recovered), detail: `${now.recoveredOrders} pago${now.recoveredOrders === 1 ? "" : "s"} tras un recordatorio`, icon: Sparkles, delta: change(now.recovered, before.recovered) },
  ];

  return (
    <section aria-labelledby="results-title" className="mb-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="results-title" className="font-semibold text-slate-950">Resultados de NEXO</h2>
          <p className="mt-1 text-xs text-slate-500">Últimos {days} días, comparado con los {days} anteriores · hora de Colombia</p>
        </div>
        <nav aria-label="Periodo" className="flex rounded-xl border border-slate-200 bg-white p-1">
          {METRIC_PERIODS.map(period => (
            <Link key={period} href={`/dashboard?periodo=${period}`} scroll={false} aria-current={period === days ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${period === days ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900"}`}>
              {period} días
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(({ label, value, detail, icon: Icon, delta }) => (
          <article key={label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-xs font-medium text-slate-500"><Icon className="size-4 text-slate-400" />{label}</span>
              <Delta {...delta} />
            </div>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 tabular-nums">{value}</p>
            <p className="mt-1 text-xs text-slate-500">{detail}</p>
          </article>
        ))}
      </div>

      {empty ? (
        <p className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          Aún no hay conversaciones ni ventas en este periodo. Cuando NEXO atienda a tus clientes por WhatsApp, aquí verás lo que vende y cobra.
        </p>
      ) : (
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.4fr_.6fr] xl:items-start">
          <DailySales daily={metrics.daily} />
          <div className="grid gap-4">
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
  const tone = direction === "up" ? "bg-emerald-50 text-emerald-700" : direction === "down" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600";
  const text = percent === null ? "Nuevo" : `${percent > 0 ? "+" : ""}${percent}%`;
  return <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`} title="Frente al periodo anterior"><Icon className="size-3" />{text}</span>;
}

function DailySales({ daily }: { daily: SalesMetrics["daily"] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(...daily.map(d => d.sales), 0));
  const ticks = [max, max / 2, 0];
  const best = daily.reduce((top, d, i) => (d.sales > (daily[top]?.sales ?? 0) ? i : top), 0);
  const shown = active ?? (daily[best]?.sales ? best : null);
  const labelEvery = daily.length > 31 ? 15 : daily.length > 7 ? 5 : 1;
  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">Ventas confirmadas por día</h3>
          <p className="mt-1 text-xs text-slate-500">Valor de los pedidos confirmados por el cliente (pagados o no)</p>
        </div>
        {shown !== null && (
          <p className="text-right text-xs text-slate-500" aria-live="polite">
            <span className="block font-medium text-slate-900">{dayLabel(daily[shown].day, { weekday: "short", day: "numeric", month: "short" })}</span>
            {formatCOP(daily[shown].sales)} · {daily[shown].orders} pedido{daily[shown].orders === 1 ? "" : "s"}
          </p>
        )}
      </div>
      <div className="mt-5 flex gap-3">
        <div className="flex h-48 flex-col justify-between text-right text-[11px] tabular-nums text-slate-400" aria-hidden="true">
          {ticks.map(tick => <span key={tick} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">{compactCOP(tick)}</span>)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-48">
          <div className="absolute inset-0 flex flex-col justify-between" aria-hidden="true">
            {ticks.map(tick => <div key={tick} className="border-t border-slate-100" />)}
          </div>
          <div className="relative flex h-48 items-end gap-[2px]" role="list" aria-label="Ventas por día">
            {daily.map((d, index) => (
              <button key={d.day} type="button" role="listitem" onMouseEnter={() => setActive(index)} onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(index)} onBlur={() => setActive(null)}
                aria-label={`${dayLabel(d.day, { day: "numeric", month: "long" })}: ${formatCOP(d.sales)}, ${d.orders} pedidos`}
                className="group flex h-full flex-1 items-end justify-center focus-visible:outline-none">
                <span className="w-full max-w-6 rounded-t-[4px] transition-opacity group-hover:opacity-80 group-focus-visible:ring-2 group-focus-visible:ring-slate-900"
                  style={{ height: d.sales ? `${Math.max((d.sales / max) * 100, 1.5)}%` : "0", background: BAR, opacity: active === null || active === index ? 1 : 0.45 }} />
              </button>
            ))}
          </div>
          </div>
          <div className="mt-2 flex gap-[2px] text-[11px] text-slate-400" aria-hidden="true">
            {daily.map((d, index) => (
              <span key={d.day} className="flex flex-1 justify-center overflow-visible whitespace-nowrap">{(daily.length - 1 - index) % labelEvery === 0 ? (daily.length > 7 ? shortDay(d.day) : dayLabel(d.day, { weekday: "short" })) : ""}</span>
            ))}
          </div>
        </div>
      </div>
      <details className="mt-4 text-xs text-slate-500">
        <summary className="cursor-pointer select-none hover:text-slate-900">Ver como tabla</summary>
        <div className="mt-2 max-h-56 overflow-y-auto">
          <table className="w-full text-left tabular-nums">
            <thead><tr className="text-slate-400"><th className="py-1 font-medium">Día</th><th className="py-1 text-right font-medium">Pedidos</th><th className="py-1 text-right font-medium">Ventas</th></tr></thead>
            <tbody>{daily.map(d => <tr key={d.day} className="border-t border-slate-100"><td className="py-1">{dayLabel(d.day, { day: "numeric", month: "short" })}</td><td className="py-1 text-right">{d.orders}</td><td className="py-1 text-right">{formatCOP(d.sales)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </article>
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
    <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
      <h3 className="text-sm font-semibold text-slate-950">De la conversación al pago</h3>
      <p className="mt-1 text-xs text-slate-500">{conversion === null ? "Sin conversaciones en el periodo" : `${conversion}% de las conversaciones terminó en pedido`}</p>
      <ul className="mt-4 space-y-3">
        {steps.map(step => (
          <li key={step.label}>
            <div className="flex items-baseline justify-between gap-3 text-xs"><span className="text-slate-600">{step.label}</span><span className="font-semibold tabular-nums text-slate-900">{step.value}</span></div>
            <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full" style={{ width: `${conversations ? Math.max((step.value / conversations) * 100, step.value ? 2 : 0) : 0}%`, background: BAR }} /></div>
          </li>
        ))}
      </ul>
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-xs">
        <div><dt className="text-slate-500">Atendidas sin asesor</dt><dd className="mt-0.5 font-semibold text-slate-900">{autonomous === null ? "—" : `${autonomous}%`}</dd></div>
        <div><dt className="text-slate-500">Respuesta promedio</dt><dd className="mt-0.5 font-semibold text-slate-900">{avgReplyMs ? `${Math.max(1, Math.round(avgReplyMs / 1000))} s` : "—"}</dd></div>
      </dl>
    </article>
  );
}

function TopProducts({ products }: { products: SalesMetrics["topProducts"] }) {
  const max = Math.max(...products.map(p => p.qty), 1);
  return (
    <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
      <h3 className="text-sm font-semibold text-slate-950">Lo más vendido</h3>
      {products.length ? (
        <ul className="mt-4 space-y-3">
          {products.map(product => (
            <li key={product.name}>
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="truncate text-slate-600" title={product.name}>{product.name}</span>
                <span className="shrink-0 tabular-nums text-slate-900"><span className="font-semibold">{product.qty} u</span> · {compactCOP(product.sales)}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full" style={{ width: `${(product.qty / max) * 100}%`, background: BAR }} /></div>
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-xs text-slate-500">Todavía no hay productos vendidos en este periodo.</p>}
    </article>
  );
}
