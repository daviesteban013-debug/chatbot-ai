import { CalendarDays, MoreHorizontal, Phone } from "lucide-react";

const clients = [
  { name: "Sofía Martínez", phone: "+34 612 442 118", action: "Corte + barba", date: "Hoy, 10:30", status: "Confirmada", initials: "SM" },
  { name: "Diego Ramírez", phone: "+34 677 810 934", action: "Pedido #1048", date: "Hoy, 11:05", status: "Nuevo", initials: "DR" },
  { name: "Valentina Cruz", phone: "+34 634 055 721", action: "Coloración", date: "Hoy, 13:00", status: "Pendiente", initials: "VC" },
  { name: "Lucas Torres", phone: "+34 698 144 602", action: "Consulta de catálogo", date: "Ayer, 18:42", status: "Atendido", initials: "LT" },
];

const statusStyles: Record<string, string> = {
  Confirmada: "bg-emerald-50 text-emerald-700",
  Nuevo: "bg-sky-50 text-sky-700",
  Pendiente: "bg-amber-50 text-amber-700",
  Atendido: "bg-slate-100 text-slate-600",
};

export function CrmTable() {
  return (
    <section id="crm" className="scroll-mt-6 rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
        <div>
          <h2 className="font-semibold text-slate-950">Clientes recientes</h2>
          <p className="mt-1 text-xs text-slate-500">Historial sincronizado desde WhatsApp</p>
        </div>
        <button className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50" type="button">
          Ver todos
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-400">
              <th className="px-6 py-3 font-medium">Cliente</th>
              <th className="px-6 py-3 font-medium">Interés</th>
              <th className="px-6 py-3 font-medium">Último contacto</th>
              <th className="px-6 py-3 font-medium">Estado</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {clients.map((client, index) => (
              <tr key={client.phone} className="transition hover:bg-slate-50/70">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <span className={`flex size-9 items-center justify-center rounded-xl text-xs font-semibold ${index % 2 ? "bg-violet-100 text-violet-700" : "bg-yellow-100 text-yellow-800"}`}>
                      {client.initials}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{client.name}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400"><Phone className="size-3" />{client.phone}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-slate-600">{client.action}</td>
                <td className="px-6 py-4">
                  <span className="flex items-center gap-1.5 text-sm text-slate-500"><CalendarDays className="size-3.5" />{client.date}</span>
                </td>
                <td className="px-6 py-4">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${statusStyles[client.status]}`}>{client.status}</span>
                </td>
                <td className="px-6 py-4 text-right"><button type="button" aria-label={`Opciones de ${client.name}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><MoreHorizontal className="size-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
