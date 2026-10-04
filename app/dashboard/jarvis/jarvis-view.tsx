"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { JarvisConfig } from "@/lib/jarvis";
import { JarvisStudio } from "./jarvis-studio";
import { JarvisFullscreenExperience } from "./jarvis-fullscreen";

export function JarvisView({
  initial,
  plan,
  justPaid,
  claimError,
}: {
  initial: JarvisConfig;
  plan?: string;
  justPaid: boolean;
  claimError: string | null;
}) {
  // Si recién pagó, salta directamente en modo pantalla completa inmersivo
  const [mode, setMode] = useState<"fullscreen" | "studio">(() =>
    justPaid ? "fullscreen" : "fullscreen"
  );

  if (mode === "fullscreen") {
    return (
      <JarvisFullscreenExperience
        initialConfig={initial}
        plan={plan}
        justPaid={justPaid}
        onSwitchToStudio={() => setMode("studio")}
      />
    );
  }

  return (
    <div>
      {/* Botón flotante para volver a la experiencia 3D inmersiva con voz */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          type="button"
          onClick={() => setMode("fullscreen")}
          className="flex items-center gap-2 rounded-2xl border border-yellow-400/40 bg-zinc-950/90 px-5 py-3 text-xs font-bold text-yellow-300 shadow-[0_0_30px_rgba(250,204,21,0.25)] backdrop-blur-xl transition hover:scale-105 hover:bg-yellow-400 hover:text-zinc-950"
        >
          <Sparkles className="size-4 animate-pulse" />
          <span>Abrir Jarvis 3D con Voz (Pantalla Completa)</span>
        </button>
      </div>

      <JarvisStudio
        initial={initial}
        plan={plan}
        justPaid={justPaid}
        claimError={claimError}
      />
    </div>
  );
}
