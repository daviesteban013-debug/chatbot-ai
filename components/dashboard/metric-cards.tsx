import { CalendarCheck2, MessageCircleMore, ShoppingBag, TrendingUp } from "lucide-react";

const metrics = [
  {
    label: "Citas de hoy",
    value: "12",
    change: "+20%",
    helper: "vs. ayer",
    icon: CalendarCheck2,
    color: "bg-violet-50 text-violet-600",
  },
  {
    label: "Pedidos recibidos",
    value: "28",
    change: "+14%",
    helper: "esta semana",
    icon: ShoppingBag,
    color: "bg-amber-50 text-amber-600",
  },
  {
    label: "Conversaciones",
    value: "184",
    change: "+32%",
    helper: "este mes",
    icon: MessageCircleMore,
    color: "bg-sky-50 text-sky-600",
  },
  {
    label: "Conversión",
    value: "36%",
    change: "+5.2%",
    helper: "este mes",
    icon: TrendingUp,
    color: "bg-emerald-50 text-emerald-600",
  },
];

export function MetricCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(({ label, value, change, helper, icon: Icon, color }) => (
        <article key={label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
          <div className="flex items-start justify-between">
            <span className={`flex size-10 items-center justify-center rounded-xl ${color}`}>
              <Icon className="size-5" />
            </span>
            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-600">
              {change}
            </span>
          </div>
          <p className="mt-5 text-3xl font-semibold tracking-tight text-slate-950">{value}</p>
          <div className="mt-1 flex items-center gap-1.5 text-xs">
            <span className="font-medium text-slate-700">{label}</span>
            <span className="text-slate-400">· {helper}</span>
          </div>
        </article>
      ))}
    </div>
  );
}
