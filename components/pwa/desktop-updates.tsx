"use client";

import { useEffect, useState } from "react";
import type { DesktopUpdateState } from "@/types/nexo-desktop";

export function DesktopUpdates({ beforeInstall, compact = false }: { beforeInstall?: () => void; compact?: boolean }) {
  const [state, setState] = useState<DesktopUpdateState | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const bridge = window.nexoDesktop;
    if (!bridge?.getUpdateState || !bridge.onUpdateState) return;
    let live = true;
    const receive = (next: DesktopUpdateState) => { if (live) setState(next); };
    const off = bridge.onUpdateState(receive);
    bridge.getUpdateState().then(receive).catch(() => { if (live) setError(true); });
    return () => { live = false; off(); };
  }, []);
  if (!state || state.mode === "development") return null;
  const waiting = ["checking", "downloading", "installing"].includes(state.status);
  const action = state.status === "available" ? "download" : state.status === "downloaded" ? "install" : "check";
  async function run() {
    setError(false);
    try {
      const bridge = window.nexoDesktop;
      if (action === "install") beforeInstall?.();
      const next = await (action === "download" ? bridge?.downloadUpdate?.() : action === "install" ? bridge?.installUpdate?.() : bridge?.checkForUpdates?.());
      if (next) setState(next);
    } catch { setError(true); }
  }
  const label = waiting ? state.status === "downloading" ? `Descargando ${Math.round(state.progress ?? 0)}%` : state.status === "installing" ? "Reiniciando…" : "Buscando…" : action === "download" ? state.mode === "assisted" ? "Descargar para Mac" : "Descargar actualización" : action === "install" ? "Reiniciar e instalar" : "Buscar actualización";
  return <section aria-label="Actualizaciones de Zorax" className={compact ? "rounded-xl border border-white/15 bg-white/5 p-3 text-xs text-white" : "flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-slate-900"}>
    <div><p className="font-semibold">Zorax {state.currentVersion}{state.latestVersion ? ` → ${state.latestVersion}` : ""}</p><p role="status" className="mt-1 opacity-75">{error ? "No se pudo contactar con la app. Inténtalo de nuevo." : state.message}</p>
      {state.status === "downloading" && <progress className="mt-2 h-1.5 w-full accent-amber-500" value={state.progress ?? 0} max={100} aria-label="Descarga de actualización" />}
    </div>
    <button type="button" onClick={() => void run()} disabled={waiting} className="mt-2 shrink-0 rounded-lg bg-amber-400 px-3 py-2 font-semibold text-black disabled:opacity-60">{label}</button>
  </section>;
}
