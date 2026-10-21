import { speechSettings, type JarvisPersonalization } from "./jarvis-personalization";

export const MAX_SPEECH_CHARACTERS = 4000;
export interface VoiceAvailability { elevenLabs: boolean }

export function voiceEngine(profile: JarvisPersonalization, availability: VoiceAvailability): "browser" | "elevenlabs" {
  if (profile.voice.engine === "auto") return availability.elevenLabs ? "elevenlabs" : "browser";
  return profile.voice.engine;
}

/** ElevenLabs at speed 1 paces slower than the browser voices at rate 1; this brings it to the same brisk, natural tempo. */
export const ELEVENLABS_PACE = 1.12;

export function elevenLabsSettings(profile: JarvisPersonalization, tone: string, text: string) {
  let stability = profile.voice.stability;
  if (profile.voice.adaptive) {
    if (tone === "profesional") stability += 0.1;
    if (tone === "divertido") stability -= 0.1;
  }
  return {
    speed: Math.round(Math.min(1.2, Math.max(0.7, speechSettings(profile, tone, text).rate * ELEVENLABS_PACE)) * 100) / 100,
    stability: Math.min(1, Math.max(0, stability)),
    similarity_boost: profile.voice.similarity,
  };
}
