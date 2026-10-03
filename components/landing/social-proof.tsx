"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";

function Counter({ value, suffix }: { value: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduced = useReducedMotion();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!inView || reduced) return;
    const animation = animate(0, value, { duration: 1.6, ease: "easeOut", onUpdate: (next) => setCount(Math.round(next)) });
    return () => animation.stop();
  }, [inView, reduced, value]);
  return <span ref={ref} className="tabular-nums">{(reduced ? value : count).toLocaleString("es-CO")}{suffix}</span>;
}

export function SocialProof() {
  return (
    <section aria-label="Nexo en números: escenario ilustrativo" className="border-y border-white/8 bg-white/[0.015]">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 md:grid-cols-[1.3fr_2fr] md:items-center md:px-8">
        <div><p className="text-sm font-medium text-zinc-200">Menos chats pendientes.<br />Más tiempo para tu negocio.</p><p className="mt-3 max-w-xs text-[11px] leading-relaxed text-zinc-500">Escenario ilustrativo, no métricas de clientes ni resultados garantizados.</p></div>
        <div className="grid grid-cols-3 gap-4">
          {[{ value: 8, suffix: " s", label: "Respuesta simulada" }, { value: 1200, suffix: "", label: "Chats de ejemplo / mes" }, { value: 3, suffix: "", label: "Flujos en esta demo" }].map((metric) => <div key={metric.label} className="border-l border-white/10 pl-4 sm:pl-6"><p className="text-2xl font-medium tracking-tight text-yellow-300 sm:text-4xl"><Counter value={metric.value} suffix={metric.suffix} /></p><p className="mt-2 text-[11px] leading-relaxed text-zinc-400">{metric.label}</p></div>)}
        </div>
      </div>
    </section>
  );
}
