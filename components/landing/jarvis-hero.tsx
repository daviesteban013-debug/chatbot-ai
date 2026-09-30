"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowUp, Bot, Check, MessageCircleMore, Sparkles } from "lucide-react";

export function JarvisHero() {
  const router = useRouter();
  const [idea, setIdea] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!idea.trim()) return;
    router.push("/dashboard");
  }

  return (
    <main className="relative isolate min-h-svh overflow-hidden bg-zinc-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_48%,rgba(250,204,21,0.13),transparent_27%),radial-gradient(circle_at_10%_10%,rgba(250,204,21,0.06),transparent_22%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:linear-gradient(to_bottom,black,transparent_72%)]" />
      <div className="pointer-events-none absolute left-1/2 top-[43%] h-80 w-80 -translate-x-1/2 rounded-full border border-yellow-300/10" />
      <div className="pointer-events-none absolute left-1/2 top-[43%] h-[28rem] w-[28rem] -translate-x-1/2 rounded-full border border-dashed border-yellow-300/10" />

      <section className="relative mx-auto flex min-h-svh max-w-6xl flex-col items-center px-5 pb-16 pt-32 text-center sm:pt-36">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="mb-5 inline-flex items-center gap-2 rounded-full border border-yellow-400/20 bg-yellow-400/5 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-yellow-300"
        >
          <Sparkles className="size-3.5" />
          Inteligencia que vende por ti
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.08 }}
          className="max-w-4xl text-balance text-5xl font-medium leading-[0.98] tracking-[-0.055em] text-zinc-100 sm:text-7xl lg:text-[5.7rem]"
        >
          A un mensaje de...
          <span className="mt-2 block bg-gradient-to-r from-yellow-200 via-yellow-400 to-amber-500 bg-clip-text text-transparent">
            automatizar tus ventas
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.25 }}
          className="mt-6 max-w-xl text-pretty text-sm leading-6 text-zinc-400 sm:text-base"
        >
          Convierte cada conversación de WhatsApp en una oportunidad. Atiende,
          agenda y vende incluso cuando no estás conectado.
        </motion.p>

        <div id="experiencia" className="relative mt-8 flex w-full flex-col items-center sm:mt-10">
          <motion.div
            animate={{ y: [0, -13, 0], rotate: [0, 1.5, 0, -1.5, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            className="relative z-10 flex size-36 items-center justify-center sm:size-44"
          >
            <div className="absolute inset-0 rounded-full bg-yellow-300/20 blur-3xl" />
            <div className="absolute inset-3 rounded-full border border-yellow-300/25 bg-gradient-to-b from-zinc-700/60 to-black shadow-[0_0_70px_rgba(250,204,21,0.16)]" />
            <div className="absolute inset-6 rounded-[2.5rem] border border-white/15 bg-gradient-to-br from-zinc-800 via-zinc-950 to-black shadow-inner shadow-white/10" />
            <div className="absolute inset-9 rounded-[2rem] border border-yellow-300/30 bg-gradient-to-br from-yellow-300/15 via-zinc-950 to-zinc-950" />
            <Bot className="relative size-16 text-yellow-300 drop-shadow-[0_0_18px_rgba(250,204,21,.6)] sm:size-20" strokeWidth={1.35} />
            <span className="absolute right-3 top-6 size-3 rounded-full border-2 border-zinc-950 bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.8)] sm:right-5" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45 }}
            className="relative z-20 mt-1 w-full max-w-2xl"
          >
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

            <div id="como-funciona" className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-zinc-500">
              {["Sin tarjeta", "Configuración en minutos", "Demo instantánea"].map((item) => (
                <span key={item} className="flex items-center gap-1.5">
                  <Check className="size-3 text-yellow-400" /> {item}
                </span>
              ))}
            </div>
          </motion.div>
        </div>
      </section>
    </main>
  );
}
