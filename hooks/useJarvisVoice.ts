"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { selectVoice, speechSettings, spokenText, type JarvisPersonalization } from "@/lib/jarvis-personalization";
import { voiceEngine, type VoiceAvailability } from "@/lib/jarvis-voice";
import { createNeuralPlayback } from "@/lib/neural-playback";

let activeVoice: { owner: object; stop: () => void } | null = null;

export function useJarvisVoice(profile: JarvisPersonalization, tone: string, onActivity?: (speaking: boolean) => void, availability: VoiceAvailability = { elevenLabs: false }) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [browserSupported, setBrowserSupported] = useState(false);
  const [pending, setPending] = useState(false);
  const [browserQueued, setBrowserQueued] = useState(false);
  const [readyToPlay, setReadyToPlay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const activityRef = useRef(onActivity);
  useEffect(() => { activityRef.current = onActivity; }, [onActivity]);
  const [neural] = useState(() => createNeuralPlayback({
    activity: () => {},
    pending: setPending, ready: setReadyToPlay, error: setError,
  }));
  useEffect(() => { neural.setActivity(onActivity ?? (() => {})); }, [neural, onActivity]);
  const engine = voiceEngine(profile, availability);
  const supported = engine === "elevenlabs" ? availability.elevenLabs : browserSupported;

  const stop = useCallback(() => {
    setBrowserQueued(false);
    if (activeVoice?.owner === neural) activeVoice = null;
    // Detach handlers before cancel: browsers may deliver canceled events later.
    if (utteranceRef.current) {
      utteranceRef.current.onend = null;
      utteranceRef.current.onerror = null;
      utteranceRef.current.onstart = null;
      utteranceRef.current = null;
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    }
    neural.stop();
    activityRef.current?.(false);
  }, [neural]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return stop;
    const synth = window.speechSynthesis;
    const refresh = () => { setBrowserSupported(true); setVoices(synth.getVoices().filter(v => v.lang.startsWith("es"))); };
    refresh();
    synth.addEventListener("voiceschanged", refresh);
    return () => { synth.removeEventListener("voiceschanged", refresh); stop(); };
  }, [stop]);

  const speak = useCallback((text: string, preview = false) => {
    if (!preview && !profile.voice.enabled) return;
    stop();
    setError(null);
    const clean = spokenText(text);
    if (!clean) return;
    activeVoice?.stop();
    activeVoice = { owner: neural, stop };
    if (engine === "elevenlabs") {
      if (!availability.elevenLabs) { setError("ElevenLabs aún no está conectado. Elige Voz del dispositivo para hablar ahora."); return; }
      void neural.speak({ text: clean, tone, voice: profile.voice });
      return;
    }
    if (!browserSupported) { setError("Este navegador no ofrece voz del dispositivo."); return; }
    const utterance = new SpeechSynthesisUtterance(clean);
    setBrowserQueued(true);
    const voice = selectVoice(window.speechSynthesis.getVoices(), profile);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? profile.voice.locale;
    Object.assign(utterance, speechSettings(profile, tone, clean));
    utterance.onstart = () => activityRef.current?.(true);
    const finish = () => { if (utteranceRef.current === utterance) { utteranceRef.current = null; setBrowserQueued(false); activityRef.current?.(false); } };
    utterance.onend = finish;
    utterance.onerror = (event) => {
      if (event.error !== "canceled" && event.error !== "interrupted") setError("No se pudo reproducir la voz. Prueba otra voz y pulsa Escuchar prueba.");
      finish();
    };
    utteranceRef.current = utterance;
    try { window.speechSynthesis.speak(utterance); }
    catch { finish(); setError("No se pudo iniciar la voz del dispositivo. Puedes seguir hablando o escribir."); }
  }, [profile, tone, stop, engine, availability.elevenLabs, browserSupported, neural]);

  useEffect(() => stop, [engine, profile.voice.enabled, stop]);
  const resume = useCallback(() => { setError(null); void neural.play(); }, [neural]);
  return { voices, supported, browserSupported, engine, pending: pending || browserQueued, readyToPlay, resume, error, speak, stop };
}
