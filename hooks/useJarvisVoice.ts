"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { selectVoice, speechSettings, spokenText, type JarvisPersonalization } from "@/lib/jarvis-personalization";
import { voiceEngine, type VoiceAvailability } from "@/lib/jarvis-voice";
import { createNeuralPlayback } from "@/lib/neural-playback";
import { createSpeechTurn } from "@/lib/speech-turn";

let activeVoice: { owner: object; stop: () => void } | null = null;

export function useJarvisVoice(profile: JarvisPersonalization, tone: string, onActivity?: (speaking: boolean) => void, availability: VoiceAvailability = { elevenLabs: false }) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [browserSupported, setBrowserSupported] = useState(false);
  const [pending, setPending] = useState(false);
  const [browserQueued, setBrowserQueued] = useState(false);
  const [turnBusy, setTurnBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [readyToPlay, setReadyToPlay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const browserFinishRef = useRef<((success: boolean) => void) | null>(null);
  const activityRef = useRef(onActivity);
  useEffect(() => { activityRef.current = onActivity; }, [onActivity]);
  const activity = useCallback((value: boolean) => { setSpeaking(value); activityRef.current?.(value); }, []);
  const [neural] = useState(() => createNeuralPlayback({
    activity: () => {}, pending: setPending, ready: setReadyToPlay, error: setError,
  }));
  useEffect(() => { neural.setActivity(activity); }, [neural, activity]);
  const engine = voiceEngine(profile, availability);
  const supported = engine === "elevenlabs" ? availability.elevenLabs : browserSupported;

  const stopPlayback = useCallback(() => {
    setBrowserQueued(false);
    if (activeVoice?.owner === neural) activeVoice = null;
    if (utteranceRef.current) {
      utteranceRef.current.onend = null;
      utteranceRef.current.onerror = null;
      utteranceRef.current.onstart = null;
      utteranceRef.current = null;
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    }
    const finish = browserFinishRef.current; browserFinishRef.current = null;
    finish?.(false);
    neural.stop(); activity(false);
  }, [neural, activity]);
  const stopRef = useRef(stopPlayback);
  const speakSentence = useCallback((text: string, preview = false): Promise<boolean> => {
    if (!preview && !profile.voice.enabled) return Promise.resolve(false);
    stopPlayback(); setError(null);
    const clean = spokenText(text);
    if (!clean) return Promise.resolve(true);
    activeVoice?.stop();
    activeVoice = { owner: neural, stop: () => stopRef.current() };
    return new Promise(resolve => {
      if (engine === "elevenlabs") {
        if (!availability.elevenLabs) { setError("ElevenLabs aún no está conectado. Elige Voz del dispositivo para hablar ahora."); resolve(false); return; }
        void neural.speak({ text: clean, tone, voice: profile.voice }, resolve);
        return;
      }
      if (!browserSupported) { setError("Este navegador no ofrece voz del dispositivo."); resolve(false); return; }
      const utterance = new SpeechSynthesisUtterance(clean);
      setBrowserQueued(true);
      const voice = selectVoice(window.speechSynthesis.getVoices(), profile);
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang ?? profile.voice.locale;
      Object.assign(utterance, speechSettings(profile, tone, clean));
      utterance.onstart = () => { if (utteranceRef.current === utterance) activity(true); };
      const finish = (success: boolean) => {
        if (utteranceRef.current !== utterance) return;
        utteranceRef.current = null; browserFinishRef.current = null;
        if (activeVoice?.owner === neural) activeVoice = null;
        setBrowserQueued(false); activity(false); resolve(success);
      };
      utterance.onend = () => finish(true);
      utterance.onerror = event => {
        if (event.error !== "canceled" && event.error !== "interrupted") setError("No se pudo reproducir la voz. Prueba otra voz y pulsa Escuchar prueba.");
        finish(false);
      };
      utteranceRef.current = utterance;
      browserFinishRef.current = resolve;
      try { window.speechSynthesis.speak(utterance); }
      catch { finish(false); setError("No se pudo iniciar la voz del dispositivo. Puedes seguir hablando o escribir."); }
    });
  }, [profile, tone, stopPlayback, engine, availability.elevenLabs, browserSupported, neural, activity]);
  const [turn] = useState(() => createSpeechTurn({ speak: async () => false, stop: () => {}, busy: setTurnBusy }));
  useEffect(() => { turn.setPlayer({ speak: speakSentence, stop: stopPlayback, busy: setTurnBusy }); }, [turn, speakSentence, stopPlayback]);
  const stop = useCallback(() => turn.stop(), [turn]);
  useEffect(() => { stopRef.current = stop; }, [stop]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return stop;
    const synth = window.speechSynthesis;
    const refresh = () => { setBrowserSupported(true); setVoices(synth.getVoices().filter(v => v.lang.startsWith("es"))); };
    refresh();
    synth.addEventListener("voiceschanged", refresh);
    return () => { synth.removeEventListener("voiceschanged", refresh); stop(); };
  }, [stop]);

  const speak = useCallback((text: string, preview = false) => { stop(); void speakSentence(text, preview); }, [stop, speakSentence]);
  const beginStream = useCallback(() => { turn.begin(); }, [turn]);
  const pushText = useCallback((delta: string) => turn.push(delta), [turn]);
  const finishStream = useCallback((text: string) => turn.finish(text), [turn]);
  useEffect(() => stop, [engine, profile.voice.enabled, stop]);
  const resume = useCallback(() => { setError(null); void neural.play(); }, [neural]);
  return { voices, supported, browserSupported, engine, pending: pending || browserQueued, busy: turnBusy || pending || browserQueued || speaking || readyToPlay, speaking, readyToPlay, resume, error, speak, stop, beginStream, pushText, finishStream };
}
