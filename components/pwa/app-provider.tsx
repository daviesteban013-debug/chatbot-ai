"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Download, Share, X } from "lucide-react";
import { createInstallRequest, isAppleMobile, type InstallPromptEvent } from "@/lib/pwa-install";

interface InstallContext {
  installed: boolean;
  pending: boolean;
  install: () => Promise<void>;
}
const AppInstallContext = createContext<InstallContext>({ installed: false, pending: false, install: async () => {} });

export function JarvisAppProvider({ children }: { children: ReactNode }) {
  const [installed, setInstalled] = useState(false);
  const [pending, setPending] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [online, setOnline] = useState(true);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [installNotice, setInstallNotice] = useState("");
  const request = useRef(createInstallRequest());
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const fullScreen = window.matchMedia("(display-mode: fullscreen)");
    const initialize = () => {
      setInstalled(standalone.matches || fullScreen.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
      setIsIOS(isAppleMobile(navigator.userAgent, navigator.maxTouchPoints));
      setOnline(navigator.onLine);
    };
    initialize();
    const onPrompt = (event: Event) => {
      request.current.capture(event as InstallPromptEvent);
      setCanPrompt(true);
    };
    const onInstalled = () => {
      request.current.clear();
      setCanPrompt(false);
      setInstalled(true);
      setInstructionsOpen(false);
    };
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    standalone.addEventListener("change", initialize);
    fullScreen.addEventListener("change", initialize);

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => { /* Installation remains usable without offline fallback. */ });
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      standalone.removeEventListener("change", initialize);
      fullScreen.removeEventListener("change", initialize);
    };
  }, []);

  useEffect(() => {
    if (instructionsOpen && !dialog.current?.open) dialog.current?.showModal();
    else if (!instructionsOpen && dialog.current?.open) dialog.current.close();
  }, [instructionsOpen]);

  const install = useCallback(async () => {
    if (pending || installed) return;
    setPending(true);
    const outcome = await request.current.request();
    setPending(false);
    setCanPrompt(false);
    if (outcome === "unavailable") {
      setInstallNotice("");
      setInstructionsOpen(true);
    } else if (outcome === "dismissed") {
      setInstallNotice("Puedes instalarla más tarde desde el menú de tu navegador.");
      setInstructionsOpen(true);
    } else {
      // Confirmation is left to the browser; appinstalled confirms completion.
      setInstructionsOpen(false);
    }
  }, [pending, installed]);

  return (
    <AppInstallContext.Provider value={{ installed, pending, install }}>
      {!online && <div role="status" className="relative z-[70] bg-amber-300 px-4 py-2 text-center text-sm text-zinc-950">Sin conexión. Jarvis y el CRM necesitan internet.</div>}
      {children}
      <dialog ref={dialog} aria-labelledby="jarvis-install-title" aria-describedby="jarvis-install-description" onCancel={() => setInstructionsOpen(false)} onClose={() => setInstructionsOpen(false)} className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-md rounded-3xl border border-yellow-300/20 bg-zinc-950 p-6 text-white shadow-2xl backdrop:bg-black/75">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Static native app asset, not remote content. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/jarvis-192.png" width="48" height="48" alt="" className="rounded-xl" />
            <h2 id="jarvis-install-title" className="text-lg font-semibold">Instala Jarvis</h2>
          </div>
          <button type="button" onClick={() => setInstructionsOpen(false)} aria-label="Cerrar instrucciones de instalación" className="rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white"><X className="size-5" /></button>
        </div>
        <p id="jarvis-install-description" className="mt-4 text-sm leading-6 text-zinc-300">Tu agente en su propia ventana, con un icono en tu celular o PC. Abre directamente Jarvis y conserva tu cuenta.</p>
        {isIOS ? (
          <p className="mt-4 rounded-2xl bg-white/5 p-4 text-sm leading-6 text-yellow-100"><Share className="mb-2 size-5" />En el navegador, pulsa <strong>Compartir</strong> y elige <strong>Añadir a pantalla de inicio</strong>. Activa <strong>Abrir como app</strong> si aparece y confirma <strong>Añadir</strong>.</p>
        ) : (
          <div className="mt-4 rounded-2xl bg-white/5 p-4 text-sm leading-6 text-yellow-100"><p>En Chrome o Edge, busca <strong>Instalar Jarvis</strong> o <strong>Instalar esta página como una aplicación</strong> en el menú del navegador o en la barra de direcciones.</p><p className="mt-2 text-zinc-400">Si usas el navegador integrado de otra app, abre esta web en Chrome, Edge o Safari.</p></div>
        )}
        <p className="mt-4 text-xs leading-5 text-zinc-400">Necesita internet para responder y consultar tu CRM.</p>
        {installNotice && <p role="status" className="mt-3 text-sm text-yellow-200">{installNotice}</p>}
        <div className="mt-5 flex justify-end gap-3">
          {canPrompt && <button type="button" disabled={pending} onClick={install} className="inline-flex items-center gap-2 rounded-xl bg-yellow-300 px-4 py-2 text-sm font-semibold text-black"><Download className="size-4" />Instalar ahora</button>}
          <button type="button" onClick={() => setInstructionsOpen(false)} className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white">Entendido</button>
        </div>
      </dialog>
    </AppInstallContext.Provider>
  );
}

export function InstallJarvisButton({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const { installed, pending, install } = useContext(AppInstallContext);
  if (installed) return null;
  return <button data-pwa-install type="button" disabled={pending} onClick={install} title="Instalar Jarvis como app" className={`inline-flex items-center justify-center gap-2 rounded-xl border border-yellow-300/25 bg-yellow-300/10 px-3 py-2 text-xs font-medium text-yellow-200 transition hover:bg-yellow-300/20 disabled:opacity-50 ${className}`}><Download className="size-4" /><span className={compact ? "sr-only sm:not-sr-only" : ""}>{pending ? "Abriendo…" : "Instalar app"}</span></button>;
}
