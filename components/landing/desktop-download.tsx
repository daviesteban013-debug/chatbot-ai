import Link from "next/link";
import { ArrowRight, BellRing, Hash, Monitor, Power } from "lucide-react";
import { LightRays } from "@/components/react-bits/backgrounds/light-rays";
import { DesktopScene } from "./desktop/desktop-scene";
import { DownloadButtons } from "./desktop/download-buttons";

const FEATURES = [
  { icon: BellRing, title: "Avisos con el navegador cerrado", copy: "Cuando un cliente pide un asesor, hay un pedido por aprobar o entra un pago." },
  { icon: Hash, title: "Quién te espera, en el ícono", copy: "La barra de tareas cuenta los clientes y los pedidos que te esperan." },
  { icon: Power, title: "Arranca con tu computador", copy: "Se abre al encender el equipo y espera junto al reloj, sin estorbar." },
];

/**
 * Zorax for desktop on a stage of its own: React Bits «Light Rays» fall on a working desktop, the
 * installer for the visitor's system comes first, and what the app adds reads at a glance. The
 * landing links on to /descargar, which reuses this as its hero (`heading="h1"`).
 */
export function DesktopDownloadSection({ heading: Heading = "h2", more = true }: { heading?: "h1" | "h2"; more?: boolean }) {
  return (
    <section id="descargar" aria-labelledby="desktop-title" className="relative isolate overflow-hidden border-t border-white/8">
      <div aria-hidden="true" className="absolute inset-x-0 top-0 -z-10 h-[78%] opacity-45 [mask-image:linear-gradient(to_bottom,#000_55%,transparent)] sm:opacity-100">
        <LightRays raysColor="#facc15" raysSpeed={0.6} lightSpread={0.7} rayLength={2.1} rayDensity={1.1} raySharpness={0.45} glow={0.75} haze={0.35} intensity={1.3} mouseInfluence={0.08} cursorShadow={false} clickPulse={false} fadeDistance={1.2} maxDevicePixelRatio={1.5} />
      </div>

      <div className="mx-auto max-w-5xl px-5 pt-24 text-center sm:px-8 sm:pt-32">
        <p className="landing-eyebrow inline-flex items-center gap-2"><Monitor className="size-3.5" aria-hidden="true" /> Zorax para escritorio</p>
        <Heading id="desktop-title" className="mx-auto mt-5 max-w-4xl text-balance text-[clamp(2.4rem,5.6vw,4.5rem)] font-semibold leading-[1.02] tracking-[-0.055em] text-white">
          No vuelvas a perder una venta <span className="rb-gradient-text">por no ver el chat.</span>
        </Heading>
        <p className="mx-auto mt-6 max-w-xl text-pretty text-base leading-7 text-zinc-400">
          Zorax se queda en tu escritorio: te avisa al instante, te muestra en el ícono quién te espera y se abre solo al encender el computador.
        </p>
        <div className="mt-9"><DownloadButtons /></div>
      </div>

      <DesktopScene />

      <ul className="mx-auto mt-20 grid max-w-6xl gap-x-10 gap-y-10 px-5 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
        {FEATURES.map(({ icon: Icon, title, copy }) => (
          <li key={title} className="border-t border-white/10 pt-5">
            <Icon className="size-5 text-yellow-300" aria-hidden="true" />
            <h3 className="mt-4 text-[15px] font-medium text-white">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">{copy}</p>
          </li>
        ))}
        <li className="border-t border-white/10 pt-5">
          <span className="flex gap-1.5" aria-hidden="true">
            {["Alt", "Shift", "N"].map(key => <kbd key={key} className="rounded-md border border-white/15 border-b-white/25 bg-white/[0.06] px-1.5 py-0.5 font-sans text-[11px] font-semibold text-zinc-200 shadow-[inset_0_-2px_0_rgb(0_0_0/0.35)]">{key}</kbd>)}
          </span>
          <h3 className="mt-4 text-[15px] font-medium text-white">Zorax desde cualquier ventana</h3>
          <p className="mt-2 text-sm leading-6 text-zinc-400">Pulsa Alt + Shift + N y háblale sin buscar la pestaña.</p>
        </li>
      </ul>

      {more ? (
        <div className="pb-24 pt-14 text-center">
          <Link href="/descargar" className="landing-secondary">Instalación, requisitos y preguntas <ArrowRight className="size-4" /></Link>
        </div>
      ) : <div className="pb-20" />}
    </section>
  );
}
