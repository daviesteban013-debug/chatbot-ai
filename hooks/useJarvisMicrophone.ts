"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createJarvisListener, type Recognition } from "@/lib/jarvis-listener";

export function useJarvisMicrophone(locale: string, onTranscript: (text: string, wakeOnly: boolean) => boolean) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const callback = useRef(onTranscript);
  const speechClass = useRef<(new () => Recognition) | null>(null);
  const language = useRef(locale);
  const listener = useRef<ReturnType<typeof createJarvisListener> | null>(null);
  useEffect(() => { callback.current = onTranscript; }, [onTranscript]);
  useEffect(() => {
    const speechWindow = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Speech = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Speech) return;
    speechClass.current = Speech;
    language.current = locale;
    const initialize = () => { setSupported(true); setListening(false); };
    initialize();
    const onVisibility = () => { if (document.hidden) listener.current?.stop(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { document.removeEventListener("visibilitychange", onVisibility); listener.current?.dispose(); listener.current = null; speechClass.current = null; };
  }, [locale]);
  const stop = useCallback(() => { listener.current?.stop(); }, []);
  const start = useCallback((wakeOnly: boolean) => {
    const Speech = speechClass.current;
    if (!Speech) return;
    // A new recognizer keeps late abort/end events from a prior turn isolated.
    listener.current?.dispose();
    const recognition = new Speech();
    recognition.lang = language.current;
    const current = createJarvisListener(recognition, {
      listening: setListening,
      error: setError,
      transcript: (text, wakeOnly) => callback.current(text, wakeOnly),
    });
    listener.current = current;
    current.start(wakeOnly);
  }, []);
  return { supported, listening, error, start, stop };
}
