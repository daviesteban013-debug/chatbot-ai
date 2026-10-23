"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Command, Send } from "lucide-react";
import { desktopRelease, macDesktopRelease } from "@/lib/desktop-release";
import { desktopPlatform, type DesktopPlatform } from "@/lib/desktop-platform";

function WindowsGlyph() {
  return <svg viewBox="0 0 16 16" aria-hidden="true" className="size-[18px]"><path d="M1.5 1.5h6v6h-6zM8.5 1.5h6v6h-6zM1.5 8.5h6v6h-6zM8.5 8.5h6v6h-6z" fill="currentColor" /></svg>;
}
function MacGlyph() {
  return <Command aria-hidden="true" className="size-[18px]" strokeWidth={2.2} />;
}

const BUILDS = {
  windows: { release: desktopRelease, name: "Windows", detail: `Windows 10/11 · 64 bits · ${desktopRelease.sizeLabel}`, Glyph: WindowsGlyph },
  mac: { release: macDesktopRelease, name: "Mac", detail: `${macDesktopRelease.systemLabel} · beta`, Glyph: MacGlyph },
};

const never = () => () => {};

/** The installer for the visitor's system first, then the other one; phones get a way to send the page to their computer. */
export function DownloadButtons() {
  const platform = useSyncExternalStore(never, desktopPlatform, () => "windows" as const);
  const order: DesktopPlatform[] = platform === "mac" ? ["mac", "windows"] : ["windows", "mac"];
  return (
    <div>
      <div className="flex flex-wrap items-stretch justify-center gap-3">
        {order.map((id, index) => {
          const { release, name, detail, Glyph } = BUILDS[id];
          return (
            <a
              key={id}
              href={release.url}
              download={release.filename}
              aria-label={`Descargar Zorax para ${name}`}
              className={`group inline-flex min-w-[250px] items-center gap-3.5 rounded-2xl px-5 py-3.5 text-left transition duration-200 hover:-translate-y-0.5 ${index === 0 ? "rb-glare bg-yellow-300 text-zinc-950 shadow-[0_18px_50px_-18px_rgb(250_204_21/0.7)] hover:bg-yellow-200" : "border border-white/12 bg-white/[0.04] text-zinc-100 backdrop-blur-md hover:border-white/25 hover:bg-white/[0.07]"}`}
            >
              <Glyph />
              <span className="flex flex-col">
                <span className="text-[15px] font-semibold leading-5">Descargar para {name}</span>
                <span className={`text-[11px] leading-4 ${index === 0 ? "text-zinc-800" : "text-zinc-400"}`}>{detail}</span>
              </span>
            </a>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-zinc-500">Descarga gratis · Inicias sesión con tu cuenta de Zorax · Versión {desktopRelease.version}</p>
      {platform === null && <SendToComputer />}
    </div>
  );
}

function SendToComputer() {
  const [copied, setCopied] = useState(false);
  const send = async () => {
    const url = `${window.location.origin}/descargar`;
    try {
      if (navigator.share) await navigator.share({ title: "Zorax para escritorio", text: "Descarga Zorax en mi computador", url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
      }
    } catch { /* The share sheet was closed. */ }
  };
  return (
    <p className="mx-auto mt-5 flex max-w-sm flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm text-zinc-400">
      La app es para tu computador.
      <button type="button" onClick={send} className="inline-flex items-center gap-1.5 font-medium text-yellow-300 hover:text-yellow-200">
        {copied ? <><Check className="size-4" />Enlace copiado</> : <><Send className="size-4" />Envíate el enlace</>}
      </button>
    </p>
  );
}
