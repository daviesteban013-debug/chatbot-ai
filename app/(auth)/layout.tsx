import type { ReactNode } from "react";
import { Bricolage_Grotesque } from "next/font/google";
import { Bot } from "lucide-react";

/**
 * Display font propia para las pantallas de acceso. Se empareja con Inter
 * (cargada en el root layout) como tipografía de cuerpo. La variable
 * `--font-display` queda disponible para todas las páginas hijas.
 */
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700", "800"],
  display: "swap",
});

/** Textura de grano (SVG turbulence) para dar atmósfera sin recargar. */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`relative min-h-svh overflow-hidden bg-slate-100 ${display.variable}`}
    >
      {/* Capa atmosférica: halos de color + retícula + grano */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -right-28 -top-32 size-[30rem] rounded-full bg-yellow-300/35 blur-3xl" />
        <div className="absolute -bottom-44 -left-28 size-[28rem] rounded-full bg-slate-400/30 blur-3xl" />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(15,23,42,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,23,42,0.07) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage:
              "radial-gradient(ellipse 75% 60% at 50% 38%, black, transparent)",
            WebkitMaskImage:
              "radial-gradient(ellipse 75% 60% at 50% 38%, black, transparent)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.045] mix-blend-multiply"
          style={{ backgroundImage: GRAIN }}
        />
      </div>

      <div className="relative flex min-h-svh flex-col items-center justify-center gap-8 px-4 py-12">
        {/* Marca */}
        <header className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-slate-950 text-yellow-400 shadow-xl shadow-slate-900/25 ring-1 ring-slate-900/10">
            <Bot className="size-6" strokeWidth={2.2} />
          </span>
          <div>
            <p className="font-[family-name:var(--font-display)] text-2xl font-extrabold tracking-tight text-slate-950">
              Chatbot<span className="text-yellow-500">.ai</span>
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Tu asistente de ventas por WhatsApp
            </p>
          </div>
        </header>

        {/* Tarjeta contenedora del formulario */}
        <main className="w-full max-w-md">
          <div className="rounded-3xl border border-white/70 bg-white/85 p-7 shadow-2xl shadow-slate-500/25 ring-1 ring-slate-900/5 backdrop-blur-xl sm:p-8">
            {children}
          </div>
        </main>

        <footer className="text-center text-xs text-slate-400">
          © {new Date().getFullYear()} Chatbot.ai · Hecho en Colombia
        </footer>
      </div>
    </div>
  );
}
