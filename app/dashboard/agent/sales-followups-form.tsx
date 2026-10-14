"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CirclePause } from "lucide-react";
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
    <section id="seguimiento-pagos" className="scroll-mt-6 rounded-lg border border-line bg-surface">
      <div className="border-b border-line px-4 py-3 sm:px-5">
        <h2 className="text-[13px] font-semibold text-ink">Seguimiento de pagos pendientes</h2>
        <p className="mt-0.5 text-xs text-muted">NEXO recuerda por WhatsApp el pago de un pedido confirmado. Apagado por defecto.</p>
      </div>
      {loadFailed ? <p role="alert" className="mx-4 mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800 sm:mx-5">No se pudo cargar la configuración. Actualiza esta página para reintentarlo; no se han cambiado tus seguimientos.</p> : null}
      <form className="space-y-4 px-4 py-4 sm:px-5" onSubmit={event => {
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
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line p-3 text-[13px] font-medium text-ink">
          <input type="checkbox" checked={enabled} disabled={disabled} onChange={event => setEnabled(event.target.checked)} className="mt-0.5 size-4 accent-zinc-900 disabled:opacity-60" />
          <span>Activar recordatorios automáticos de pago</span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-[13px] font-medium text-ink">Espera entre recordatorios
            <select value={delayMinutes} disabled={disabled} onChange={event => setDelayMinutes(Number(event.target.value))} className="mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm font-normal text-ink focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-ink/10 disabled:bg-subtle disabled:opacity-60">
              {![30, 60, 120, 240, 360, 720].includes(delayMinutes) && <option value={delayMinutes}>{delayMinutes} minutos</option>}
              <option value={30}>30 minutos</option><option value={60}>1 hora</option><option value={120}>2 horas</option><option value={240}>4 horas</option><option value={360}>6 horas</option><option value={720}>12 horas</option>
            </select>
          </label>
          <label className="block text-[13px] font-medium text-ink">Máximo por pedido
            <select value={maxReminders} disabled={disabled} onChange={event => setMaxReminders(Number(event.target.value))} className="mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm font-normal text-ink focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-ink/10 disabled:bg-subtle disabled:opacity-60">
              <option value={1}>1 recordatorio</option><option value={2}>2 recordatorios</option>
            </select>
          </label>
        </div>
        <div className="space-y-1.5 rounded-md bg-subtle p-3 text-xs leading-5 text-muted">
          <p>Los mensajes libres solo se envían dentro de las 24 horas desde el último mensaje del cliente. Fuera de esa ventana, el seguimiento se bloquea hasta disponer de una plantilla aprobada.</p>
          <p>El recordatorio no verifica ni confirma el cobro. Un comprobante o la respuesta del cliente no marca el pedido como pagado.</p>
          <p>Los seguimientos se revisan periódicamente; la hora programada puede variar unos minutos. Puedes cancelar un recordatorio pendiente desde la actividad.</p>
        </div>
        {canEdit ? <button type="submit" disabled={disabled} className="rounded-md bg-ink px-3 py-1.5 text-[13px] font-medium text-white transition hover:bg-ink-soft disabled:opacity-60">{pending ? "Guardando…" : "Guardar seguimientos"}</button> : <p className="text-xs text-muted">Solo el dueño puede cambiar esta configuración.</p>}
        {notice && <p role="status" className="text-xs leading-5 text-ink-soft">{notice}</p>}
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
    }} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-ink-soft transition hover:bg-subtle disabled:opacity-60">
      <CirclePause className="size-3.5" /> {pending ? "Cancelando…" : "Cancelar recordatorio"}
    </button>
    {notice && <p role="status" className="mt-2 text-xs leading-5 text-ink-soft">{notice}</p>}
  </div>;
}
