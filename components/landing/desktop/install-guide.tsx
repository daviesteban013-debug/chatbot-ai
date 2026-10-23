"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { Command, Mic, Monitor, UserRound } from "lucide-react";
import { desktopRelease } from "@/lib/desktop-release";
import { desktopPlatform, type DesktopPlatform } from "@/lib/desktop-platform";

const STEPS: Record<DesktopPlatform, [string, string][]> = {
  windows: [
    ["Descarga el instalador", `Un archivo .exe de ${desktopRelease.sizeLabel} para Windows 10 y 11 de 64 bits.`],
    ["Ábrelo y sigue los pasos", "Si Windows muestra «Windows protegió su PC», pulsa «Más información» y luego «Ejecutar de todas formas»: la beta todavía no tiene firma de código."],
    ["Inicia sesión y enciende a Zorax", "Entra con tu cuenta, pulsa «Encender Zorax» y permite el micrófono. Desde ese día se abre al encender el computador."],
  ],
  mac: [
    ["Descarga la imagen .dmg", "Una sola app para Apple Silicon e Intel, con macOS 13 o posterior."],
    ["Arrástrala a Aplicaciones", "Abre el .dmg y arrastra Zorax a la carpeta Aplicaciones."],
    ["Ábrela la primera vez", "La beta aún no está notarizada por Apple. Si macOS la bloquea, ve a Configuración del Sistema › Privacidad y seguridad y pulsa «Abrir igualmente». Luego inicia sesión y enciende a Zorax."],
  ],
};

const NEEDS = [
  { icon: Monitor, title: "Windows 10 u 11", copy: `64 bits · ${desktopRelease.sizeLabel}` },
  { icon: Command, title: "macOS 13 o posterior", copy: "Apple Silicon o Intel." },
  { icon: Mic, title: "Internet y micrófono", copy: "El micrófono, solo si quieres hablarle a Zorax." },
  { icon: UserRound, title: "Tu cuenta de Zorax", copy: "La misma del CRM." },
];

const never = () => () => {};

/** How to install the desktop app on each system, starting with the visitor's, and what it needs. */
export function InstallGuide() {
  const detected = useSyncExternalStore(never, desktopPlatform, () => null);
  const [chosen, setChosen] = useState<DesktopPlatform | null>(null);
  const system = chosen ?? detected ?? "windows";
  return (
    <section id="instalar" aria-labelledby="install-title" className="landing-section border-t border-white/8">
      <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="landing-eyebrow">En un minuto</p>
          <h2 id="install-title" className="landing-title">Instálala y enciende a Zorax.</h2>
          <p className="landing-copy">Tres pasos y queda lista. Las actualizaciones llegan solas desde el aviso superior del CRM.</p>
          <div role="group" aria-label="Sistema operativo" className="mt-8 inline-flex rounded-xl border border-white/10 bg-zinc-900 p-1">
            {(["windows", "mac"] as const).map(id => (
              <button key={id} type="button" aria-pressed={system === id} onClick={() => setChosen(id)} className={`rounded-lg px-4 py-2.5 text-xs font-medium transition ${system === id ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"}`}>
                {id === "windows" ? "Windows" : "Mac"}
              </button>
            ))}
          </div>
        </div>
        <ol aria-label={`Pasos para ${system === "windows" ? "Windows" : "Mac"}`}>
          {STEPS[system].map(([title, copy], index) => (
            <li key={title} className="grid grid-cols-[auto_1fr] gap-6 border-t border-white/10 py-7 first:border-t-0 first:pt-0">
              <span className="font-mono text-sm text-yellow-300">0{index + 1}</span>
              <div>
                <h3 className="text-lg font-medium tracking-tight text-white">{title}</h3>
                <p className="mt-2 max-w-xl text-sm leading-7 text-zinc-400">{copy}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <ul className="mt-16 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4" aria-label="Requisitos">
        {NEEDS.map(({ icon: Icon, title, copy }) => (
          <li key={title} className="border-t border-white/10 pt-5">
            <Icon className="size-5 text-yellow-300" aria-hidden="true" />
            <h3 className="mt-4 text-[15px] font-medium text-white">{title}</h3>
            <p className="mt-1.5 text-sm leading-6 text-zinc-400">{copy}</p>
          </li>
        ))}
      </ul>
      <p className="mt-10 text-sm text-zinc-500">¿Aún no tienes cuenta? <Link href="/signup" className="font-medium text-yellow-300 hover:text-yellow-200">Créala gratis</Link> y luego inicia sesión en la app.</p>
    </section>
  );
}
