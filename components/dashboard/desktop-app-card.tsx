"use client";
import { useEffect, useState } from "react";
import { BellRing, Hash, Power, X } from "lucide-react";
import { Panel } from "@/components/dashboard/panel";
import { DesktopDownloadLink } from "@/components/pwa/desktop-download-link";
import { desktopPlatform, type DesktopPlatform } from "@/lib/desktop-platform";

const DISMISSED = "zorax-desktop-card-dismissed";
const BENEFITS = [
  { icon: BellRing, text: "Te avisa al instante cuando un cliente pide un asesor, hay un pedido por aprobar o entra un pago." },
  { icon: Hash, text: "Ves en el icono de la barra de tareas cuántos clientes y pedidos te esperan." },
  { icon: Power, text: "Se abre sola al encender el computador y queda junto al reloj, lista para hablar con Zorax." },
];

/**
 * Home card for the CRM in a browser: what the desktop app does that a tab cannot, with the visitor's
 * system first. Hidden inside the app, on phones and tablets, and once dismissed in this browser.
 */
export function DesktopAppCard() {
  const [platform, setPlatform] = useState<DesktopPlatform | null>(null);
  useEffect(() => {
    const detect = () => {
      let dismissed = false;
      try { dismissed = localStorage.getItem(DISMISSED) === "1"; } catch { /* Private mode: show it. */ }
      setPlatform(window.nexoDesktop || dismissed ? null : desktopPlatform());
    };
    detect();
  }, []);
  if (!platform) return null;
  const other: DesktopPlatform = platform === "windows" ? "mac" : "windows";
  const dismiss = () => {
    try { localStorage.setItem(DISMISSED, "1"); } catch { /* Hidden for this visit only. */ }
    setPlatform(null);
  };
  return (
    <Panel aria-labelledby="desktop-app-title" className="relative mb-5 overflow-hidden">
      <button type="button" onClick={dismiss} aria-label="Ocultar la invitación a descargar la app"
        className="absolute right-2 top-2 rounded-md p-1.5 text-muted transition hover:bg-subtle hover:text-ink"><X className="size-4" /></button>
      <div className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="min-w-0 pr-8">
          <h2 id="desktop-app-title" className="text-[15px] font-semibold text-ink">Zorax te avisa aunque cierres el navegador</h2>
          <p className="mt-0.5 text-[13px] text-muted">Con la app de escritorio no se te escapa ningún cliente.</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {BENEFITS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex gap-2 text-xs leading-5 text-ink-soft"><Icon className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden="true" />{text}</li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-stretch">
          <DesktopDownloadLink platform={platform} tone="light" className="justify-center! bg-ink! px-4! py-2.5! text-white! hover:bg-ink-soft!" />
          <DesktopDownloadLink platform={other} tone="light" className="justify-center!" />
        </div>
      </div>
    </Panel>
  );
}
