"use client";

import { useState, useEffect, useRef, useCallback, useMemo, type CSSProperties } from "react";
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
import { AppInstallOptions, InstallJarvisButton } from "@/components/pwa/app-provider";
import { DesktopDownloadLink } from "@/components/pwa/desktop-download-link";
import { CreditBalancePanel } from "@/components/dashboard/credit-balance";
import { TaskAlerts } from "@/components/dashboard/task-alerts";
import { useJarvisFiles } from "@/hooks/useJarvisFiles";
import { FILE_ACCEPT } from "@/lib/files/types";
import type { FileSummary } from "@/lib/files/types";
import { useOrderProposals } from "@/hooks/useOrderProposals";
import { OrderProposals } from "@/components/jarvis/order-proposals";
import { useCatalogProposals } from "@/hooks/useCatalogProposals";
import { CatalogProposals } from "@/components/jarvis/catalog-proposals";
import { useDailyBriefing } from "@/hooks/useDailyBriefing";
import { DailyBriefing } from "@/components/jarvis/daily-briefing";
import { useNexoActivity } from "@/hooks/useNexoActivity";
import { DotField } from "@/components/brand/dot-field";
import { useProactive, type Announcement } from "@/hooks/useProactive";
import { AutomationSuggestion, ProactiveAlerts, ProactiveInvite, ProactiveSettingsPanel, RoutineSummary } from "@/components/jarvis/proactive";
import { useAutomationSuggestions } from "@/hooks/useAutomationSuggestions";
import { useJobs } from "@/hooks/useJobs";
import { CopiedNotice, JobCards, WatchFolderSettings, type BubbleAttachments } from "@/components/jarvis/jobs";
import { SUGGESTION_TEXTS } from "@/lib/suggestions";
import { NexoActivity } from "@/components/dashboard/nexo-activity";
import { RichText } from "@/components/jarvis/rich-text";
import { buildBriefing, type Briefing } from "@/lib/briefing";
import { OperatorTask } from "@/components/jarvis/operator-task";
import { normalizeOperatorActions, parseOperatorNavigation, type OperatorNavigation } from "@/lib/crm-operator";
import { completedOperatorNavigation, desktopPanelFallback } from "@/lib/operator-interface";
import { ArrivalCurtain } from "@/components/jarvis/arrival";
import { arrivalGreeting, takeArrival, type Arrival } from "@/lib/arrival";
import type { ChatMessage } from "@/types/jarvis";

const pageAccent = "#facc15";

interface FullscreenProps {
  initialConfig: JarvisConfig;
  profile: JarvisPersonalization;
  userId?: string;
  voiceAvailability: VoiceAvailability;
  onProfileChange: (profile: JarvisPersonalization) => void;
  plan?: string;
  onSwitchToStudio?: () => void;
}

export function JarvisFullscreenExperience({
  initialConfig,
  profile,
  userId,
  voiceAvailability,
  onProfileChange,
  plan,
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
  onSwitchToStudio,
}: FullscreenProps) {
  const desktopMode = useDesktopMode();
  const { state, setAudioLevel, setState } = useJarvisAvatar();
  const [isPoweredOn, setIsPoweredOn] = useState(false);
  // Straight from the welcome portal: a curtain with the agent's name, then it greets the owner by name.
  const [arrival, setArrival] = useState<Arrival | null>(null);
  useEffect(() => {
    if (desktopMode) return;
    const timer = setTimeout(() => { const note = takeArrival(sessionStorage); if (note) setArrival(note); }, 0);
    return () => clearTimeout(timer);
  }, [desktopMode]);
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
          setNavigationNotice(destination.href === "/dashboard/workspace" ? "Abrí el CRM. Selecciona Memoria y tareas en el menú para revisar la propuesta." : `Abrí ${fallback.label}. Esta versión de la app permite abrir la lista; selecciona allí el registro.`);
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
  const catalogProposals = useCatalogProposals(sessionId, messages, Boolean(userId));
  const dailyBriefing = useDailyBriefing(Boolean(userId));
  const nexoActivity = useNexoActivity(Boolean(userId) && !desktopMode, { limit: 5, version: String(messages.filter(message => message.status === "completed").length) });
  const refreshBriefing = dailyBriefing.refresh;
  const briefing = useMemo(() => dailyBriefing.data ? buildBriefing(dailyBriefing.data, { name: profile.displayName || undefined }) : null, [dailyBriefing.data, profile.displayName]);
  const [briefingHidden, setBriefingHidden] = useState(false);
  // In the bubble the briefing card appears when it matters (first power-on of the day, the
  // morning routine or «resumen»); the rest of the time "Hoy en tu negocio" shows the key figures.
  const [bubbleBriefing, setBubbleBriefing] = useState(false);
  const briefingRef = useRef<Briefing | null>(null);
  useEffect(() => { briefingRef.current = briefing; }, [briefing]);
  useEffect(() => { const sync = () => setFileSession(sessionId); sync(); }, [sessionId]);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLDivElement>(null);
  const voiceOnRef = useRef(isVoiceOutputEnabled);
  const busyRef = useRef(false);
  useEffect(() => { voiceOnRef.current = isVoiceOutputEnabled; }, [isVoiceOutputEnabled]);
  // What Zorax noticed on its own: system notification when you are elsewhere, voice if you asked for it.
  const announce = useCallback(({ alerts, routine, quiet, settings }: Announcement) => {
    if (routine?.id === "morning") { setBriefingHidden(false); setBubbleBriefing(true); }
    const lines = routine ? [routine.headline] : alerts.map(alert => alert.text);
    if (!lines.length || quiet) return;
    const title = routine ? routine.title : alerts.length === 1 ? "Zorax" : `Zorax · ${alerts.length} avisos nuevos`;
    const href = routine ? (routine.id === "weekly" ? "/dashboard" : undefined) : alerts.length === 1 ? alerts[0].href : undefined;
    if (settings.system && window.nexoDesktop?.notify && !document.hasFocus())
      void window.nexoDesktop.notify({ title, body: lines.join("\n").slice(0, 240), ...(href ? { href } : {}) }).catch(() => {});
    if (settings.voice && poweredRef.current && voiceOnRef.current && !busyRef.current)
      speak(routine ? routine.headline : alerts.length === 1 ? alerts[0].text : `Tienes ${alerts.length} avisos nuevos. ${alerts[0].text}.`);
  }, [speak]);
  const proactive = useProactive(desktopMode && Boolean(userId), userId, announce, profile.displayName || undefined);
  const suggestions = useAutomationSuggestions(desktopMode && Boolean(userId));
  const suggestion = suggestions.suggestions[0] ?? null;
  const proactiveRefresh = proactive.refresh;
  const jobs = useJobs(desktopMode && Boolean(userId), { sessionId: fileSession || undefined, onFinished: proactiveRefresh });
  const [copiedJob, setCopiedJob] = useState(false);
  const attachmentsRef = useRef(attachments);
  const jobsRef = useRef(jobs);
  useEffect(() => { attachmentsRef.current = attachments; jobsRef.current = jobs; });
  // Desktop 0.2.5+: a file saved in Descargas/Zorax arrives here and, by subfolder or preference, starts its job.
  useEffect(() => {
    const bridge = window.nexoDesktop;
    if (!desktopMode || !userId || !bridge?.onFileReady || !bridge.readWatchedFile) return;
    const readWatched = bridge.readWatchedFile;
    return bridge.onFileReady(event => { void (async () => {
      try {
        const file = await readWatched(event.token);
        const bytes = Uint8Array.from(atob(file.base64), char => char.charCodeAt(0));
        const uploaded = await attachmentsRef.current.upload([new File([bytes], file.name, { type: file.mime })]);
        if (!uploaded.length) return;
        const preference = bridge.getWatch ? await bridge.getWatch().catch(() => null) : null;
        const kind = file.folder === "catalogo" ? "catalog_import" : file.folder === "stock" ? "catalog_update" : preference && preference.action !== "ask" ? preference.action : null;
        if (!kind) return;
        const job = await jobsRef.current.start({ kind, file_ids: uploaded.map(item => item.id), note: `Archivo de la carpeta vigilada: ${file.name}` });
        if (job) attachmentsRef.current.submitted();
      } catch { /* The hooks show their own errors. */ }
    })(); });
  }, [desktopMode, userId]);
  // Options come only from code (the arrival from the portal); clicks and claps call it bare.
  const powerOn = useCallback((options?: { greeting?: string; microphone?: boolean }) => {
    const custom = options && typeof options === "object" && typeof options.greeting === "string" ? options.greeting : null;
    const microphone = !(options && typeof options === "object" && options.microphone === false);
    clapStopRef.current();
    setPanel(null);
    microphoneStopRef.current();
    poweredRef.current = true;
    setIsPoweredOn(true);
    setState("IDLE");
    const who = initialConfig.name?.trim() || "Zorax";
    let greeting = custom ?? (profile.displayName
      ? `Hola, ${profile.displayName}. ${who} en línea. ¿Qué hacemos con tu negocio hoy?`
      : `${who} en línea. ¿Qué hacemos con tu negocio hoy?`);
    // The first time each day, Zorax opens with the daily briefing instead of a generic greeting.
    const today = briefingRef.current;
    if (today && !custom) {
      let spoken = false;
      const key = `nexo-briefing-spoken:${userId ?? "public"}:${today.date}`;
      try { spoken = localStorage.getItem(key) === "1"; localStorage.setItem(key, "1"); } catch { /* Private mode: speak it. */ }
      if (!spoken) { greeting = today.headline; setBubbleBriefing(true); }
    }
    setCommandNotice(greeting);
    speak(greeting);
    if (microphone) microphoneStartRef.current(false, true, true);
  }, [profile.displayName, initialConfig.name, setState, speak, userId]);

  const powerOff = useCallback(() => {
    clapStopRef.current();
    setPanel(null);
    poweredRef.current = false;
    setIsPoweredOn(false);
    microphoneStopRef.current();
    stopSpokenTurn();
    cancelResponse();
    setState("IDLE");
    setCommandNotice("Zorax en espera. El micrófono está apagado. Tu conversación se conserva.");
  }, [stopSpokenTurn, cancelResponse, setState]);

  const submitInstruction = useCallback((text: string, wakeOnly = false) => {
    const command = jarvisCommand(text, initialConfig.name);
    if (wakeOnly && command !== "wake") return false;
    if (command === "wake") { setInput(""); powerOn(); return true; }
    if (command === "sleep") { setInput(""); powerOff(); return true; }
    if (command === "briefing") {
      // Answered from database facts: instant and without spending Zorax messages.
      setInput("");
      setTurnStart(null);
      setBriefingHidden(false);
      setBubbleBriefing(true);
      void refreshBriefing();
      const text = briefingRef.current?.headline ?? (userId ? "Estoy preparando tu resumen del día; aparecerá aquí en unos segundos." : "Inicia sesión con tu negocio para ver tu resumen del día.");
      setCommandNotice(text);
      if (poweredRef.current) { stopSpokenTurn(); cancelResponse(); speak(text); }
      return true;
    }
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
      setCommandNotice("Primero pulsa Encender Zorax o escribe «Zorax, enciéndete».");
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
  }, [setInput, powerOn, powerOff, stopVoice, stopSpokenTurn, cancelResponse, openCrmWorkspace, isLoading, attachments.pending, messages.length, sendMessage, refreshBriefing, speak, userId, initialConfig.name]);

  const microphoneBlocked = isLoading || voiceBusy || attachments.pending || panel !== null;
  useEffect(() => { busyRef.current = isLoading || voiceBusy; }, [isLoading, voiceBusy]);
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
  const question = turnStart === null ? undefined : messages.slice(turnStart).find(message => message.role === "user")?.content;
  const activity = !isPoweredOn
    ? claps.pending ? "Esperando permiso del micrófono" : claps.listening ? "Da dos aplausos para encender" : isRecording ? "Di «Zorax, enciéndete»" : "Listo cuando tú lo estés"
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

  const decisionStarted = () => { stopMicrophone(); claps.stop(); stopSpokenTurn(); cancelResponse(); };
  const openFromCard = (href: string) => { const destination = parseOperatorNavigation(href); if (!destination) return; pauseMicrophone(); claps.stop(); stopSpokenTurn(); void openCrmWorkspace(destination); };
  const briefingCard = briefing && !briefingHidden && (!desktopMode || bubbleBriefing) ? <DailyBriefing briefing={briefing} compact={desktopMode} onDismiss={() => setBriefingHidden(true)}
    onOpen={href => { const destination = parseOperatorNavigation(href); if (!destination) return; pauseMicrophone(); claps.stop(); stopSpokenTurn(); void openCrmWorkspace(destination); }} /> : null;
  const proposals = <>
    {briefingCard}
    <OrderProposals compact={desktopMode} state={orderProposals} onDecision={decisionStarted} />
    <CatalogProposals compact={desktopMode} state={catalogProposals} onDecision={decisionStarted} />
  </>;
  const operator = <OperatorTask actions={operatorActions} busy={isLoading} compact={desktopMode} onOpen={destination => { pauseMicrophone(); claps.stop(); stopSpokenTurn(); void openCrmWorkspace(destination); }} />;
  const invite = proactive.ready && !proactive.settings.asked;
  const nightly = proactive.routine && proactive.routine.id !== "morning" ? proactive.routine : null;
  const proactiveCards = <>
    {invite && <ProactiveInvite onEnable={() => proactive.update({ alerts: true })} onLater={() => proactive.update({})} />}
    {suggestion && <AutomationSuggestion suggestion={suggestion} busy={suggestions.busy === suggestion.key}
      onEnable={() => void suggestions.decide(suggestion.key, "enable", SUGGESTION_TEXTS[suggestion.key].enabled)} onLater={() => void suggestions.decide(suggestion.key, "dismiss")} />}
    <ProactiveAlerts alerts={proactive.alerts} onOpen={openFromCard} onDismiss={proactive.dismiss} onClear={proactive.clear} />
    {nightly && <RoutineSummary card={nightly} onOpen={openFromCard} onClose={proactive.closeRoutine} />}
  </>;
  const facts = dailyBriefing.data;
  // Files in the bubble: dropped, pasted or picked up from the watched folder; each can start a job with one click.
  const startFileJob = async (kind: "catalog_import" | "catalog_update", ids: string[]) => { const job = await jobs.start({ kind, file_ids: ids }); if (job) attachments.submitted(); };
  const uploadReady = Boolean(userId) && !isLoading && !attachments.pending;
  const sheetOnly = attachments.selected.length === 1 && ["xlsx", "csv"].includes(attachments.selected[0].name.toLowerCase().split(".").pop() ?? "");
  const pasteFromDesktop = async () => {
    const bridge = window.nexoDesktop;
    if (!bridge?.readClipboard || !uploadReady) return;
    try {
      const content = await bridge.readClipboard();
      if (content.kind === "image") await attachments.upload([new File([Uint8Array.from(atob(content.png), char => char.charCodeAt(0))], `captura-${Date.now()}.png`, { type: "image/png" })]);
      else if (content.kind === "text" && content.text.length > 2000) await attachments.upload([new File([content.text], "texto-pegado.txt", { type: "text/plain" })]);
      else if (content.kind === "text" && content.text.trim()) setInput(input ? `${input} ${content.text}` : content.text);
    } catch { /* The bubble shows the hook's error. */ }
  };
  const bubbleAttachments: BubbleAttachments = {
    selected: attachments.selected, pending: attachments.pending, error: attachments.error ?? jobs.error, canPaste: typeof window !== "undefined" && Boolean(window.nexoDesktop?.readClipboard),
    quickActions: [
      { id: "import", label: "Importar al catálogo", onPick: () => void startFileJob("catalog_import", attachments.selected.map(file => file.id)) },
      ...(sheetOnly ? [{ id: "stock", label: "Actualizar stock o precios", onPick: () => void startFileJob("catalog_update", attachments.selected.map(file => file.id)) }] : []),
      { id: "read", label: "Leer y resumir", onPick: () => { claps.stop(); submitInstruction("Lee este archivo y resume lo importante."); } },
    ],
    onDrop: files => { if (uploadReady) void attachments.upload(files); },
    onRemove: id => void attachments.remove(id),
    onPaste: event => {
      const files = Array.from(event.clipboardData.files);
      if (files.length) {
        event.preventDefault();
        if (uploadReady) void attachments.upload(files.map((file, index) => !file.name || /^image\.png$/i.test(file.name) ? new File([file], `pegado-${Date.now()}-${index}.${file.type.split("/")[1] || "png"}`, { type: file.type }) : file));
        return;
      }
      const text = event.clipboardData.getData("text/plain");
      if (text.length > 2000 && uploadReady) { event.preventDefault(); void attachments.upload([new File([text], "texto-pegado.txt", { type: "text/plain" })]); }
    },
    onPasteButton: () => void pasteFromDesktop(),
  };
  const copyReport = async (id: string) => {
    try {
      const { result } = await jobs.detail(id);
      if (typeof result?.csv === "string") { await navigator.clipboard.writeText(result.csv); setCopiedJob(true); setTimeout(() => setCopiedJob(false), 1600); }
    } catch { /* The hook keeps the error. */ }
  };
  const jobCards = <><CopiedNotice visible={copiedJob} /><JobCards jobs={jobs.jobs.slice(0, 5)} busy={jobs.busy} onOpen={openFromCard} onCancel={id => void jobs.cancel(id)} onApply={id => void jobs.apply(id)} onCopy={id => void copyReport(id)} onRetry={job => void jobs.start({ kind: job.kind })} /></>;
  if (desktopMode) return <DesktopBubble hasProposals={orderProposals.proposals.length > 0 || catalogProposals.proposals.length > 0 || Boolean(briefingCard) || operatorActions.length > 0 || proactive.alerts.length > 0 || Boolean(nightly) || invite || Boolean(suggestion) || jobs.jobs.length > 0}
    alerts={proactiveCards} unread={proactive.alerts.length} latestAlert={proactive.alerts[0]?.text ?? null}
    settingsPanel={<><ProactiveSettingsPanel settings={proactive.settings} update={proactive.update} systemAvailable={typeof window !== "undefined" && Boolean(window.nexoDesktop?.notify)} /><WatchFolderSettings /></>}
    today={facts ? { sales: facts.today.sales, orders: facts.today.orders, unpaid: facts.unpaid.count, unpaidTotal: facts.unpaid.total, waiting: facts.handoffs.count } : null}
    operator={operator} jobs={jobCards} attachments={bubbleAttachments} proposals={proposals} powered={isPoweredOn} listening={isRecording} armed={microphoneArmed} busy={isLoading || voiceBusy} speaking={voiceSpeaking}
    activity={activity} reply={latest?.content || commandNotice} question={latest ? question ?? null : null} navigationNotice={navigationNotice} error={error || voiceError || microphoneError} input={input} voice={isVoiceOutputEnabled} readyToPlay={readyToPlay}
    onPower={isPoweredOn ? powerOff : powerOn} onMicrophone={toggleRecording} onVoice={() => { stopSpokenTurn(); setIsVoiceOutputEnabled(value => !value); }}
    onStop={() => { stopSpokenTurn(); cancelResponse(); }} onResume={() => { pauseMicrophone(); resume(); }}
    onInput={setInput} onSubmit={handleFormSubmit} />;

  return (
    <div className={styles.experience} style={{ "--jarvis-accent": pageAccent } as CSSProperties}>
      {arrival && <ArrivalCurtain arrival={arrival} onLift={() => powerOn({ greeting: arrivalGreeting(arrival), microphone: false })} onDone={() => setArrival(null)} />}
      <DotField className={styles.field} accent={pageAccent} originRef={avatarRef}
        pulse={avatarState === "SPEAKING" ? "speaking" : avatarState === "LISTENING" ? "listening" : avatarState === "PROCESSING" ? "processing" : null} />
      <header className={styles.header}>
        <Link href="/dashboard" onClick={exit} className={styles.crm}><LayoutDashboard size={15} /><span>CRM</span></Link>
        <span className={styles.wordmark}>Zorax<span className={styles.wordmarkDot}>.</span></span>
        <button type="button" onClick={() => openPanel("menu")} aria-label="Abrir menú de Zorax" className={styles.iconButton}><Menu size={20} /></button>
      </header>

      <main className={styles.main}>
        {userId && <TaskAlerts onOpen={() => { pauseMicrophone(); void openCrmWorkspace({ href: "/dashboard/workspace", label: "Memoria y tareas" }); }}/>}
        <section className={styles.stage} aria-label="Zorax, tu agente">
          <div ref={avatarRef} className={styles.avatar}>
            <JarvisLiquidAvatar powered={isPoweredOn} state={avatarState} accent={pageAccent} onActivate={powerOn} />
          </div>
          <div className={styles.identity}>
            <h1>{initialConfig.name || "Zorax"}</h1>
            <p className={styles.activity} role="status"><span data-active={isPoweredOn || claps.listening || isRecording} />{activity}</p>
          </div>
          <div className={styles.activation}>
            <button type="button" onClick={() => { if (isPoweredOn) powerOff(); else powerOn(); }} aria-pressed={isPoweredOn} className={styles.powerButton}><Power size={16} />{isPoweredOn ? "En espera" : "Encender Zorax"}</button>
            {!isPoweredOn && claps.supported && <button type="button" onClick={toggleClaps} aria-pressed={claps.listening || claps.pending} className={styles.clapButton}><Hand size={16} />{claps.pending ? "Cancelar permiso" : claps.listening ? "Detener aplausos" : "Activar 2 aplausos"}</button>}
          </div>
          <p className={styles.wakeHint}>{claps.listening ? "Dos aplausos rápidos, separados por medio segundo. Solo se analizan aquí." : !isPoweredOn ? "Un toque, dos aplausos o «Zorax, enciéndete»." : microphoneArmed ? "Escucha continua. Habla cuando termine mi respuesta." : speechSupported ? "Escucha pausada. Puedes activarla o escribir aquí abajo." : "Escribe aquí abajo; este navegador no ofrece reconocimiento de voz."}</p>
        </section>

        <section className={styles.dock} aria-label="Habla o escribe a Zorax" onDragOver={event => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (userId && !isLoading && !attachments.pending) void attachments.upload(event.dataTransfer.files); }}>
          {userId && <CreditBalancePanel compact />}
          {operator}
          {proposals}
          <NexoActivity tone="dark" state={nexoActivity} onOpen={href => { const destination = parseOperatorNavigation(href); if (!destination) return; pauseMicrophone(); claps.stop(); stopSpokenTurn(); void openCrmWorkspace(destination); }} />
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
            <input value={input} onChange={e => { if (isPoweredOn) handleInputChange(e); else setInput(e.target.value); }} aria-label="Mensaje o comando para Zorax" placeholder={isRecording ? "Te escucho…" : "O escribe aquí…"} className={styles.input} autoComplete="off" />
            {(isLoading || voiceBusy) && <button type="button" onClick={() => { stopSpokenTurn(); cancelResponse(); }} aria-label="Detener respuesta y voz" className={styles.sendButton}><Square size={16} /></button>}
            <button type="submit" disabled={(!input.trim() && !attachments.selected.length) || isLoading || attachments.pending} aria-label="Enviar mensaje" className={styles.sendButton}><Send size={18} /></button>
          </form>
          <div className={styles.dockFooter}>
            <span>{isRecording ? "Escucha continua activa" : microphoneArmed ? "Escucha en pausa temporal" : claps.pending ? "Solicitando micrófono" : claps.listening ? "Aplausos: escucha activa" : "Micrófono apagado"}</span>
            <div>
              <button type="button" onClick={() => { claps.stop(); stopSpokenTurn(); setIsVoiceOutputEnabled(value => !value); }} aria-label={isVoiceOutputEnabled ? "Silenciar voz de Zorax" : "Activar voz de Zorax"} aria-pressed={isVoiceOutputEnabled}>{isVoiceOutputEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}</button>
              <button type="button" onClick={() => openPanel("history")} aria-label="Abrir historial"><MessageSquare size={15} /></button>
            </div>
          </div>
        </section>
      </main>

      <dialog ref={dialogRef} className={`${styles.dialog} ${panel === "workspace" ? styles.workspace : ""}`} onCancel={() => setPanel(null)} onClose={() => setPanel(null)} aria-label={panel === "workspace" ? `CRM · ${workspace?.label}` : panel === "history" ? "Conversación con Zorax" : panel === "personalization" ? "Personalización de Zorax" : "Menú de Zorax"}>
        {panel === "workspace" && workspace ? <>
          <div className={styles.dialogHeader}><div><h2>{workspace.label}</h2><p className={styles.workspaceHint}>Zorax conserva tu conversación. Vuelve para darle la siguiente instrucción.</p></div><button type="button" onClick={() => setPanel(null)} className={styles.returnButton}>Volver a Zorax<X size={16}/></button></div>
          <iframe key={workspace.href} src={workspace.href} title={`CRM · ${workspace.label}`} className={styles.workspaceFrame} />
        </> : panel === "personalization" ? <JarvisPersonalizationPanel profile={profile} tone={initialConfig.tone} authenticated={Boolean(userId)} availability={voiceAvailability} onClose={() => setPanel(null)} onSaved={next => { onProfileChange(next); setIsVoiceOutputEnabled(next.voice.enabled); }} /> : <>
          <div className={styles.dialogHeader}><h2>{panel === "history" ? "Tu conversación" : "Tu Zorax"}</h2><button type="button" onClick={() => setPanel(null)} aria-label="Cerrar panel" className={styles.iconButton}><X size={20} /></button></div>
          {panel === "menu" && <div className={styles.menu}>
            {plan && <p className={styles.plan}>Plan {plan}</p>}
            <button type="button" onClick={() => setPanel("personalization")}><Settings2 size={18} />Voz y personalización</button>
            <button type="button" onClick={() => setPanel("history")}><MessageSquare size={18} />Conversación</button>
            <button type="button" onClick={() => { clearChat(); setTurnStart(null); setPanel(null); }}><RotateCcw size={18} />Nueva conversación</button>
            {onSwitchToStudio && <button type="button" onClick={() => { exit(); onSwitchToStudio(); }}><Sliders size={18} />Configuración del agente</button>}
            <Link href="/dashboard" onClick={exit}><LayoutDashboard size={18} />Abrir CRM</Link>
            <Link href="/dashboard/billing" onClick={exit}><LayoutDashboard size={18} />Planes y pagos</Link>
            <AppInstallOptions>
              <DesktopDownloadLink />
              <DesktopDownloadLink platform="mac" />
              <InstallJarvisButton />
            </AppInstallOptions>
            <p className={styles.help}>Para los aplausos, pulsa «Activar 2 aplausos» y permite el micrófono. Deja esta pantalla abierta y da dos aplausos separados por medio segundo. La escucha se apaga al encender, cambiar de pestaña o salir.</p>
            <p className={styles.help}>Al encender Zorax se activa la escucha continua con permiso del micrófono. Espera a que termine de hablar y dile tu siguiente instrucción: no necesitas pulsar el micrófono en cada turno. Puedes pausar la escucha con su botón o decir «Zorax, apágate» o «Zorax, abre el CRM». Mientras hablo, abres un panel o cambias de pestaña, la escucha queda en pausa.</p>
          </div>}
          {panel === "history" && <div ref={chatScrollRef} className={styles.history}>
            {messages.length ? messages.map(message => <article key={message.id} data-role={message.role}><span>{message.role === "user" ? "Tú" : initialConfig.name || "Zorax"}</span>{message.role === "assistant" && message.content ? <RichText source={message.content} className={styles.richMessage} onOpen={href => { const destination = parseOperatorNavigation(href); if (destination) void openCrmWorkspace(destination); }} /> : <p>{message.content || "Preparando respuesta…"}</p>}{message.role === "assistant" && <OperatorTask actions={normalizeOperatorActions(message.metadata?.operatorActions)} busy={isLoading} onOpen={destination => void openCrmWorkspace(destination)} />}{Array.isArray(message.metadata?.attachments) && <div className={styles.fileList}>{(message.metadata.attachments as FileSummary[]).map(file => <a key={file.id} href={`/api/jarvis/files/${file.id}`} download className={styles.fileItem}><FileText size={15} />{file.name}</a>)}</div>}</article>) : <p className={styles.help}>Tu conversación aparecerá aquí cuando envíes tu primera instrucción.</p>}
          </div>}
        </>}
      </dialog>
    </div>
  );
}
