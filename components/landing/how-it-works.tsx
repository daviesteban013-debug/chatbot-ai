"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, MessageCircleMore, SlidersHorizontal, Zap } from "lucide-react";

const steps = [
  { icon: MessageCircleMore, title: "Conecta tu WhatsApp", copy: "Vincula tu cuenta de WhatsApp Business siguiendo el proceso de conexión. Sin cambiar cómo te encuentran tus clientes.", note: "Tu canal de siempre" },
  { icon: SlidersHorizontal, title: "Enséñale tu negocio", copy: "Añade tu catálogo, precios, horarios y reglas. Define qué puede resolver Nexo y cuándo debe llamarte.", note: "Tus reglas, tu voz" },
  { icon: Zap, title: "Empieza a atender y vender", copy: "Prueba las respuestas antes de activar el asistente. Revisa su actividad y ajusta lo que necesites desde tu panel.", note: "Tú mantienes el control" },
];

export function HowItWorks() {
  const reduced = useReducedMotion();
  return (
    <section id="como-funciona" className="landing-section border-t border-white/8" aria-labelledby="steps-title">
      <p className="landing-eyebrow">De la idea al primer chat</p><h2 id="steps-title" className="landing-title">Tres pasos.<br />Cero código que aprender.</h2>
      <div className="relative mt-12 grid gap-8 md:grid-cols-3">
        <motion.div aria-hidden="true" initial={reduced ? false : { scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true, amount: 0.5 }} transition={{ duration: 1 }} className="absolute left-6 right-6 top-6 hidden h-px origin-left bg-gradient-to-r from-yellow-300/60 via-yellow-300/20 to-white/10 md:block" />
        {steps.map(({ icon: Icon, title, copy, note }, index) => <motion.article key={title} initial={reduced ? false : { opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }} transition={{ duration: 0.45, delay: reduced ? 0 : index * 0.12 }} className="relative">
          <span className="relative flex size-12 items-center justify-center rounded-xl border border-yellow-300/20 bg-zinc-950 font-mono text-sm text-yellow-300">0{index + 1}</span>
          <div className="mt-7 flex items-center gap-2 text-[10px] uppercase tracking-widest text-zinc-500"><Icon className="size-3.5" />{note}</div>
          <h3 className="mt-3 text-xl font-medium tracking-tight">{title}</h3><p className="mt-3 max-w-sm text-sm leading-7 text-zinc-400">{copy}</p>
        </motion.article>)}
      </div>
      <Link href="/signup" className="landing-primary mt-10">Configura tu asistente <ArrowRight className="size-4" /></Link>
    </section>
  );
}
