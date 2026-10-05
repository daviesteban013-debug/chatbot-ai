"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { selectVoice, speechSettings, spokenText, type JarvisPersonalization } from "@/lib/jarvis-personalization";

export function useJarvisVoice(profile: JarvisPersonalization, tone: string, onActivity?: (speaking: boolean) => void) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const activityRef = useRef(onActivity);
  useEffect(() => { activityRef.current = onActivity; }, [onActivity]);

  const stop = useCallback(() => {
    // Detach handlers before cancel: browsers may deliver canceled events later.
    if (utteranceRef.current) {
      utteranceRef.current.onend = null;
      utteranceRef.current.onerror = null;
      utteranceRef.current.onstart = null;
      utteranceRef.current = null;
    }
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    activityRef.current?.(false);
  }, []);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const refresh = () => { setSupported(true); setVoices(synth.getVoices().filter(v => v.lang.startsWith("es"))); };
    refresh();
    synth.addEventListener("voiceschanged", refresh);
    return () => { synth.removeEventListener("voiceschanged", refresh); stop(); };
  }, [stop]);

  const speak = useCallback((text: string, preview = false) => {
    if (!supported || (!preview && !profile.voice.enabled)) return;
    stop();
    setError(null);
    const clean = spokenText(text);
    if (!clean) return;
    const utterance = new SpeechSynthesisUtterance(clean);
    const voice = selectVoice(window.speechSynthesis.getVoices(), profile);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? profile.voice.locale;
    Object.assign(utterance, speechSettings(profile, tone, clean));
    utterance.onstart = () => activityRef.current?.(true);
    const finish = () => { if (utteranceRef.current === utterance) { utteranceRef.current = null; activityRef.current?.(false); } };
    utterance.onend = finish;
    utterance.onerror = (event) => {
      if (event.error !== "canceled" && event.error !== "interrupted") setError("No se pudo reproducir la voz. Prueba otra voz y pulsa Escuchar prueba.");
      finish();
    };
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [profile, tone, stop, supported]);

  useEffect(() => { if (!profile.voice.enabled) stop(); }, [profile.voice.enabled, stop]);
  return { voices, supported, error, speak, stop };
}
