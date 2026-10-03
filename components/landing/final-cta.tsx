import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

export function FinalCta() {
  return (
    <section className="px-4 pb-16 pt-6 sm:px-8" aria-labelledby="final-title">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-yellow-300 px-6 py-16 text-center text-zinc-950 sm:px-12 sm:py-20">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-32 size-96 rounded-full border border-zinc-950/10" /><div aria-hidden="true" className="pointer-events-none absolute -bottom-44 -left-12 size-96 rounded-full border border-zinc-950/10" />
        <p className="relative text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-800">Tu próximo cliente no quiere esperar</p>
        <h2 id="final-title" className="relative mx-auto mt-5 max-w-3xl text-balance text-4xl font-medium leading-[1.05] tracking-[-0.05em] sm:text-6xl">El próximo mensaje<br />puede ser tu próxima venta.</h2>
        <p className="relative mx-auto mt-6 max-w-lg text-sm leading-7 text-zinc-800">Dale a tu negocio un asistente que atienda mientras tú haces lo que mejor sabes. Empieza hoy, a tu ritmo.</p>
        <Link href="/signup" className="relative mt-8 inline-flex min-h-12 items-center gap-3 rounded-xl bg-zinc-950 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-zinc-800">Empieza gratis <ArrowRight className="size-4" /></Link>
        <p className="relative mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-zinc-800">{["Sin tarjeta", "Configuración en minutos"].map((text) => <span key={text} className="flex items-center gap-1.5"><Check className="size-3.5" />{text}</span>)}</p>
      </div>
    </section>
  );
}
