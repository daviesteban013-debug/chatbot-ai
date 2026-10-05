"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Send,
  Sparkles,
  Sliders,
  RotateCcw,
  CheckCircle2,
  ArrowLeft,
  Bot,
  User,
  Zap,
  Settings2,
} from "lucide-react";
import { JarvisHeroOrb3D } from "@/components/landing/jarvis-hero-orb-3d";
import { JarvisAvatarProvider, useJarvisAvatar } from "@/context/JarvisAvatarContext";
import { useJarvisAgent } from "@/hooks/useJarvisAgent";
import type { JarvisConfig } from "@/lib/jarvis";
import type { JarvisPersonalization } from "@/lib/jarvis-personalization";
import { useJarvisVoice } from "@/hooks/useJarvisVoice";
import { JarvisPersonalizationPanel } from "./jarvis-personalization";

// Tipos para Web Speech API
interface SpeechRecognitionEventLike {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
  };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: () => void;
  onresult: (event: SpeechRecognitionEventLike) => void;
  onerror: (event: unknown) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface FullscreenProps {
  initialConfig: JarvisConfig;
  profile: JarvisPersonalization;
  userId?: string;
  onProfileChange: (profile: JarvisPersonalization) => void;
  plan?: string;
  justPaid: boolean;
  onSwitchToStudio?: () => void;
}

export function JarvisFullscreenExperience({
  initialConfig,
  profile,
  userId,
  onProfileChange,
  plan,
  justPaid,
  onSwitchToStudio,
}: FullscreenProps) {
  return (
    <JarvisAvatarProvider initialAccent={initialConfig.accent}>
      <JarvisFullscreenInner
        initialConfig={initialConfig}
        profile={profile}
        userId={userId}
        onProfileChange={onProfileChange}
        plan={plan}
        justPaid={justPaid}
        onSwitchToStudio={onSwitchToStudio}
      />
    </JarvisAvatarProvider>
  );
}

function JarvisFullscreenInner({
  initialConfig,
  profile,
  userId,
  onProfileChange,
  plan,
  justPaid,
  onSwitchToStudio,
}: FullscreenProps) {
  const { state, statusLabel, setAudioLevel, setState } = useJarvisAvatar();
  const [isVoiceOutputEnabled, setIsVoiceOutputEnabled] = useState(profile.voice.enabled);
  const [showPersonalization, setShowPersonalization] = useState(false);
  const onVoiceActivity = useCallback((speaking: boolean) => {
    setState(speaking ? "SPEAKING" : "IDLE");
    setAudioLevel(speaking ? 0.4 : 0);
  }, [setState, setAudioLevel]);
  const { speak, stop: stopVoice, error: voiceError } = useJarvisVoice(
    { ...profile, voice: { ...profile.voice, enabled: isVoiceOutputEnabled } }, initialConfig.tone, onVoiceActivity
  );
  const speakRef = useRef(speak);
  useEffect(() => { speakRef.current = speak; }, [speak]);
  const onResponseComplete = useCallback((message: { content: string }) => { speakRef.current(message.content); }, []);
  const {
    messages,
    isLoading,
    error,
    input,
    handleInputChange,
    sendMessage,
    clearChat,
  } = useJarvisAgent({ sessionScope: userId ?? "public", onResponseComplete, onPersonalizationChange: onProfileChange });

  // Estados de voz y audio
  const [isRecording, setIsRecording] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const voiceInputRef = useRef({ handleInputChange, sendMessage });
  useEffect(() => { voiceInputRef.current = { handleInputChange, sendMessage }; }, [handleInputChange, sendMessage]);

  const hasWelcomedRef = useRef(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll del historial de mensajes
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Inicializar Web Speech Recognition (Micrófono)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const WinWithSpeech = window as unknown as {
        SpeechRecognition?: new () => SpeechRecognitionLike;
        webkitSpeechRecognition?: new () => SpeechRecognitionLike;
      };
      const SpeechClass =
        WinWithSpeech.SpeechRecognition || WinWithSpeech.webkitSpeechRecognition;

      if (SpeechClass) {
        const enableSpeech = () => setSpeechSupported(true);
        enableSpeech();
        const recognition = new SpeechClass();
        recognition.lang = profile.voice.locale;
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onstart = () => setIsRecording(true);
        recognition.onend = () => setIsRecording(false);
        recognition.onerror = () => setIsRecording(false);

        recognition.onresult = (event: SpeechRecognitionEventLike) => {
          const transcript = event.results[0]?.[0]?.transcript;
          if (transcript?.trim()) {
            voiceInputRef.current.handleInputChange(transcript);
            voiceInputRef.current.sendMessage(transcript);
          }
        };

        recognitionRef.current = recognition;
        return () => {
          recognition.onstart = () => {};
          recognition.onresult = () => {};
          recognition.onend = () => {};
          recognition.onerror = () => {};
          recognition.abort();
          recognitionRef.current = null;
        };
      }
    }
  }, [profile.voice.locale]);

  // Mensaje de bienvenida inicial de Jarvis al cargar tras el pago
  useEffect(() => {
    if (justPaid && !hasWelcomedRef.current && messages.length === 0) {
      hasWelcomedRef.current = true;
      const welcomePrompt = `¡Hola! Acabo de activar mi suscripción a ${plan ? `Plan ${plan}` : "tu plan"}. Actívate e inicia la configuración de mi negocio.`;
      sendMessage(welcomePrompt);
    }
  }, [justPaid, messages.length, plan, sendMessage]);

  // Alternar micrófono
  const toggleRecording = () => {
    if (!recognitionRef.current) return;
    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      stopVoice();
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.warn("[Voice] Error iniciando reconocimiento:", err);
      }
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    stopVoice();
    sendMessage();
  };

  const quickPrompts = [
    "Configurar nombre y horarios de mi negocio",
    "¿Cómo responderás sobre el catálogo?",
    "Ajustar tono de voz a cercano y vendedor",
    "Establecer descuento máximo del 10%",
  ];

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-black text-white flex flex-col font-sans select-none">
      {/* Dynamic Cyber Grid & Scanline Background */}
      <div className="pointer-events-none absolute inset-0 opacity-20 cyber-grid-pattern" />
      <div className="scanner-line opacity-30" />
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-[600px] w-[1000px] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(250,204,21,0.15),rgba(56,189,248,0.08)_45%,transparent_75%)] blur-3xl" />

      {/* Top Header Command Bar */}
      <header className="relative z-20 flex items-center justify-between border-b border-white/10 bg-zinc-950/80 px-6 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-400 transition hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="size-3.5" />
            <span>Dashboard</span>
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex items-center gap-2">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-400" />
            </span>
            <span className="font-mono text-xs font-bold tracking-wider text-yellow-300">
              JARVIS // FULLSCREEN COMMAND CENTER
            </span>
            {plan && (
              <span className="rounded-full bg-yellow-400/10 px-2 py-0.5 font-mono text-[10px] text-yellow-300 border border-yellow-400/20">
                PLAN {plan.toUpperCase()} ACTIVO
              </span>
            )}
          </div>
        </div>

        {/* Controles de Audio y Switch a Estudio Manual */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setIsVoiceOutputEnabled(!isVoiceOutputEnabled);
              if (isVoiceOutputEnabled) {
                stopVoice();
              }
            }}
            title={isVoiceOutputEnabled ? "Silenciar voz de Jarvis" : "Activar voz hablada de Jarvis"}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs transition ${
              isVoiceOutputEnabled
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                : "border-white/10 bg-white/5 text-zinc-400 hover:text-white"
            }`}
          >
            {isVoiceOutputEnabled ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
            <span className="hidden sm:inline">{isVoiceOutputEnabled ? "Voz: Activa" : "Voz: Mute"}</span>
          </button>

          <button
            type="button"
            onClick={() => { stopVoice(); recognitionRef.current?.abort(); clearChat(); }}
            title="Reiniciar sesión de conversación"
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-zinc-400 transition hover:bg-white/10 hover:text-white"
          >
            <RotateCcw className="size-3.5" />
          </button>

          <button type="button" onClick={() => { stopVoice(); recognitionRef.current?.abort(); setShowPersonalization(p => !p); }} aria-expanded={showPersonalization} className="flex items-center gap-2 rounded-xl border border-yellow-300/30 px-3 py-2 text-xs text-yellow-200"><Settings2 className="size-4" /><span className="hidden sm:inline">Personalización</span><span className="sr-only sm:hidden">Personalización</span></button>
          {onSwitchToStudio && (
            <button
              type="button"
              onClick={onSwitchToStudio}
              className="flex items-center gap-1.5 rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-3.5 py-1.5 text-xs font-semibold text-yellow-300 transition hover:bg-yellow-400/20"
            >
              <Sliders className="size-3.5" />
              <span>Ajustes Manuales</span>
            </button>
          )}
        </div>
      </header>

      {showPersonalization && <JarvisPersonalizationPanel profile={profile} tone={initialConfig.tone} authenticated={Boolean(userId)} onClose={() => setShowPersonalization(false)} onSaved={next => { onProfileChange(next); setIsVoiceOutputEnabled(next.voice.enabled); }} />}
      {voiceError && <p role="alert" className="relative z-20 px-6 py-2 text-sm text-red-300">{voiceError}</p>}

      {/* Notificación de Pago Exitoso */}
      {justPaid && (
        <div className="relative z-20 border-b border-yellow-400/20 bg-yellow-400/10 px-6 py-2.5 text-center text-xs font-medium text-yellow-200 flex items-center justify-center gap-2">
          <CheckCircle2 className="size-4 text-yellow-300" />
          <span>¡Pago confirmado con éxito! Jarvis está listo para configurar tu negocio paso a paso.</span>
        </div>
      )}

      {/* Main Fullscreen Layout: Split 3D Avatar (Izquierda / Centro) y Feed de Chat (Derecha / Abajo) */}
      <main className="relative z-10 flex flex-1 flex-col lg:flex-row items-center justify-between p-4 sm:p-6 lg:p-8 gap-6 overflow-hidden">
        {/* Left Column: Huge 3D Holographic Core & Telemetry */}
        <section className="flex flex-1 flex-col items-center justify-center w-full max-w-[540px]">
          <div className="w-full">
            <JarvisHeroOrb3D />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px] font-mono text-zinc-400">
            <span className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900/60 px-2.5 py-1 backdrop-blur-md">
              <Zap className="size-3 text-yellow-400" />
              <span>ESTADO: {statusLabel}</span>
            </span>
            <span className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-zinc-900/60 px-2.5 py-1 backdrop-blur-md">
              <Sparkles className="size-3 text-emerald-400" />
              <span>CANAL: VOZ & CHAT SINCRONIZADOS</span>
            </span>
          </div>
        </section>

        {/* Right Column: Interactive Chat Console */}
        <section className="flex flex-1 flex-col h-full max-h-[640px] w-full max-w-[620px] rounded-3xl border border-white/10 bg-zinc-950/85 p-5 shadow-2xl backdrop-blur-2xl">
          {/* Header del Chat */}
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-xl bg-yellow-400/10 text-yellow-300 border border-yellow-400/20">
                <Bot className="size-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">{initialConfig.name || "Jarvis"} AI Copilot</h2>
                <p className="text-[11px] text-zinc-400">
                  {initialConfig.business ? `Asistente de ${initialConfig.business} · ` : ""}Habla con tu voz o escribe tus instrucciones
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-400">
              <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>RESPUESTA ULTRA-RÁPIDA</span>
            </div>
          </div>

          {/* Historial de Mensajes */}
          <div
            ref={chatScrollRef}
            className="my-4 flex-1 space-y-3 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-zinc-800 text-xs"
          >
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center py-10 text-center text-zinc-500">
                <Sparkles className="mb-3 size-8 text-yellow-400/50 animate-pulse" />
                <p className="text-sm font-medium text-zinc-300">
                  Jarvis está en línea y escuchando.
                </p>
                <p className="mt-1 max-w-[320px] text-xs text-zinc-500">
                  Presiona el micrófono para hablarle o escribe abajo. Puedes pedirle que configure tu negocio, defina precios, o probar cómo respondería a tus clientes.
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const isUser = msg.role === "user";
                return (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    {!isUser && (
                      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-yellow-400/20 text-yellow-300">
                        <Bot className="size-3.5" />
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 leading-relaxed ${
                        isUser
                          ? "rounded-br-sm bg-gradient-to-r from-yellow-400 to-amber-400 text-zinc-950 font-medium shadow-lg shadow-yellow-400/10"
                          : "rounded-bl-sm border border-white/10 bg-zinc-900/90 text-zinc-200"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      {msg.status === "streaming" && (
                        <span className="ml-1 inline-block h-3.5 w-1 animate-pulse bg-yellow-400" />
                      )}
                    </div>
                    {isUser && (
                      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300">
                        <User className="size-3.5" />
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">
                {error}
              </div>
            )}
          </div>

          {/* Chips de sugerencias rápidas */}
          {messages.length < 3 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => sendMessage(prompt)}
                  disabled={isLoading}
                  className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-zinc-300 transition hover:border-yellow-400/30 hover:bg-yellow-400/10 hover:text-yellow-200 disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {/* Input Bar: Voz (Micrófono) + Campo de Texto + Enviar */}
          <form onSubmit={handleFormSubmit} className="relative flex items-center gap-2 pt-2 border-t border-white/10">
            {speechSupported && (
              <button
                type="button"
                onClick={toggleRecording}
                disabled={isLoading}
                title={isRecording ? "Detener grabación" : "Hablar con Jarvis (Micrófono)"}
                className={`flex size-11 shrink-0 items-center justify-center rounded-2xl border transition ${
                  isRecording
                    ? "border-red-500 bg-red-500/20 text-red-400 animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.4)]"
                    : "border-white/10 bg-zinc-900 text-zinc-400 hover:border-yellow-400/40 hover:text-yellow-300"
                }`}
              >
                {isRecording ? <MicOff className="size-5" /> : <Mic className="size-5" />}
              </button>
            )}

            <input
              value={input}
              onChange={handleInputChange}
              placeholder={
                isRecording
                  ? "Escuchando tu voz..."
                  : state === "PROCESSING"
                  ? "Jarvis pensando..."
                  : state === "SPEAKING"
                  ? "Jarvis respondiendo..."
                  : "Habla con el micrófono o escribe aquí..."
              }
              disabled={isLoading}
              className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-zinc-900/90 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-yellow-400/40 focus:ring-1 focus:ring-yellow-400/30 disabled:opacity-60"
            />

            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-yellow-400 text-zinc-950 transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600 shadow-lg shadow-yellow-400/10"
              title="Enviar mensaje"
            >
              <Send className="size-4" />
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
