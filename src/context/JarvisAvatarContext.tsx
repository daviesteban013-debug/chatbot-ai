"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import type { AvatarState } from "@/types/jarvis";

export interface JarvisContextValue {
  state: AvatarState;
  setState: (state: AvatarState) => void;
  audioLevel: number;
  setAudioLevel: (level: number) => void;
  accentColor: string;
  setAccentColor: (color: string) => void;
  glowIntensity: number;
  statusLabel: string;
  triggerListening: () => void;
}

const JarvisAvatarContext = createContext<JarvisContextValue | undefined>(
  undefined
);

const STATUS_LABELS: Record<AvatarState, string> = {
  IDLE: "KERNEL 3D // EN ESPERA",
  LISTENING: "AUDIO / TEXTO // ENTRADA ACTIVA",
  PROCESSING: "NÚCLEO NEURAL // PROCESANDO",
  SPEAKING: "TRANSMITIENDO // RESPUESTA EN VIVO",
  ERROR: "ALERTA // FALLO DE ENLACE",
};

const BASE_GLOW_INTENSITY: Record<AvatarState, number> = {
  IDLE: 0.6,
  LISTENING: 0.9,
  PROCESSING: 2.2,
  SPEAKING: 1.5,
  ERROR: 1.2,
};

export function JarvisAvatarProvider({
  children,
  initialAccent = "#facc15",
}: {
  children: ReactNode;
  initialAccent?: string;
}) {
  const [state, setStateRaw] = useState<AvatarState>("IDLE");
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [accentColor, setAccentColor] = useState<string>(initialAccent);

  const listeningTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const setState = useCallback((nextState: AvatarState) => {
    if (listeningTimeoutRef.current) {
      clearTimeout(listeningTimeoutRef.current);
      listeningTimeoutRef.current = null;
    }
    setStateRaw(nextState);
  }, []);

  const triggerListening = useCallback(() => {
    setStateRaw((prev) => {
      // Si ya está procesando o hablando, no forzar LISTENING
      if (prev === "PROCESSING" || prev === "SPEAKING") return prev;
      return "LISTENING";
    });

    if (listeningTimeoutRef.current) {
      clearTimeout(listeningTimeoutRef.current);
    }
    // Regresar a IDLE si no se envía nada después de 3 segundos
    listeningTimeoutRef.current = setTimeout(() => {
      setStateRaw((prev) => (prev === "LISTENING" ? "IDLE" : prev));
    }, 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (listeningTimeoutRef.current) {
        clearTimeout(listeningTimeoutRef.current);
      }
    };
  }, []);

  const glowIntensity = useMemo(() => {
    const base = BASE_GLOW_INTENSITY[state] ?? 0.6;
    if (state === "SPEAKING") {
      return base + audioLevel * 0.8;
    }
    return base;
  }, [state, audioLevel]);

  const statusLabel = STATUS_LABELS[state] ?? STATUS_LABELS.IDLE;

  const value = useMemo(
    () => ({
      state,
      setState,
      audioLevel,
      setAudioLevel,
      accentColor,
      setAccentColor,
      glowIntensity,
      statusLabel,
      triggerListening,
    }),
    [
      state,
      setState,
      audioLevel,
      accentColor,
      glowIntensity,
      statusLabel,
      triggerListening,
    ]
  );

  return (
    <JarvisAvatarContext.Provider value={value}>
      {children}
    </JarvisAvatarContext.Provider>
  );
}

export function useJarvisAvatar(): JarvisContextValue {
  const context = useContext(JarvisAvatarContext);
  if (!context) {
    return {
      state: "IDLE",
      setState: () => {},
      audioLevel: 0,
      setAudioLevel: () => {},
      accentColor: "#facc15",
      setAccentColor: () => {},
      glowIntensity: 0.6,
      statusLabel: "KERNEL 3D // EN ESPERA",
      triggerListening: () => {},
    };
  }
  return context;
}
