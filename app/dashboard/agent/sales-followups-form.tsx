"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, CirclePause } from "lucide-react";
import { cancelSalesFollowup, saveSalesFollowups } from "./followup-actions";

type Settings = { enabled: boolean; delay_minutes: number; max_reminders: number };

export function SalesFollowupsForm({ initial, canEdit, loadFailed = false }: {
  initial: Settings | null;
  canEdit: boolean;
  loadFailed?: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial?.enabled ?? false);
  const [delayMinutes, setDelayMinutes] = useState(initial?.delay_minutes ?? 60);
  const [maxReminders, setMaxReminders] = useState(initial?.max_reminders ?? 1);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const disabled = !canEdit || pending || loadFailed;

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
      <div className="flex items-center gap-2">
        <BellRing className="size-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900">Seguimiento de pagos pendientes</h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-500">NEXO puede recordar al cliente el pago de un pedido confirmado. Está desactivado por defecto; tú decides cuándo usarlo.</p>
      {loadFailed ? <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm leading-6 text-rose-700">No se pudo cargar la configuración. Actualiza esta página para reintentarlo; no se han cambiado tus seguimientos.</p> : null}
      <form className="mt-5 space-y-4" onSubmit={event => {
        event.preventDefault();
        setNotice("");
        startTransition(async () => {
          try {
            const result = await saveSalesFollowups({ enabled, delayMinutes, maxReminders });
            setNotice(result.ok
              ? enabled ? "Guardado. Los próximos pedidos elegibles tendrán seguimiento." : "Seguimientos desactivados. Los recordatorios pendientes se cancelarán."
              : result.error ?? "No se pudo guardar.");
            if (result.ok) router.refresh();
          } catch { setNotice("No se pudo conectar. Inténtalo de nuevo."); }
        });
      }}>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm font-medium text-slate-800">
          <input type="checkbox" checked={enabled} disabled={disabled} onChange={event => setEnabled(event.target.checked)} className="mt-0.5 size-4 accent-slate-950 disabled:opacity-60" />
          <span>Activar recordatorios automáticos de pago</span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">Espera entre recordatorios
            <select value={delayMinutes} disabled={disabled} onChange={event => setDelayMinutes(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-950 disabled:opacity-60">
              {![30, 60, 120, 240, 360, 720].includes(delayMinutes) && <option value={delayMinutes}>{delayMinutes} minutos</option>}
              <option value={30}>30 minutos</option><option value={60}>1 hora</option><option value={120}>2 horas</option><option value={240}>4 horas</option><option value={360}>6 horas</option><option value={720}>12 horas</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">Máximo por pedido
            <select value={maxReminders} disabled={disabled} onChange={event => setMaxReminders(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-950 disabled:opacity-60">
              <option value={1}>1 recordatorio</option><option value={2}>2 recordatorios</option>
            </select>
          </label>
        </div>
        <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
          <p>Los mensajes libres solo se envían dentro de las 24 horas desde el último mensaje del cliente. Fuera de esa ventana, el seguimiento se bloquea hasta disponer de una plantilla aprobada.</p>
          <p>El recordatorio no verifica ni confirma el cobro. Un comprobante o la respuesta del cliente no marca el pedido como pagado.</p>
          <p>Los seguimientos se revisan periódicamente; la hora programada puede variar unos minutos. Puedes cancelar un recordatorio pendiente desde la actividad.</p>
        </div>
        {canEdit ? <button type="submit" disabled={disabled} className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-medium text-white disabled:opacity-60">{pending ? "Guardando…" : "Guardar seguimientos"}</button> : <p className="text-xs text-slate-500">Solo el dueño puede cambiar esta configuración.</p>}
        {notice && <p role="status" className="text-sm leading-6 text-slate-700">{notice}</p>}
      </form>
    </section>
  );
}

export function CancelFollowupButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState("");
  return <div className="mt-3">
    <button type="button" disabled={pending} onClick={() => {
      setNotice("");
      startTransition(async () => {
        try {
          const result = await cancelSalesFollowup({ id });
          setNotice(result.ok ? "Seguimiento cancelado." : result.error ?? "No se pudo cancelar.");
          if (result.ok) router.refresh();
        } catch { setNotice("No se pudo conectar. Inténtalo de nuevo."); }
      });
    }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60">
      <CirclePause className="size-3.5" /> {pending ? "Cancelando…" : "Cancelar recordatorio"}
    </button>
    {notice && <p role="status" className="mt-2 text-xs leading-5 text-slate-600">{notice}</p>}
  </div>;
}
