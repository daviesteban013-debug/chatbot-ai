"use client";

import { useState, useTransition } from "react";
import { saveSalesPayments } from "./actions";
import type { SalesPaymentsInput } from "@/lib/sales-payments";

export function SalesPaymentsForm({ initial, canEdit }: { initial: SalesPaymentsInput; canEdit: boolean }) {
  const [linkUrl, setLinkUrl] = useState(initial.linkUrl);
  const [transferInstructions, setTransferInstructions] = useState(initial.transferInstructions);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  return <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
    <h2 className="text-sm font-semibold text-slate-900">Cómo pagan tus clientes</h2>
    <p className="mt-2 text-sm leading-6 text-slate-500">NEXO ofrece los medios que configures aquí y envía las instrucciones al confirmar el pedido. Estos cobros pertenecen a tu negocio.</p>
    <form className="mt-5 space-y-4" onSubmit={event => {
      event.preventDefault(); setNotice("");
      startTransition(async () => {
        try { const result = await saveSalesPayments({ linkUrl, transferInstructions }); setNotice(result.ok ? "Guardado. NEXO usará estos datos en los siguientes resúmenes de pedido." : result.error ?? "No se pudo guardar."); }
        catch { setNotice("No se pudo conectar. Inténtalo de nuevo."); }
      });
    }}>
      <label className="block text-sm font-medium text-slate-700">Enlace de pago de tu negocio
        <input type="url" maxLength={2048} placeholder="https://…" value={linkUrl} disabled={!canEdit || pending} onChange={event => setLinkUrl(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-950 disabled:opacity-60" />
      </label>
      <p className="text-xs leading-5 text-slate-500">Usa un enlace reutilizable que permita pagar el total indicado. Este campo no genera un checkout con importe ni confirma pagos automáticamente.</p>
      <label className="block text-sm font-medium text-slate-700">Datos para transferencia
        <textarea rows={5} maxLength={2000} placeholder="Banco o billetera, titular, tipo y número de cuenta. Añade las instrucciones que deba recibir el cliente." value={transferInstructions} disabled={!canEdit || pending} onChange={event => setTransferInstructions(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-950 disabled:opacity-60" />
      </label>
      <p className="text-xs leading-5 text-slate-500">Estos datos se comparten con el cliente. No incluyas contraseñas, tokens ni claves API. Deja vacío un medio para dejar de ofrecerlo.</p>
      {canEdit && <button disabled={pending} className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-medium text-white disabled:opacity-60">{pending ? "Guardando…" : "Guardar medios de pago"}</button>}
      <p className="text-xs leading-5 text-slate-500">El pago permanece pendiente hasta verificarse. Una captura o un mensaje del cliente no lo marca como pagado.</p>
      {notice && <p role="status" className="text-sm leading-6 text-slate-700">{notice}</p>}
    </form>
  </section>;
}
