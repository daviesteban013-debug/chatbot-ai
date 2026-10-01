import type { ReactNode } from "react";
import { Bricolage_Grotesque } from "next/font/google";

/**
 * Display font propia para el onboarding, emparejada con Inter (root layout)
 * como tipografía de cuerpo. La variable `--font-display` queda disponible
 * para todas las páginas hijas.
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

export default function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div
      className={`relative min-h-svh overflow-hidden bg-slate-100 ${display.variable}`}
    >
      {/* Capa atmosférica: halos de color + retícula + grano */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -right-32 -top-40 size-[34rem] rounded-full bg-yellow-300/35 blur-3xl" />
        <div className="absolute -bottom-52 -left-32 size-[30rem] rounded-full bg-slate-400/30 blur-3xl" />
        <div className="absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-amber-200/20 blur-3xl" />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(15,23,42,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(15,23,42,0.06) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage:
              "radial-gradient(ellipse 80% 65% at 50% 40%, black, transparent)",
            WebkitMaskImage:
              "radial-gradient(ellipse 80% 65% at 50% 40%, black, transparent)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.04] mix-blend-multiply"
          style={{ backgroundImage: GRAIN }}
        />
      </div>

      <div className="relative">{children}</div>
    </div>
  );
}
