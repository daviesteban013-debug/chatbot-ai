import { Bell, Bot, ChevronRight, Clock3, Sparkles } from "lucide-react";
import { AssistantConfig } from "@/components/dashboard/assistant-config";
import { CrmTable } from "@/components/dashboard/crm-table";
import { MetricCards } from "@/components/dashboard/metric-cards";

const activity = [
  { title: "Cita confirmada", detail: "Sofía · Corte + barba", time: "Hace 4 min", color: "bg-violet-500" },
  { title: "Nuevo pedido", detail: "Diego · Pedido #1048", time: "Hace 18 min", color: "bg-amber-400" },
  { title: "Cliente recuperado", detail: "Valentina volvió a conversar", time: "Hace 42 min", color: "bg-emerald-500" },
];

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="mb-7 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-400">Martes, 29 de septiembre</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Buenos días, Alex</h1>
          <p className="mt-1 text-sm text-slate-500">Tu asistente está trabajando. Este es el resumen de hoy.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Notificaciones" className="relative flex size-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:text-slate-900">
            <Bell className="size-4.5" />
            <span className="absolute right-2.5 top-2.5 size-1.5 rounded-full bg-red-500 ring-2 ring-white" />
          </button>
          <div className="flex size-10 items-center justify-center rounded-xl bg-slate-950 text-xs font-semibold text-white">AR</div>
        </div>
      </header>

      <section id="resumen" className="scroll-mt-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Resumen del negocio</h2>
          <button type="button" className="text-xs font-medium text-slate-500 hover:text-slate-900">Últimos 30 días</button>
        </div>
        <MetricCards />
      </section>

      <section className="my-6 grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
        <article className="overflow-hidden rounded-2xl bg-slate-950 p-5 text-white shadow-xl shadow-slate-300/30 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-400/10 px-2.5 py-1 text-[11px] font-medium text-yellow-300">
                <Sparkles className="size-3" /> Rendimiento IA
              </span>
              <h2 className="mt-4 text-xl font-semibold">Tu asistente resolvió el 87% de las consultas</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">Ahorraste aproximadamente 14 horas de atención manual durante esta semana.</p>
            </div>
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-yellow-300"><Bot className="size-5" /></span>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-2 border-t border-white/10 pt-5">
            {[['1.284', 'Mensajes'], ['92', 'Leads'], ['4.8 min', 'Respuesta']].map(([value, label]) => (
              <div key={label}>
                <p className="text-lg font-semibold sm:text-xl">{value}</p>
                <p className="mt-1 text-[11px] text-slate-500">{label}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40 sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-950">Actividad en vivo</h2>
              <p className="mt-1 text-xs text-slate-500">Últimas acciones del asistente</p>
            </div>
            <Clock3 className="size-4 text-slate-400" />
          </div>
          <div className="space-y-4">
            {activity.map((item) => (
              <div key={item.title} className="flex items-start gap-3">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${item.color}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">{item.title}</p>
                  <p className="truncate text-xs text-slate-500">{item.detail}</p>
                </div>
                <span className="shrink-0 text-[10px] text-slate-400">{item.time}</span>
              </div>
            ))}
          </div>
          <button type="button" className="mt-5 flex w-full items-center justify-center gap-1 border-t border-slate-100 pt-4 text-xs font-medium text-slate-600 hover:text-slate-950">
            Ver actividad <ChevronRight className="size-3.5" />
          </button>
        </article>
      </section>

      <div className="space-y-6">
        <CrmTable />
        <AssistantConfig />
      </div>
    </div>
  );
}
