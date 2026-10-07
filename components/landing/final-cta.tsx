import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

export function FinalCta() {
  return (
    <section className="px-4 pb-20 pt-6 sm:px-8" aria-labelledby="final-title">
      <div className="cyber-card relative mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-yellow-300 via-amber-300 to-yellow-400 px-6 py-16 text-center text-zinc-950 shadow-[0_30px_90px_rgba(250,204,21,0.25)] sm:px-12 sm:py-24">
        {/* Futuristic 3D Cyber Rings and Grid */}
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-32 size-[420px] rounded-full border border-zinc-950/15 animate-[spin_50s_linear_infinite]" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-20 size-[320px] rounded-full border border-dashed border-zinc-950/20 animate-[spin_35s_linear_infinite_reverse]" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-48 -left-16 size-[460px] rounded-full border border-zinc-950/15 animate-[spin_60s_linear_infinite]" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-10 cyber-grid-pattern" />

        <p className="relative font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-900">
          {"// Tu próximo cliente no quiere esperar"}
        </p>
        <h2 id="final-title" className="relative mx-auto mt-5 max-w-3xl text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.05em] sm:text-6xl text-zinc-950">
          Tu siguiente paso<br />empieza con NEXO.
        </h2>
        <p className="relative mx-auto mt-6 max-w-lg text-sm font-medium leading-7 text-zinc-800">
          Habla con tu agente, conoce tu negocio y conecta con tus clientes. Todo empieza con una conversación.
        </p>
        <Link
          href="/signup"
          className="relative mt-8 inline-flex min-h-12 items-center gap-3 rounded-2xl bg-zinc-950 px-7 py-4 text-sm font-bold text-white shadow-2xl transition duration-300 hover:scale-105 hover:bg-zinc-900 hover:shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
        >
          Empieza gratis <ArrowRight className="size-4" />
        </Link>
        <p className="relative mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs font-medium text-zinc-800">
          {["Sin tarjeta de crédito", "Configuración en 3 minutos", "Soporte dedicado"].map((text) => (
            <span key={text} className="flex items-center gap-1.5">
              <Check className="size-3.5 stroke-[2.5]" />
              {text}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}
