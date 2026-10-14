"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel, PanelHeader } from "@/components/dashboard/panel";
import type { AutonomySettings } from "@/lib/activity";
import { cn } from "@/lib/utils";
import { saveAutonomy } from "./autonomy-actions";

const OPTIONS: Array<{ key: keyof AutonomySettings; title: string; example: string }> = [
  { key: "catalog_stock", title: "Entradas y salidas de stock", example: "«Llegaron 20 tenis talla 40» queda aplicado al instante." },
  { key: "catalog_availability", title: "Ocultar o activar productos", example: "«Oculta las gorras rojas» queda aplicado al instante." },
  { key: "work_items", title: "Memoria y tareas internas", example: "Lo que le pidas recordar o agendar queda activo sin pasar por «Por confirmar»." },
];
const ALWAYS_ASK = ["Cambios de precio", "Productos nuevos", "Pedidos preparados desde el chat", "Tomar o cerrar casos de atención humana"];

function Switch({ checked, disabled, onChange, label }: { checked: boolean; disabled: boolean; onChange(value: boolean): void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "border-ink bg-ink" : "border-line-strong bg-subtle")}>
      <span className={cn("inline-block size-3.5 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.2)] transition", checked ? "translate-x-[18px]" : "translate-x-[2px]")} />
    </button>
  );
}

/** Owner-only switches for the low-risk actions NEXO may take without a click. */
export function AutonomyForm({ initial, canEdit, remindersEnabled }: { initial: AutonomySettings; canEdit: boolean; remindersEnabled: boolean }) {
  const router = useRouter();
  const [settings, setSettings] = useState(initial);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  const dirty = OPTIONS.some(option => settings[option.key] !== initial[option.key]);

  return (
    <Panel id="autonomia" className="scroll-mt-6">
      <PanelHeader title="Autonomía de NEXO" description="Lo que NEXO puede hacer sin esperar tu clic. Cada acción queda en «Lo que hizo NEXO» y puedes deshacerla durante 7 días." />
      <form onSubmit={event => {
        event.preventDefault(); setNotice("");
        startTransition(async () => {
          try {
            const result = await saveAutonomy(settings);
            setNotice(result.ok ? "Guardado. NEXO aplicará estos permisos desde su próxima respuesta." : result.error ?? "No se pudo guardar.");
            if (result.ok) router.refresh();
          } catch { setNotice("No se pudo conectar. Inténtalo de nuevo."); }
        });
      }}>
        <ul className="divide-y divide-line">
          {OPTIONS.map(option => (
            <li key={option.key} className="flex items-start justify-between gap-4 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-ink">{option.title}</p>
                <p className="mt-0.5 text-xs leading-5 text-muted">{option.example}</p>
              </div>
              <Switch label={option.title} checked={settings[option.key]} disabled={!canEdit || pending}
                onChange={value => setSettings(current => ({ ...current, [option.key]: value }))} />
            </li>
          ))}
          <li className="flex items-start justify-between gap-4 px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ink">Recordatorios de pago por WhatsApp</p>
              <p className="mt-0.5 text-xs leading-5 text-muted">Se configuran en <a href="#seguimiento-pagos" className="underline underline-offset-2 hover:text-ink">Seguimiento de pagos pendientes</a>.</p>
            </div>
            <span className={cn("shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-medium", remindersEnabled ? "border-emerald-200/70 bg-emerald-50 text-emerald-800" : "border-line bg-subtle text-ink-soft")}>
              {remindersEnabled ? "Activos" : "Apagados"}
            </span>
          </li>
        </ul>
        <div className="border-t border-line bg-subtle/50 px-4 py-3 sm:px-5">
          <p className="text-xs font-medium text-ink-soft">Siempre con tu confirmación</p>
          <p className="mt-1 text-xs leading-5 text-muted">{ALWAYS_ASK.join(" · ")}. NEXO prepara la tarjeta y espera tu clic, sin importar estos permisos.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 sm:px-5">
          {canEdit
            ? <button type="submit" disabled={pending || !dirty} className="rounded-md bg-ink px-3 py-1.5 text-[13px] font-medium text-white transition hover:bg-ink-soft disabled:opacity-50">{pending ? "Guardando…" : "Guardar autonomía"}</button>
            : <p className="text-xs text-muted">Solo el dueño puede cambiar la autonomía.</p>}
          {notice && <p role="status" className="text-xs text-ink-soft">{notice}</p>}
        </div>
      </form>
    </Panel>
  );
}
