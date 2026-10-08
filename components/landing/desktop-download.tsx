import { ArrowUpRight, Mic, Monitor, Palette } from "lucide-react";
import { DesktopDownloadLink } from "@/components/desktop/download-link";
import { desktopRelease } from "@/lib/desktop-release";

export function DesktopDownloadSection() {
  return <section id="descargar" aria-labelledby="desktop-title" className="mx-auto max-w-6xl px-5 pb-12 pt-4 sm:px-8">
    <div className="relative overflow-hidden rounded-[2rem] border border-yellow-300/15 bg-gradient-to-br from-yellow-300/[0.06] via-zinc-950 to-zinc-900/50 p-7 sm:p-10">
      <div className="relative grid items-center gap-9 md:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="landing-eyebrow inline-flex items-center gap-2"><Monitor size={14} /> NEXO EN TU ESCRITORIO</p>
          <h2 id="desktop-title" className="mt-4 text-3xl font-medium leading-tight tracking-tight text-white sm:text-4xl">Tu agente, siempre a mano.</h2>
          <p className="mt-4 max-w-lg text-sm leading-7 text-zinc-400">Una burbuja que te acompaña encima de tus ventanas. Habla con NEXO, abre los paneles de tu CRM y dale tu color.</p>
          <div className="mt-6"><DesktopDownloadLink className="min-h-12 border-yellow-300! bg-yellow-300! px-5! text-zinc-950! hover:bg-yellow-200!" /></div>
          <p className="mt-3 text-[11px] leading-5 text-zinc-500">Beta {desktopRelease.version} · Windows 10/11 de 64 bits · {desktopRelease.sizeLabel}</p>
          <p className="mt-2 max-w-lg text-xs leading-6 text-zinc-400">Descarga, instala e inicia sesión con tu cuenta. Después pulsa <span className="text-zinc-200">Encender NEXO</span> y permite el micrófono. Necesita internet.</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-zinc-950/70 p-6">
          <div aria-hidden="true" className="relative mx-auto mb-6 flex h-28 w-28 items-center justify-center gap-4 rounded-[48%_52%_46%_54%] bg-[radial-gradient(ellipse_at_28%_18%,#fffbd2_0%,#facc15_25%,#a37b09_55%,#171309_95%)] shadow-[0_12px_55px_#facc1518,inset_-7px_-8px_12px_#0008]">
            <i className="h-7 w-3 rounded-full bg-yellow-50 shadow-[0_0_13px_#fff8]" /><i className="h-7 w-3 rounded-full bg-yellow-50 shadow-[0_0_13px_#fff8]" />
          </div>
          <ul className="space-y-4 text-xs text-zinc-300">
            <li className="flex items-center gap-3"><Mic size={15} className="text-yellow-300" />Habla entre respuestas</li>
            <li className="flex items-center gap-3"><ArrowUpRight size={15} className="text-yellow-300" />«NEXO, abre pedidos»</li>
            <li className="flex items-center gap-3"><Palette size={15} className="text-yellow-300" />Elige y guarda tu color</li>
          </ul>
          <p className="mt-5 border-t border-white/10 pt-4 text-[11px] leading-5 text-zinc-500">Alt + Shift + N para expandir o contraer.</p>
        </div>
      </div>
    </div>
  </section>;
}
