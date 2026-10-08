"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createJarvisListener, type Recognition } from "@/lib/jarvis-listener";
import { createRecorderListener } from "@/lib/voice/recorder-listener";

export function useJarvisMicrophone(locale: string, onTranscript: (text: string, wakeOnly: boolean) => boolean, blocked = false) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const callback = useRef(onTranscript);
  const speechClass = useRef<(new () => Recognition) | null>(null);
  const canRecord = useRef(false);
  const language = useRef(locale);
  const listener = useRef<ReturnType<typeof createJarvisListener> | null>(null);
  const blockedRef = useRef(blocked);
  useEffect(() => {
    blockedRef.current = blocked;
    listener.current?.setPaused(blocked || (!window.nexoDesktop && document.hidden));
  }, [blocked, armed]);
  useEffect(() => { callback.current = onTranscript; }, [onTranscript]);
  useEffect(() => {
    const speechWindow = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Speech = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    canRecord.current = typeof navigator.mediaDevices?.getUserMedia === "function" && typeof window.MediaRecorder === "function" && typeof window.AudioContext === "function";
    speechClass.current = window.nexoDesktop ? null : Speech ?? null;
    language.current = locale;
    const initialize = () => { setSupported(Boolean(Speech || canRecord.current)); setListening(false); setArmed(false); };
    initialize();
    const onVisibility = () => { listener.current?.setPaused((!window.nexoDesktop && document.hidden) || blockedRef.current); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { document.removeEventListener("visibilitychange", onVisibility); listener.current?.dispose(); listener.current = null; speechClass.current = null; };
  }, [locale]);
  const stop = useCallback(() => { listener.current?.stop(); setArmed(false); }, []);
  const pause = useCallback(() => { listener.current?.setPaused(true); }, []);
  const start = useCallback((wakeOnly: boolean, continuous = false, initiallyPaused = false) => {
    const Speech = speechClass.current;
    if (!Speech && !canRecord.current) return;
    // A new recognizer keeps late abort/end events from a prior turn isolated.
    listener.current?.dispose();
    const callbacks = {
      listening: setListening,
      error: (message: string | null) => { setError(message); if (message) setArmed(false); },
      transcript: (text: string, wake: boolean) => callback.current(text, wake),
    };
    const beginRecorder = () => {
      listener.current?.dispose();
      const recorder = createRecorderListener(language.current, callbacks);
      listener.current = recorder;
      setArmed(true); setError(null);
      recorder.setPaused(blockedRef.current || (!window.nexoDesktop && document.hidden) || initiallyPaused);
      void recorder.start(wakeOnly, continuous);
    };
    if (!Speech) { beginRecorder(); return; }
    const recognition = new Speech();
    recognition.lang = language.current;
    const current = createJarvisListener(recognition, { ...callbacks,
      error: (message, reason) => {
        if (reason === "network" && canRecord.current) beginRecorder();
        else callbacks.error(message);
      },
    });
    listener.current = current;
    setArmed(true);
    current.setPaused(blockedRef.current || (!window.nexoDesktop && document.hidden) || initiallyPaused);
    current.start(wakeOnly, continuous);
  }, []);
  return { supported, listening, armed, error, start, stop, pause };
}
