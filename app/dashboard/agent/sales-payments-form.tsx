"use client";

import { useState, useTransition } from "react";
import { saveSalesPayments } from "./actions";
import type { SalesPaymentsInput } from "@/lib/sales-payments";

export function SalesPaymentsForm({ initial, canEdit }: { initial: SalesPaymentsInput; canEdit: boolean }) {
  const [linkUrl, setLinkUrl] = useState(initial.linkUrl);
  const [transferInstructions, setTransferInstructions] = useState(initial.transferInstructions);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  return <section className="rounded-lg border border-line bg-surface">
    <div className="border-b border-line px-4 py-3 sm:px-5">
      <h2 className="text-[13px] font-semibold text-ink">Cómo pagan tus clientes</h2>
      <p className="mt-0.5 text-xs text-muted">Zorax ofrece estos medios y envía las instrucciones al confirmar el pedido. Los cobros son de tu negocio.</p>
    </div>
    <form className="space-y-4 px-4 py-4 sm:px-5" onSubmit={event => {
      event.preventDefault(); setNotice("");
      startTransition(async () => {
        try { const result = await saveSalesPayments({ linkUrl, transferInstructions }); setNotice(result.ok ? "Guardado. Zorax usará estos datos en los siguientes resúmenes de pedido." : result.error ?? "No se pudo guardar."); }
        catch { setNotice("No se pudo conectar. Inténtalo de nuevo."); }
      });
    }}>
      <label className="block text-[13px] font-medium text-ink">Enlace de pago de tu negocio
        <input type="url" maxLength={2048} placeholder="https://…" value={linkUrl} disabled={!canEdit || pending} onChange={event => setLinkUrl(event.target.value)} className="mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm font-normal text-ink focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-ink/10 disabled:bg-subtle disabled:opacity-60" />
      </label>
      <p className="text-xs leading-5 text-muted">Usa un enlace reutilizable que permita pagar el total indicado. Este campo no genera un checkout con importe ni confirma pagos automáticamente.</p>
      <label className="block text-[13px] font-medium text-ink">Datos para transferencia
        <textarea rows={5} maxLength={2000} placeholder="Banco o billetera, titular, tipo y número de cuenta. Añade las instrucciones que deba recibir el cliente." value={transferInstructions} disabled={!canEdit || pending} onChange={event => setTransferInstructions(event.target.value)} className="mt-1.5 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm font-normal text-ink focus:border-line-strong focus:outline-none focus:ring-2 focus:ring-ink/10 disabled:bg-subtle disabled:opacity-60" />
      </label>
      <p className="text-xs leading-5 text-muted">Estos datos se comparten con el cliente. No incluyas contraseñas, tokens ni claves API. Deja vacío un medio para dejar de ofrecerlo.</p>
      {canEdit && <button disabled={pending} className="rounded-md bg-ink px-3 py-1.5 text-[13px] font-medium text-white transition hover:bg-ink-soft disabled:opacity-60">{pending ? "Guardando…" : "Guardar medios de pago"}</button>}
      <p className="text-xs leading-5 text-muted">El pago permanece pendiente hasta verificarse. Una captura o un mensaje del cliente no lo marca como pagado.</p>
      {notice && <p role="status" className="text-xs leading-5 text-ink-soft">{notice}</p>}
    </form>
  </section>;
}
