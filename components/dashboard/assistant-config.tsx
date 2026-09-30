import { Bot, FileUp, Save, Sparkles } from "lucide-react";

export function AssistantConfig() {
  return (
    <section id="asistente" className="scroll-mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40 sm:p-6">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-slate-950 text-yellow-300">
            <Bot className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold text-slate-950">Configura tu asistente</h2>
            <p className="mt-1 text-xs text-slate-500">Define cómo debe representar a tu negocio.</p>
          </div>
        </div>
        <span className="flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700">
          <span className="size-1.5 rounded-full bg-emerald-500" /> Activo en WhatsApp
        </span>
      </div>

      <form className="mt-5 grid gap-5 lg:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-xs font-medium text-slate-700">Reglas del negocio</span>
          <textarea
            defaultValue="Atiende de lunes a sábado de 9:00 a 19:00. Confirma cada cita antes de agendarla y ofrece horarios alternativos cuando no haya disponibilidad."
            className="min-h-36 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700 outline-none transition focus:border-yellow-400 focus:bg-white focus:ring-4 focus:ring-yellow-400/10"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-xs font-medium text-slate-700">Catálogo o servicios</span>
          <textarea
            defaultValue={"Corte clásico — €20\nCorte + barba — €28\nColoración — desde €45"}
            className="min-h-36 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm leading-6 text-slate-700 outline-none transition focus:border-yellow-400 focus:bg-white focus:ring-4 focus:ring-yellow-400/10"
          />
        </label>
        <div className="flex flex-col gap-3 sm:flex-row lg:col-span-2 lg:items-center lg:justify-between">
          <button type="button" className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:bg-slate-50">
            <FileUp className="size-4" /> Importar catálogo
          </button>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="button" className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50">
              <Sparkles className="size-4" /> Probar asistente
            </button>
            <button type="button" className="flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-medium text-white transition hover:bg-slate-800">
              <Save className="size-4" /> Guardar cambios
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
