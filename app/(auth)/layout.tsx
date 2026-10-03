import type { ReactNode } from "react";
import Link from "next/link";
import { Bricolage_Grotesque } from "next/font/google";
import { ArrowLeft, Bot, ShieldCheck, Sparkles } from "lucide-react";
import { FuturisticBackground3D } from "@/components/landing/futuristic-background-3d";
import { AuthTransition } from "./auth-transition";

/**
 * Display font propia para las pantallas de acceso. Se empareja con Inter
 * (cargada en el root layout) como tipografía de cuerpo.
 */
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700", "800"],
  display: "swap",
});

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`relative min-h-svh overflow-hidden bg-zinc-950 text-white ${display.variable}`}
    >
      {/* 3D WebGL Futuristic Interactive Background (Same as landing page) */}
      <FuturisticBackground3D />

      {/* Cybernetic Nebulae & Gradients */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        <div className="absolute -right-28 -top-32 size-[34rem] rounded-full bg-[radial-gradient(circle,rgba(250,204,21,0.14),transparent_65%)] blur-3xl" />
        <div className="absolute -bottom-44 -left-28 size-[32rem] rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.1),transparent_65%)] blur-3xl" />
        <div className="absolute inset-0 opacity-20 cyber-grid-pattern [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_75%)]" />
      </div>

      {/* Top Floating Navigation */}
      <nav aria-label="Navegación secundaria" className="relative z-20 flex items-center justify-between px-6 py-6 sm:px-10">
        <Link
          href="/"
          className="group inline-flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900/70 px-4 py-2 text-xs font-medium text-zinc-300 backdrop-blur-xl transition hover:border-yellow-400/40 hover:bg-zinc-800/80 hover:text-white"
        >
          <ArrowLeft className="size-3.5 transition group-hover:-translate-x-1" />
          <span>Volver al inicio</span>
        </Link>

        <div className="hidden items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-mono text-emerald-400 backdrop-blur-md sm:flex">
          <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>SSL // 256-BIT ENCRYPTION</span>
        </div>
      </nav>

      {/* Main Container */}
      <div className="relative z-10 flex min-h-[calc(100svh-5rem)] flex-col items-center justify-center gap-8 px-4 pb-12 pt-2">
        {/* Animated Brand Header */}
        <header className="flex flex-col items-center gap-3 text-center">
          <Link
            href="/"
            className="group relative flex size-14 items-center justify-center rounded-2xl border border-yellow-400/30 bg-gradient-to-b from-yellow-300 to-amber-500 text-zinc-950 shadow-[0_0_35px_rgba(250,204,21,0.35)] transition duration-300 hover:scale-105"
            aria-label="Ir al inicio"
          >
            <Bot className="size-7" strokeWidth={2.4} />
            <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-emerald-400 text-zinc-950">
              <Sparkles className="size-2.5" />
            </span>
          </Link>
          <div>
            <div className="flex items-center justify-center gap-1.5 font-[family-name:var(--font-display)] text-2xl font-extrabold tracking-tight text-white">
              <span>Nexo</span>
              <span className="bg-gradient-to-r from-yellow-300 to-amber-400 bg-clip-text text-transparent">
                .ai
              </span>
            </div>
            <p className="mt-1 text-xs font-mono uppercase tracking-widest text-zinc-400">
              // Tu asistente de ventas por WhatsApp
            </p>
          </div>
        </header>

        {/* Card Contenedora con Transición Animada */}
        <AuthTransition>
          <div className="cyber-card relative overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/80 p-7 shadow-[0_30px_90px_rgba(0,0,0,0.85)] ring-1 ring-white/5 backdrop-blur-2xl sm:p-9">
            {/* Scanner line animada */}
            <div className="scanner-line opacity-40" />
            {children}
          </div>
        </AuthTransition>

        {/* Footer */}
        <footer className="flex flex-wrap items-center justify-center gap-2 text-center text-xs font-mono text-zinc-500">
          <ShieldCheck className="size-3.5 text-emerald-400" />
          <span>Acceso seguro protegido con Supabase Auth · © {new Date().getFullYear()} Nexo AI</span>
        </footer>
      </div>
    </div>
  );
}
