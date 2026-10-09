"use client";

import { useState, useEffect, useRef, useCallback, type CSSProperties } from "react";
import Link from "next/link";
import { JarvisLiquidAvatar } from "@/components/jarvis/liquid-avatar";
import styles from "./jarvis-fullscreen.module.css";
import { Mic, MicOff, Volume2, VolumeX, Send, Sliders, RotateCcw, LayoutDashboard, Power, Settings2, Menu, X, MessageSquare, Hand, Square, Paperclip, FileText, Trash2 } from "lucide-react";
import { useJarvisClaps } from "@/hooks/useJarvisClaps";
import { JarvisAvatarProvider, useJarvisAvatar } from "@/context/JarvisAvatarContext";
import { useJarvisAgent } from "@/hooks/useJarvisAgent";
import type { JarvisConfig } from "@/lib/jarvis";
import type { JarvisPersonalization } from "@/lib/jarvis-personalization";
import type { VoiceAvailability } from "@/lib/jarvis-voice";
import { useJarvisVoice } from "@/hooks/useJarvisVoice";
import { useJarvisMicrophone } from "@/hooks/useJarvisMicrophone";
import { jarvisCommand, jarvisCommandPanel } from "@/lib/jarvis-commands";
import { DesktopBubble, useDesktopMode } from "@/components/jarvis/desktop-bubble";
import { JarvisPersonalizationPanel } from "./jarvis-personalization";
import { InstallJarvisButton } from "@/components/pwa/app-provider";
import { DesktopDownloadLink } from "@/components/pwa/desktop-download-link";
import { CreditBalancePanel } from "@/components/dashboard/credit-balance";
import { useJarvisFiles } from "@/hooks/useJarvisFiles";
import { FILE_ACCEPT } from "@/lib/files/types";
import type { FileSummary } from "@/lib/files/types";
import { useOrderProposals } from "@/hooks/useOrderProposals";
import { OrderProposals } from "@/components/jarvis/order-proposals";
import { OperatorTask } from "@/components/jarvis/operator-task";
import { normalizeOperatorActions, parseOperatorNavigation, type OperatorNavigation } from "@/lib/crm-operator";
import { completedOperatorNavigation, desktopPanelFallback } from "@/lib/operator-interface";
import type { ChatMessage } from "@/types/jarvis";

const pageAccent = "#facc15";

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
    <JarvisAvatarProvider initialAccent={pageAccent}>
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
  const desktopMode = useDesktopMode();
  const { state, setAudioLevel, setState } = useJarvisAvatar();
  const [isPoweredOn, setIsPoweredOn] = useState(false);
  const poweredRef = useRef(false);
  const [commandNotice, setCommandNotice] = useState("Estoy aquí. ¿Qué vamos a hacer hoy?");
  const [navigationNotice, setNavigationNotice] = useState<string | null>(null);
  const [isVoiceOutputEnabled, setIsVoiceOutputEnabled] = useState(profile.voice.enabled);
  const [panel, setPanel] = useState<"menu" | "history" | "personalization" | "workspace" | null>(null);
  const [workspace, setWorkspace] = useState<OperatorNavigation | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const clapStopRef = useRef<() => void>(() => {});
  const microphoneStopRef = useRef<() => void>(() => {});
  const microphonePauseRef = useRef<() => void>(() => {});
  const microphoneStartRef = useRef<(wakeOnly: boolean, continuous?: boolean, initiallyPaused?: boolean) => void>(() => {});
  const openCrmWorkspace = useCallback(async (target: OperatorNavigation) => {
    const destination = parseOperatorNavigation(target);
    if (!destination) return;
    setNavigationNotice(null);
    if (window.nexoDesktop) {
      try {
        await window.nexoDesktop.openPanel(destination.href);
        setNavigationNotice(`Abrí ${destination.label}. Sigo aquí contigo.`);
      } catch {
        const fallback = desktopPanelFallback(destination);
        if (!fallback) { setNavigationNotice("No se pudo abrir el panel. Inténtalo de nuevo."); return; }
        try {
          await window.nexoDesktop.openPanel(fallback.href);
          setNavigationNotice(`Abrí ${fallback.label}. Esta versión de la app permite abrir la lista; selecciona allí el registro.`);
        } catch { setNavigationNotice("No se pudo abrir el panel. Inténtalo de nuevo."); }
      }
      return;
    }
    if (destination.href === "/dashboard/jarvis") { setPanel(null); return; }
    microphonePauseRef.current();
    clapStopRef.current();
    setWorkspace(destination);
    setPanel("workspace");
  }, []);
  const [turnStart, setTurnStart] = useState<number | null>(null);
  const onVoiceActivity = useCallback((speaking: boolean) => {
    setState(speaking ? "SPEAKING" : "IDLE");
    setAudioLevel(speaking ? 0.4 : 0);
  }, [setState, setAudioLevel]);
  const { speak, stop: stopVoice, error: voiceError, readyToPlay, resume, pending: voicePending, busy: voiceBusy, speaking: voiceSpeaking, beginStream, pushText, finishStream } = useJarvisVoice(
    { ...profile, voice: { ...profile.voice, enabled: isVoiceOutputEnabled } }, initialConfig.tone, onVoiceActivity, voiceAvailability
  );
  const spokenTurnRef = useRef(false);
  const [fileSession, setFileSession] = useState("");
  const attachments = useJarvisFiles(fileSession, Boolean(userId && fileSession));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const onResponseStart = useCallback(() => {
    spokenTurnRef.current = poweredRef.current && panel === null && isVoiceOutputEnabled;
    if (spokenTurnRef.current) { microphonePauseRef.current(); clapStopRef.current(); beginStream(); }
  }, [panel, isVoiceOutputEnabled, beginStream]);
  const onResponseDelta = useCallback((delta: string) => {
    if (spokenTurnRef.current) pushText(delta);
  }, [pushText]);
  const onResponseComplete = useCallback((message: ChatMessage) => {
    if (spokenTurnRef.current) finishStream(message.content);
    else setState("IDLE");
    const destination = completedOperatorNavigation(message.metadata?.operatorActions);
    if (destination) void openCrmWorkspace(destination);
  }, [finishStream, setState, openCrmWorkspace]);
  const stopSpokenTurn = useCallback(() => { spokenTurnRef.current = false; stopVoice(); }, [stopVoice]);
  const {
    messages,
    sessionId,
    isLoading,
    activity: agentActivity,
    operatorActions,
    error,
    input,
    handleInputChange,
    sendMessage,
    clearChat,
    cancelResponse,
    setInput,
  } = useJarvisAgent({ sessionScope: userId ?? "public", onResponseStart, onResponseDelta, onResponseComplete, onResponseError: stopSpokenTurn, spokenResponse: isVoiceOutputEnabled, onPersonalizationChange: onProfileChange, attachments: attachments.selected, onFilesSubmitted: attachments.submitted });
  const orderProposals = useOrderProposals(sessionId, messages, Boolean(userId));
  useEffect(() => { const sync = () => setFileSession(sessionId); sync(); }, [sessionId]);

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
      ? `Hola, ${profile.displayName}. NEXO activo. ¿Qué hacemos con tu negocio hoy?`
      : "NEXO activo. ¿Qué hacemos con tu negocio hoy?";
    setCommandNotice(greeting);
    speak(greeting);
    microphoneStartRef.current(false, true, true);
  }, [profile.displayName, setState, speak]);

  const powerOff = useCallback(() => {
    clapStopRef.current();
    setPanel(null);
    poweredRef.current = false;
    setIsPoweredOn(false);
    microphoneStopRef.current();
    stopSpokenTurn();
    cancelResponse();
    setState("IDLE");
    setCommandNotice("NEXO en espera. El micrófono está apagado. Tu conversación se conserva.");
  }, [stopSpokenTurn, cancelResponse, setState]);

  const submitInstruction = useCallback((text: string, wakeOnly = false) => {
    const command = jarvisCommand(text);
    if (wakeOnly && command !== "wake") return false;
    if (command === "wake") { setInput(""); powerOn(); return true; }
    if (command === "sleep") { setInput(""); powerOff(); return true; }
    const destination = jarvisCommandPanel(command);
    if (destination) {
      setInput("");
      setTurnStart(null);
      stopSpokenTurn();
      cancelResponse();
      void openCrmWorkspace({ href: destination.path, label: destination.label });
      // The desktop listener remains armed; web pauses it while the CRM is open.
      return !window.nexoDesktop;
    }
    if (!poweredRef.current) {
      setCommandNotice("Primero pulsa Encender NEXO o escribe «NEXO, enciéndete».");
      return false;
    }
    if (isLoading || attachments.pending) return false;
    microphonePauseRef.current();
    stopVoice();
    clapStopRef.current();
    setTurnStart(messages.length);
    setNavigationNotice(null);
    sendMessage(text);
    return true;
  }, [setInput, powerOn, powerOff, stopVoice, stopSpokenTurn, cancelResponse, openCrmWorkspace, isLoading, attachments.pending, messages.length, sendMessage]);

  const microphoneBlocked = isLoading || voiceBusy || attachments.pending || panel !== null;
  const { supported: speechSupported, listening: isRecording, armed: microphoneArmed, error: microphoneError, start: startMicrophone, stop: stopMicrophone, pause: pauseMicrophone } = useJarvisMicrophone(profile.voice.locale, submitInstruction, microphoneBlocked);
  useEffect(() => {
    microphoneStopRef.current = stopMicrophone;
    microphonePauseRef.current = pauseMicrophone;
    microphoneStartRef.current = startMicrophone;
  }, [stopMicrophone, pauseMicrophone, startMicrophone]);
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
    if (microphoneArmed) {
      stopMicrophone();
    } else {
      claps.stop();
      stopSpokenTurn(); cancelResponse();
      startMicrophone(!isPoweredOn, true);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() && !attachments.selected.length) return;
    claps.stop();
    submitInstruction(input);
  };

  const openPanel = (nextPanel: "menu" | "history" | "personalization") => {
    pauseMicrophone(); claps.stop(); stopSpokenTurn(); setPanel(nextPanel);
  };
  const toggleClaps = () => {
    if (claps.listening || claps.pending) { claps.stop(); return; }
    stopMicrophone(); stopVoice(); claps.start();
  };
  const latest = turnStart === null ? undefined : messages.slice(turnStart).reverse().find(message => message.role === "assistant");
  const activity = !isPoweredOn
    ? claps.pending ? "Esperando permiso del micrófono" : claps.listening ? "Da dos aplausos para encender" : isRecording ? "Di «NEXO, enciéndete»" : "Listo cuando tú lo estés"
    : isRecording ? "Te escucho" : voiceSpeaking ? "Hablando contigo" : readyToPlay ? "Pulsa Reproducir voz" : voicePending ? "Preparando mi voz" : isLoading ? agentActivity ?? "Organizando tu solicitud" : "Aquí para ayudarte";
  const exit = () => { claps.stop(); stopMicrophone(); stopSpokenTurn(); cancelResponse(); };
  const avatarState = voiceSpeaking ? "SPEAKING" : isRecording || claps.listening ? "LISTENING" : isLoading || voicePending ? "PROCESSING" : state === "ERROR" ? "ERROR" : "IDLE";
  useEffect(() => {
    const interrupt = (event: KeyboardEvent) => {
      if (event.key === "Escape" && panel === null && (isLoading || voiceBusy)) {
        stopSpokenTurn(); cancelResponse();
      }
    };
    window.addEventListener("keydown", interrupt);
    return () => window.removeEventListener("keydown", interrupt);
  }, [panel, isLoading, voiceBusy, stopSpokenTurn, cancelResponse]);

  const proposals = <OrderProposals compact={desktopMode} state={orderProposals} onDecision={() => { stopMicrophone(); claps.stop(); stopSpokenTurn(); cancelResponse(); }} />;
  const operator = <OperatorTask actions={operatorActions} busy={isLoading} compact={desktopMode} onOpen={destination => { pauseMicrophone(); claps.stop(); stopSpokenTurn(); void openCrmWorkspace(destination); }} />;
  if (desktopMode) return <DesktopBubble hasProposals={orderProposals.proposals.length > 0 || operatorActions.length > 0} operator={operator} proposals={proposals} powered={isPoweredOn} listening={isRecording} armed={microphoneArmed} busy={isLoading || voiceBusy} speaking={voiceSpeaking}
    activity={activity} reply={latest?.content || commandNotice} navigationNotice={navigationNotice} error={error || voiceError || microphoneError} input={input} voice={isVoiceOutputEnabled} readyToPlay={readyToPlay}
    onPower={isPoweredOn ? powerOff : powerOn} onMicrophone={toggleRecording} onVoice={() => { stopSpokenTurn(); setIsVoiceOutputEnabled(value => !value); }}
    onStop={() => { stopSpokenTurn(); cancelResponse(); }} onResume={() => { pauseMicrophone(); resume(); }}
    onInput={setInput} onSubmit={handleFormSubmit} />;

  return (
    <div className={styles.experience} style={{ "--jarvis-accent": pageAccent } as CSSProperties}>
      <div aria-hidden="true" className={styles.constellation} />
      <header className={styles.header}>
        <Link href="/dashboard" onClick={exit} className={styles.crm}><LayoutDashboard size={15} /><span>CRM</span></Link>
        <span className={styles.wordmark}>NEXO<span className={styles.wordmarkDot}>.</span></span>
        <button type="button" onClick={() => openPanel("menu")} aria-label="Abrir menú de NEXO" className={styles.iconButton}><Menu size={20} /></button>
      </header>

      <main className={styles.main}>
        <section className={styles.stage} aria-label="NEXO, tu agente">
          <div className={styles.avatar}>
            <JarvisLiquidAvatar powered={isPoweredOn} state={avatarState} accent={pageAccent} onActivate={powerOn} />
          </div>
          <div className={styles.identity}>
            <h1>{initialConfig.name || "NEXO"}</h1>
            <p className={styles.activity} role="status"><span data-active={isPoweredOn || claps.listening || isRecording} />{activity}</p>
          </div>
          <div className={styles.activation}>
            <button type="button" onClick={isPoweredOn ? powerOff : powerOn} aria-pressed={isPoweredOn} className={styles.powerButton}><Power size={16} />{isPoweredOn ? "En espera" : "Encender NEXO"}</button>
            {!isPoweredOn && claps.supported && <button type="button" onClick={toggleClaps} aria-pressed={claps.listening || claps.pending} className={styles.clapButton}><Hand size={16} />{claps.pending ? "Cancelar permiso" : claps.listening ? "Detener aplausos" : "Activar 2 aplausos"}</button>}
          </div>
          <p className={styles.wakeHint}>{claps.listening ? "Dos aplausos rápidos, separados por medio segundo. Solo se analizan aquí." : !isPoweredOn ? "Un toque, dos aplausos o «NEXO, enciéndete»." : microphoneArmed ? "Escucha continua. Habla cuando termine mi respuesta." : speechSupported ? "Escucha pausada. Puedes activarla o escribir aquí abajo." : "Escribe aquí abajo; este navegador no ofrece reconocimiento de voz."}</p>
        </section>

        <section className={styles.dock} aria-label="Habla o escribe a NEXO" onDragOver={event => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (userId && !isLoading && !attachments.pending) void attachments.upload(event.dataTransfer.files); }}>
          {userId && <CreditBalancePanel compact />}
          {operator}
          {proposals}
          {justPaid && <p className={styles.notice}>Tu plan está activo. Enciende a NEXO para comenzar.</p>}
          {navigationNotice && <p role="status" className={styles.notice}>{navigationNotice}</p>}
          {(error || voiceError || microphoneError || claps.error) && <p role="alert" className={styles.error}>{error || voiceError || microphoneError || claps.error}</p>}
          {attachments.error && <p role="alert" className={styles.error}>{attachments.error}</p>}
          {attachments.pending && <p role="status" className={styles.notice}>Leyendo el archivo; los escaneos pueden tardar unos segundos…</p>}
          {!!attachments.selected.length && <div className={styles.fileList} aria-label="Archivos listos para enviar">{attachments.selected.map(file => <div key={file.id} className={styles.fileItem}><FileText size={16} /><div><a href={`/api/jarvis/files/${file.id}`} download>{file.name}</a><small>{file.status === "needs_ocr" ? "Sin texto legible" : `${file.references} referencias leídas`}</small>{file.warnings.map(warning => <small key={warning}>{warning}</small>)}</div>{(file.status === "needs_ocr" || file.warnings.some(warning => /OCR|texto extraíble/.test(warning))) && <button type="button" disabled={isLoading || attachments.pending} onClick={() => void attachments.reprocess(file.id)} aria-label={`Leer ${file.name} con OCR`}>Leer con OCR</button>}<button type="button" disabled={isLoading || attachments.pending} onClick={() => void attachments.remove(file.id)} aria-label={`Eliminar ${file.name}`}><X size={15} /></button></div>)}</div>}
          {!!attachments.files.length && <details className={styles.conversationFiles}><summary>{attachments.files.length} archivos en esta conversación</summary><div className={styles.fileList}>{attachments.files.map(file => <div key={file.id} className={styles.fileItem}><FileText size={16} /><div><a href={`/api/jarvis/files/${file.id}`} download>{file.name}</a><small>{file.status === "needs_ocr" ? "Sin texto legible" : `${file.references} referencias disponibles`}</small>{file.warnings.map(warning => <small key={warning}>{warning}</small>)}</div>{(file.status === "needs_ocr" || file.warnings.some(warning => /OCR|texto extraíble/.test(warning))) && <button type="button" disabled={isLoading || attachments.pending} onClick={() => void attachments.reprocess(file.id)} aria-label={`Leer ${file.name} con OCR`}>Leer con OCR</button>}<button type="button" disabled={isLoading || attachments.pending} onClick={() => void attachments.remove(file.id)} aria-label={`Eliminar ${file.name}`}><Trash2 size={15} /></button></div>)}</div></details>}
          {!!attachments.library.length && <details className={styles.conversationFiles}><summary>Mis otros archivos ({attachments.library.length})</summary><div className={styles.fileList}>{attachments.library.map(file => <div key={file.id} className={styles.fileItem}><FileText size={16} /><div><a href={`/api/jarvis/files/${file.id}`} download>{file.name}</a><small>{file.sessionId ? "Guardado en otra conversación" : "Subido, pendiente de enviar"}</small>{file.warnings.map(warning => <small key={warning}>{warning}</small>)}</div>{(file.status === "needs_ocr" || file.warnings.some(warning => /OCR|texto extraíble/.test(warning))) && <button type="button" disabled={isLoading || attachments.pending} onClick={() => void attachments.reprocess(file.id)} aria-label={`Leer ${file.name} con OCR`}>Leer con OCR</button>}{!file.sessionId && <button type="button" disabled={isLoading || attachments.pending} onClick={() => attachments.select(file)} aria-label={`Adjuntar ${file.name}`}><Paperclip size={15} /></button>}<button type="button" disabled={isLoading || attachments.pending} onClick={() => void attachments.remove(file.id)} aria-label={`Eliminar ${file.name}`}><Trash2 size={15} /></button></div>)}</div></details>}
          {readyToPlay && <button type="button" onClick={() => { claps.stop(); pauseMicrophone(); resume(); }} className={styles.playVoice}>Reproducir voz</button>}
          <div className={styles.reply}>
            {latest ? <>
              <p className={styles.replyText}>{latest.content || "Estoy preparando tu respuesta…"}</p>
              <button type="button" onClick={() => openPanel("history")} className={styles.readMore}>Ver conversación</button>
            </> : <p className={styles.greeting}>{commandNotice}</p>}
          </div>
          <form onSubmit={handleFormSubmit} className={styles.composer}>
            <input ref={fileInputRef} type="file" multiple accept={FILE_ACCEPT} hidden onChange={event => { if (event.target.files) void attachments.upload(event.target.files); event.target.value = ""; }} />
            <button type="button" disabled={!userId || isLoading || attachments.pending} onClick={() => fileInputRef.current?.click()} aria-label="Adjuntar archivos" title="PDF, fotos PNG/JPG/WebP, Excel, Word o texto · hasta 3 MB" className={styles.micButton}><Paperclip size={19} /></button>
            {speechSupported && <button type="button" onClick={toggleRecording} aria-label={microphoneArmed ? "Pausar escucha continua" : isPoweredOn ? "Activar escucha continua" : "Activar comando de voz"} aria-pressed={microphoneArmed} className={styles.micButton} data-recording={isRecording}>{microphoneArmed ? <MicOff size={20} /> : <Mic size={20} />}</button>}
            <input value={input} onChange={e => { if (isPoweredOn) handleInputChange(e); else setInput(e.target.value); }} aria-label="Mensaje o comando para NEXO" placeholder={isRecording ? "Te escucho…" : "O escribe aquí…"} className={styles.input} autoComplete="off" />
            {(isLoading || voiceBusy) && <button type="button" onClick={() => { stopSpokenTurn(); cancelResponse(); }} aria-label="Detener respuesta y voz" className={styles.sendButton}><Square size={16} /></button>}
            <button type="submit" disabled={(!input.trim() && !attachments.selected.length) || isLoading || attachments.pending} aria-label="Enviar mensaje" className={styles.sendButton}><Send size={18} /></button>
          </form>
          <div className={styles.dockFooter}>
            <span>{isRecording ? "Escucha continua activa" : microphoneArmed ? "Escucha en pausa temporal" : claps.pending ? "Solicitando micrófono" : claps.listening ? "Aplausos: escucha activa" : "Micrófono apagado"}</span>
            <div>
              <button type="button" onClick={() => { claps.stop(); stopSpokenTurn(); setIsVoiceOutputEnabled(value => !value); }} aria-label={isVoiceOutputEnabled ? "Silenciar voz de NEXO" : "Activar voz de NEXO"} aria-pressed={isVoiceOutputEnabled}>{isVoiceOutputEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}</button>
              <button type="button" onClick={() => openPanel("history")} aria-label="Abrir historial"><MessageSquare size={15} /></button>
            </div>
          </div>
        </section>
      </main>

      <dialog ref={dialogRef} className={`${styles.dialog} ${panel === "workspace" ? styles.workspace : ""}`} onCancel={() => setPanel(null)} onClose={() => setPanel(null)} aria-label={panel === "workspace" ? `CRM · ${workspace?.label}` : panel === "history" ? "Conversación con NEXO" : panel === "personalization" ? "Personalización de NEXO" : "Menú de NEXO"}>
        {panel === "workspace" && workspace ? <>
          <div className={styles.dialogHeader}><div><h2>{workspace.label}</h2><p className={styles.workspaceHint}>NEXO conserva tu conversación. Vuelve para darle la siguiente instrucción.</p></div><button type="button" onClick={() => setPanel(null)} className={styles.returnButton}>Volver a NEXO<X size={16}/></button></div>
          <iframe key={workspace.href} src={workspace.href} title={`CRM · ${workspace.label}`} className={styles.workspaceFrame} />
        </> : panel === "personalization" ? <JarvisPersonalizationPanel profile={profile} tone={initialConfig.tone} authenticated={Boolean(userId)} availability={voiceAvailability} onClose={() => setPanel(null)} onSaved={next => { onProfileChange(next); setIsVoiceOutputEnabled(next.voice.enabled); }} /> : <>
          <div className={styles.dialogHeader}><h2>{panel === "history" ? "Tu conversación" : "Tu NEXO"}</h2><button type="button" onClick={() => setPanel(null)} aria-label="Cerrar panel" className={styles.iconButton}><X size={20} /></button></div>
          {panel === "menu" && <div className={styles.menu}>
            {plan && <p className={styles.plan}>Plan {plan}</p>}
            <button type="button" onClick={() => setPanel("personalization")}><Settings2 size={18} />Voz y personalización</button>
            <button type="button" onClick={() => setPanel("history")}><MessageSquare size={18} />Conversación</button>
            <button type="button" onClick={() => { clearChat(); setTurnStart(null); setPanel(null); }}><RotateCcw size={18} />Nueva conversación</button>
            {onSwitchToStudio && <button type="button" onClick={() => { exit(); onSwitchToStudio(); }}><Sliders size={18} />Configuración del agente</button>}
            <Link href="/dashboard" onClick={exit}><LayoutDashboard size={18} />Abrir CRM</Link>
            <Link href="/dashboard/billing" onClick={exit}><LayoutDashboard size={18} />Planes y pagos</Link>
            <DesktopDownloadLink />
            <DesktopDownloadLink platform="mac" />
            <InstallJarvisButton />
            <p className={styles.help}>Para los aplausos, pulsa «Activar 2 aplausos» y permite el micrófono. Deja esta pantalla abierta y da dos aplausos separados por medio segundo. La escucha se apaga al encender, cambiar de pestaña o salir.</p>
            <p className={styles.help}>Al encender NEXO se activa la escucha continua con permiso del micrófono. Espera a que termine de hablar y dile tu siguiente instrucción: no necesitas pulsar el micrófono en cada turno. Puedes pausar la escucha con su botón o decir «NEXO, apágate» o «NEXO, abre el CRM». Mientras hablo, abres un panel o cambias de pestaña, la escucha queda en pausa.</p>
          </div>}
          {panel === "history" && <div ref={chatScrollRef} className={styles.history}>
            {messages.length ? messages.map(message => <article key={message.id} data-role={message.role}><span>{message.role === "user" ? "Tú" : initialConfig.name || "NEXO"}</span><p>{message.content || "Preparando respuesta…"}</p>{message.role === "assistant" && <OperatorTask actions={normalizeOperatorActions(message.metadata?.operatorActions)} busy={isLoading} onOpen={destination => void openCrmWorkspace(destination)} />}{Array.isArray(message.metadata?.attachments) && <div className={styles.fileList}>{(message.metadata.attachments as FileSummary[]).map(file => <a key={file.id} href={`/api/jarvis/files/${file.id}`} download className={styles.fileItem}><FileText size={15} />{file.name}</a>)}</div>}</article>) : <p className={styles.help}>Tu conversación aparecerá aquí cuando envíes tu primera instrucción.</p>}
          </div>}
        </>}
      </dialog>
    </div>
  );
}
