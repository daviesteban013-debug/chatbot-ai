"use client";

import { useState } from "react";
import { NexoMark } from "@/components/brand/nexo-mark";
import type { JarvisConfig } from "@/lib/jarvis";
import type { JarvisPersonalization } from "@/lib/jarvis-personalization";
import type { VoiceAvailability } from "@/lib/jarvis-voice";
import { JarvisStudio } from "./jarvis-studio";
import { JarvisFullscreenExperience } from "./jarvis-fullscreen";

export function JarvisView({
  initial,
  initialProfile,
  userId,
  voiceAvailability,
  plan,
}: {
  initial: JarvisConfig;
  initialProfile: JarvisPersonalization;
  userId?: string;
  voiceAvailability: VoiceAvailability;
  plan?: string;
}) {
  const [mode, setMode] = useState<"fullscreen" | "studio">("fullscreen");
  const [config, setConfig] = useState(initial);
  const [profile, setProfile] = useState(initialProfile);

  if (mode === "fullscreen") {
    return (
      <JarvisFullscreenExperience
        initialConfig={config}
        profile={profile}
        userId={userId}
        voiceAvailability={voiceAvailability}
        onProfileChange={setProfile}
        plan={plan}
        onSwitchToStudio={() => setMode("studio")}
      />
    );
  }

  return (
    <div>
      {/* Volver a la pantalla de Zorax con voz */}
      <div className="fixed bottom-6 right-6 z-50">
        <button
          type="button"
          onClick={() => setMode("fullscreen")}
          className="flex items-center gap-2 rounded-md border border-white/15 bg-zinc-900 px-3.5 py-2 text-[13px] font-medium text-zinc-100 transition hover:bg-zinc-800"
        >
          <NexoMark className="size-5" />
          <span>Volver a Zorax</span>
        </button>
      </div>

      <JarvisStudio
        initial={config}
        onSaved={setConfig}
      />
    </div>
  );
}
