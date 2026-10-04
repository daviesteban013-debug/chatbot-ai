"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ArrowUp, Check, MessageCircleMore, Play, Sparkles } from "lucide-react";
import { WhatsAppDemo } from "./whatsapp-demo";

export function JarvisHero() {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [idea, setIdea] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!idea.trim()) return;
    router.push("/signup");
  }

  function handleScrollToDemo(e: React.MouseEvent) {
    e.preventDefault();
    const demoElement = document.getElementById("demo");
    if (demoElement) {
      demoElement.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <section aria-labelledby="hero-title" className="relative isolate overflow-hidden bg-zinc-950 text-white">
      {/* Dynamic Cybernetic Gradients & Ambient Lights */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[550px] w-[900px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(250,204,21,0.12),rgba(16,185,129,0.05)_50%,transparent_80%)] blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_85%_30%,rgba(250,204,21,0.09),transparent_48%)]" />
      
      {/* Cyber Grid with Scanline Beam */}
      <div className="pointer-events-none absolute inset-0 opacity-25 cyber-grid-pattern [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_80%)]" />
      <div className="scanner-line opacity-40" />

      <div className="relative mx-auto grid max-w-[76rem] items-center gap-14 px-5 pb-20 pt-32 sm:px-8 sm:pt-36 lg:min-h-[850px] lg:grid-cols-[1.12fr_1fr] lg:gap-12">
        <div className="min-w-0">
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55 }}
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-yellow-400/20 bg-yellow-400/5 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-yellow-300"
          >
            <Sparkles className="size-3.5" />
            Tu nuevo aliado en WhatsApp
          </motion.div>

          <motion.h1
            id="hero-title"
            initial={reduced ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.08 }}
            className="max-w-xl text-balance text-[2.8rem] font-medium leading-[1.04] tracking-[-0.055em] text-zinc-100 sm:text-6xl lg:text-[4.35rem]"
          >
            Menos responder.
            <span className="mt-2 block bg-gradient-to-r from-yellow-200 via-yellow-400 to-amber-400 bg-clip-text text-transparent">
              Más vender por WhatsApp.
            </span>
          </motion.h1>

          <motion.p
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 0.25 }}
            className="mt-6 max-w-md text-pretty text-base leading-7 text-zinc-400"
          >
            Tu asistente de IA responde, toma pedidos y agenda citas por ti.
            Atiende a tus clientes, incluso cuando tú estás atendiendo tu negocio.
          </motion.p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/signup" className="landing-primary">
              Empieza gratis <ArrowRight className="size-4" />
            </Link>
            <a
              href="#demo"
              onClick={handleScrollToDemo}
              className="landing-secondary group"
            >
              <Play className="size-3.5 text-yellow-300 transition group-hover:scale-110" />
              Ver demo interactiva
            </a>
          </div>
          <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-zinc-500">
            {["Sin tarjeta", "Configuración en minutos"].map((item) => (
              <span key={item} className="flex items-center gap-1.5">
                <Check className="size-3 text-yellow-300" />
                {item}
              </span>
            ))}
          </div>

          <details id="experiencia" className="relative mt-8 w-full max-w-md border-t border-white/10 pt-5">
            <summary className="text-xs text-zinc-400 transition hover:text-white cursor-pointer">
              ¿Qué podría hacer por tu negocio?
            </summary>
            <div className="relative mt-4 w-full">
              <div className="mb-3 flex items-start gap-3 rounded-2xl border border-white/10 bg-zinc-900/85 p-4 text-left shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-5">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-yellow-400 text-zinc-950">
                  <MessageCircleMore className="size-4" />
                </span>
                <div>
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="text-xs font-semibold text-yellow-300">Nexo</span>
                    <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                      <span className="size-1.5 rounded-full bg-emerald-400" /> En línea
                    </span>
                  </div>
                  <p className="text-sm leading-6 text-zinc-300">
                    Hola. Soy tu nuevo asistente. ¿De qué trata tu negocio y qué
                    quieres que haga por ti hoy?
                  </p>
                </div>
              </div>

              <form
                onSubmit={handleSubmit}
                className="group flex items-center gap-2 rounded-2xl border border-white/10 bg-black/70 p-2 shadow-[0_18px_70px_rgba(0,0,0,.65)] transition focus-within:border-yellow-400/40 focus-within:shadow-[0_18px_70px_rgba(250,204,21,.08)]"
              >
                <span className="pl-2 font-mono text-sm text-yellow-400">›</span>
                <input
                  value={idea}
                  onChange={(event) => setIdea(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent px-1 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
                  placeholder="Ej: Tengo una barbería y quiero agendar citas..."
                  aria-label="Describe tu negocio"
                />
                <button
                  type="submit"
                  disabled={!idea.trim()}
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-yellow-400 text-zinc-950 transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
                  aria-label="Crear mi asistente"
                >
                  <ArrowUp className="size-4" strokeWidth={2.5} />
                </button>
              </form>

              <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
                Vista previa local. Configura los datos de tu negocio después del registro; este texto no se guarda.
              </p>
            </div>
          </details>
        </div>

        <div className="relative mx-auto w-full max-w-[480px]">
          <WhatsAppDemo />
        </div>
      </div>
    </section>
  );
}
