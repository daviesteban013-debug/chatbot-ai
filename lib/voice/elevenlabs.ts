import "server-only";
import type { VoiceAvailability } from "@/lib/jarvis-voice";

export function elevenLabsConfig() {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim();
  const model = process.env.ELEVENLABS_MODEL?.trim() || "eleven_multilingual_v2";
  if (!apiKey || !voiceId || !/^[a-zA-Z0-9_-]{1,100}$/.test(voiceId)) return null;
  // These models share the voice-settings contract used by Jarvis.
  if (!["eleven_multilingual_v2", "eleven_flash_v2_5"].includes(model)) return null;
  return { apiKey, voiceId, model };
}

export function voiceAvailability(): VoiceAvailability {
  return { elevenLabs: Boolean(elevenLabsConfig()) };
}
