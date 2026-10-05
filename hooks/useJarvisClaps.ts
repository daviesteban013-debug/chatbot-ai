"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClapListener } from "@/lib/jarvis-claps";

export function useJarvisClaps(onClap: () => void) {
  const callback = useRef(onClap);
  const listener = useRef<ReturnType<typeof createClapListener> | null>(null);
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { callback.current = onClap; }, [onClap]);
  useEffect(() => {
    let active = true;
    const available = Boolean(window.isSecureContext && typeof navigator.mediaDevices?.getUserMedia === "function" && typeof window.AudioContext === "function");
    queueMicrotask(() => { if (active) setSupported(available); });
    if (available) listener.current = createClapListener({
      media: () => navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false }),
      audio: () => new AudioContext(), frame: requestAnimationFrame, cancelFrame: cancelAnimationFrame, now: () => performance.now(),
    }, {
      pending: value => { if (active) setPending(value); },
      listening: value => { if (active) setListening(value); },
      error: value => { if (active) setError(value); },
      clap: () => { if (active) callback.current(); },
    });
    const onHidden = () => { if (document.hidden) listener.current?.stop(); };
    document.addEventListener("visibilitychange", onHidden);
    return () => { active = false; listener.current?.dispose(); listener.current = null; document.removeEventListener("visibilitychange", onHidden); };
  }, []);
  const start = useCallback(() => { void listener.current?.start(); }, []);
  const stop = useCallback(() => { listener.current?.stop(); }, []);
  return { supported, listening, pending, error, start, stop };
}
