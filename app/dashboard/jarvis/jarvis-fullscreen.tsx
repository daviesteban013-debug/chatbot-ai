"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import styles from "./jarvis-fullscreen.module.css";
import { Mic, MicOff, Volume2, VolumeX, Send, Sliders, RotateCcw, LayoutDashboard, Power, Settings2, Menu, X, MessageSquare, Hand, Square } from "lucide-react";
import { useJarvisClaps } from "@/hooks/useJarvisClaps";
import { JarvisAvatarProvider, useJarvisAvatar } from "@/context/JarvisAvatarContext";
import { useJarvisAgent } from "@/hooks/useJarvisAgent";
import type { JarvisConfig } from "@/lib/jarvis";
import type { JarvisPersonalization } from "@/lib/jarvis-personalization";
import type { VoiceAvailability } from "@/lib/jarvis-voice";
import { useJarvisVoice } from "@/hooks/useJarvisVoice";
import { useJarvisMicrophone } from "@/hooks/useJarvisMicrophone";
import { jarvisCommand } from "@/lib/jarvis-commands";
import { JarvisPersonalizationPanel } from "./jarvis-personalization";
import { InstallJarvisButton } from "@/components/pwa/app-provider";

interface FullscreenProps {
  initialConfig: JarvisConfig;
  profile: JarvisPersonalization;
  userId?: string;
  voiceAvailability: VoiceAvailability;
  onProfileChange: (profile: JarvisPersonalization) => void;
  plan?: string;
  justPaid: boolean;
  onSwitchToStudio?: () => void;
}

export function JarvisFullscreenExperience({
  initialConfig,
  profile,
  userId,
  voiceAvailability,
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
        voiceAvailability={voiceAvailability}
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
  voiceAvailability,
  onProfileChange,
  plan,
  justPaid,
  onSwitchToStudio,
}: FullscreenProps) {
  const router = useRouter();
  const { state, setAudioLevel, setState } = useJarvisAvatar();
  const [isPoweredOn, setIsPoweredOn] = useState(false);
  const poweredRef = useRef(false);
  const [commandNotice, setCommandNotice] = useState("Estoy aquí. ¿Qué vamos a hacer hoy?");
  const [isVoiceOutputEnabled, setIsVoiceOutputEnabled] = useState(profile.voice.enabled);
  const [panel, setPanel] = useState<"menu" | "history" | "personalization" | null>(null);
  const showPersonalization = panel === "personalization";
  const dialogRef = useRef<HTMLDialogElement>(null);
  const clapStopRef = useRef<() => void>(() => {});
  const microphoneStopRef = useRef<() => void>(() => {});
  const [turnStart, setTurnStart] = useState<number | null>(null);
  const onVoiceActivity = useCallback((speaking: boolean) => {
    setState(speaking ? "SPEAKING" : "IDLE");
    setAudioLevel(speaking ? 0.4 : 0);
  }, [setState, setAudioLevel]);
  const { speak, stop: stopVoice, error: voiceError, readyToPlay, resume, pending: voicePending } = useJarvisVoice(
    { ...profile, voice: { ...profile.voice, enabled: isVoiceOutputEnabled } }, initialConfig.tone, onVoiceActivity, voiceAvailability
  );
  const speakRef = useRef(speak);
  useEffect(() => { speakRef.current = speak; }, [speak]);
  const onResponseComplete = useCallback((message: { content: string }) => {
    if (poweredRef.current && !showPersonalization) {
      microphoneStopRef.current(); clapStopRef.current(); speakRef.current(message.content);
    }
  }, [showPersonalization]);
  const {
    messages,
    isLoading,
    error,
    input,
    handleInputChange,
    sendMessage,
    clearChat,
    cancelResponse,
    setInput,
  } = useJarvisAgent({ sessionScope: userId ?? "public", onResponseComplete, onPersonalizationChange: onProfileChange });

  const hasWelcomedRef = useRef(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const powerOn = useCallback(() => {
    clapStopRef.current();
    setPanel(null);
    microphoneStopRef.current();
    poweredRef.current = true;
    setIsPoweredOn(true);
    setState("IDLE");
    const greeting = profile.displayName
      ? `Hola, ${profile.displayName}. Jarvis activo. ¿Qué hacemos con tu negocio hoy?`
      : "Jarvis activo. ¿Qué hacemos con tu negocio hoy?";
    setCommandNotice(greeting);
    speak(greeting);
  }, [profile.displayName, setState, speak]);

  const powerOff = useCallback(() => {
    clapStopRef.current();
    setPanel(null);
    poweredRef.current = false;
    setIsPoweredOn(false);
    microphoneStopRef.current();
    stopVoice();
    cancelResponse();
    setState("IDLE");
    setCommandNotice("Jarvis en espera. El micrófono está apagado. Tu conversación se conserva.");
  }, [stopVoice, cancelResponse, setState]);

  const submitInstruction = useCallback((text: string, wakeOnly = false) => {
    const command = jarvisCommand(text);
    if (wakeOnly && command !== "wake") return false;
    if (command === "wake") { setInput(""); powerOn(); return true; }
    if (command === "sleep") { setInput(""); powerOff(); return true; }
    if (command === "crm") {
      clapStopRef.current();
      microphoneStopRef.current();
      stopVoice();
      cancelResponse();
      setInput("");
      router.push("/dashboard");
      return true;
    }
    if (!poweredRef.current) {
      setCommandNotice("Primero pulsa Encender Jarvis o escribe «Jarvis, enciéndete».");
      return false;
    }
    if (isLoading) return false;
    stopVoice();
    clapStopRef.current();
    setTurnStart(messages.length);
    sendMessage(text);
    return true;
  }, [setInput, powerOn, powerOff, stopVoice, cancelResponse, router, isLoading, messages.length, sendMessage]);

  const { supported: speechSupported, listening: isRecording, error: microphoneError, start: startMicrophone, stop: stopMicrophone } = useJarvisMicrophone(profile.voice.locale, submitInstruction);
  useEffect(() => { microphoneStopRef.current = stopMicrophone; }, [stopMicrophone]);
  const claps = useJarvisClaps(powerOn);
  useEffect(() => { clapStopRef.current = claps.stop; }, [claps.stop]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (panel && dialog) {
      if (!dialog.open) dialog.showModal();
      dialog.scrollTop = 0;
      dialog.querySelector<HTMLButtonElement>("button")?.focus();
    }
    else if (!panel && dialog?.open) dialog.close();
  }, [panel]);

  // Auto-scroll del historial de mensajes
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, panel]);

  // Mensaje de bienvenida inicial de Jarvis al cargar tras el pago
  useEffect(() => {
    if (isPoweredOn && justPaid && !hasWelcomedRef.current && messages.length === 0) {
      hasWelcomedRef.current = true;
      const welcomePrompt = `¡Hola! Acabo de activar mi suscripción a ${plan ? `Plan ${plan}` : "tu plan"}. Actívate e inicia la configuración de mi negocio.`;
      sendMessage(welcomePrompt);
    }
  }, [isPoweredOn, justPaid, messages.length, plan, sendMessage]);

  // Alternar micrófono
  const toggleRecording = () => {
    if (isRecording) {
      stopMicrophone();
    } else {
      claps.stop();
      stopVoice();
      startMicrophone(!isPoweredOn);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    stopMicrophone();
    claps.stop();
    submitInstruction(input);
  };

  const openPanel = (nextPanel: "menu" | "history" | "personalization") => {
    stopMicrophone(); claps.stop(); stopVoice(); setPanel(nextPanel);
  };
  const toggleClaps = () => {
    if (claps.listening || claps.pending) { claps.stop(); return; }
    stopMicrophone(); stopVoice(); claps.start();
  };
  const latest = turnStart === null ? undefined : messages.slice(turnStart).reverse().find(message => message.role === "assistant");
  const activity = !isPoweredOn
    ? claps.pending ? "Esperando permiso del micrófono" : claps.listening ? "Da dos aplausos para encender" : isRecording ? "Di «Jarvis, enciéndete»" : "Listo cuando tú lo estés"
    : isRecording ? "Te escucho" : isLoading ? "Pensando contigo" : voicePending ? "Preparando mi voz" : state === "SPEAKING" ? "Hablando contigo" : "Aquí para ayudarte";
  const exit = () => { claps.stop(); stopMicrophone(); stopVoice(); cancelResponse(); };

  return (
    <div className={styles.experience}>
      <div aria-hidden="true" className={styles.constellation} />
      <header className={styles.header}>
        <Link href="/dashboard" onClick={exit} className={styles.crm}><LayoutDashboard size={15} /><span>CRM</span></Link>
        <span className={styles.wordmark}>JARVIS<span className={styles.wordmarkDot}>.</span></span>
        <button type="button" onClick={() => openPanel("menu")} aria-label="Abrir menú de Jarvis" className={styles.iconButton}><Menu size={20} /></button>
      </header>

      <main className={styles.main}>
        <section className={styles.stage} aria-label="Jarvis, tu agente">
          <div className={styles.avatar} data-powered={isPoweredOn} data-state={isRecording ? "LISTENING" : state}>
            <div aria-hidden="true" className={styles.aura} />
            <Image src="/jarvis/avatar.webp" width={960} height={901} sizes="(max-width: 600px) 82vw, 480px" loading="eager" alt="Jarvis, un robot con casco metálico y visor de estrellas violeta" className={styles.helmet} />
          </div>
          <div className={styles.identity}>
            <h1>{initialConfig.name || "Jarvis"}</h1>
            <p className={styles.activity} role="status"><span data-active={isPoweredOn || claps.listening || isRecording} />{activity}</p>
          </div>
          <div className={styles.activation}>
            <button type="button" onClick={isPoweredOn ? powerOff : powerOn} aria-pressed={isPoweredOn} className={styles.powerButton}><Power size={16} />{isPoweredOn ? "En espera" : "Encender Jarvis"}</button>
            {!isPoweredOn && claps.supported && <button type="button" onClick={toggleClaps} aria-pressed={claps.listening || claps.pending} className={styles.clapButton}><Hand size={16} />{claps.pending ? "Cancelar permiso" : claps.listening ? "Detener aplausos" : "Activar 2 aplausos"}</button>}
          </div>
          <p className={styles.wakeHint}>{claps.listening ? "Dos aplausos rápidos, separados por medio segundo. Solo se analizan aquí." : !isPoweredOn ? "Un toque, dos aplausos o «Jarvis, enciéndete»." : "Tu negocio, a una conversación de distancia."}</p>
        </section>

        <section className={styles.dock} aria-label="Habla o escribe a Jarvis">
          {justPaid && <p className={styles.notice}>Tu plan está activo. Enciende a Jarvis para comenzar.</p>}
          {(error || voiceError || microphoneError || claps.error) && <p role="alert" className={styles.error}>{error || voiceError || microphoneError || claps.error}</p>}
          {readyToPlay && <button type="button" onClick={() => { claps.stop(); stopMicrophone(); resume(); }} className={styles.playVoice}>Reproducir voz</button>}
          <div className={styles.reply}>
            {latest ? <>
              <p className={styles.replyText}>{latest.content || "Estoy preparando tu respuesta…"}</p>
              <button type="button" onClick={() => openPanel("history")} className={styles.readMore}>Ver conversación</button>
            </> : <p className={styles.greeting}>{commandNotice}</p>}
          </div>
          <form onSubmit={handleFormSubmit} className={styles.composer}>
            {speechSupported && <button type="button" onClick={toggleRecording} aria-label={isRecording ? "Detener micrófono" : isPoweredOn ? "Hablar con Jarvis" : "Activar comando de voz"} aria-pressed={isRecording} className={styles.micButton} data-recording={isRecording}>{isRecording ? <MicOff size={20} /> : <Mic size={20} />}</button>}
            <input value={input} onChange={e => { if (isPoweredOn) handleInputChange(e); else setInput(e.target.value); }} aria-label="Mensaje o comando para Jarvis" placeholder={isRecording ? "Te escucho…" : "O escribe aquí…"} className={styles.input} autoComplete="off" />
            {isLoading ? <button type="button" onClick={() => { cancelResponse(); stopVoice(); }} aria-label="Detener respuesta" className={styles.sendButton}><Square size={16} /></button> : <button type="submit" disabled={!input.trim()} aria-label="Enviar mensaje" className={styles.sendButton}><Send size={18} /></button>}
          </form>
          <div className={styles.dockFooter}>
            <span>{isRecording ? "Micrófono activo" : claps.pending ? "Solicitando micrófono" : claps.listening ? "Aplausos: escucha activa" : "Micrófono apagado"}</span>
            <div>
              <button type="button" onClick={() => { claps.stop(); stopMicrophone(); stopVoice(); setIsVoiceOutputEnabled(value => !value); }} aria-label={isVoiceOutputEnabled ? "Silenciar voz de Jarvis" : "Activar voz de Jarvis"} aria-pressed={isVoiceOutputEnabled}>{isVoiceOutputEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}</button>
              <button type="button" onClick={() => openPanel("history")} aria-label="Abrir historial"><MessageSquare size={15} /></button>
            </div>
          </div>
        </section>
      </main>

      <dialog ref={dialogRef} className={styles.dialog} onCancel={() => setPanel(null)} onClose={() => setPanel(null)} aria-label={panel === "history" ? "Conversación con Jarvis" : panel === "personalization" ? "Personalización de Jarvis" : "Menú de Jarvis"}>
        {panel === "personalization" ? <JarvisPersonalizationPanel profile={profile} tone={initialConfig.tone} authenticated={Boolean(userId)} availability={voiceAvailability} onClose={() => setPanel(null)} onSaved={next => { onProfileChange(next); setIsVoiceOutputEnabled(next.voice.enabled); }} /> : <>
          <div className={styles.dialogHeader}><h2>{panel === "history" ? "Tu conversación" : "Tu Jarvis"}</h2><button type="button" onClick={() => setPanel(null)} aria-label="Cerrar panel" className={styles.iconButton}><X size={20} /></button></div>
          {panel === "menu" && <div className={styles.menu}>
            {plan && <p className={styles.plan}>Plan {plan}</p>}
            <button type="button" onClick={() => setPanel("personalization")}><Settings2 size={18} />Voz y personalización</button>
            <button type="button" onClick={() => setPanel("history")}><MessageSquare size={18} />Conversación</button>
            <button type="button" onClick={() => { clearChat(); setTurnStart(null); setPanel(null); }}><RotateCcw size={18} />Nueva conversación</button>
            {onSwitchToStudio && <button type="button" onClick={() => { exit(); onSwitchToStudio(); }}><Sliders size={18} />Configuración del agente</button>}
            <Link href="/dashboard" onClick={exit}><LayoutDashboard size={18} />Abrir CRM</Link>
            <InstallJarvisButton />
            <p className={styles.help}>Para los aplausos, pulsa «Activar 2 aplausos» y permite el micrófono. Deja esta pantalla abierta y da dos aplausos separados por medio segundo. La escucha se apaga al encender, cambiar de pestaña o salir.</p>
            <p className={styles.help}>También puedes usar el micrófono y decir «Jarvis, enciéndete», «Jarvis, apágate» o «Jarvis, abre el CRM».</p>
          </div>}
          {panel === "history" && <div ref={chatScrollRef} className={styles.history}>
            {messages.length ? messages.map(message => <article key={message.id} data-role={message.role}><span>{message.role === "user" ? "Tú" : initialConfig.name || "Jarvis"}</span><p>{message.content || "Preparando respuesta…"}</p></article>) : <p className={styles.help}>Tu conversación aparecerá aquí cuando envíes tu primera instrucción.</p>}
          </div>}
        </>}
      </dialog>
    </div>
  );
}
