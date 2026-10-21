"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ExternalLink, Loader2, Maximize2, Mic, MicOff, Minimize2, RefreshCw, Volume2, VolumeX } from "lucide-react";
import { DotField, type FieldPulse } from "@/components/brand/dot-field";
import { NexoMark } from "@/components/brand/nexo-mark";
import { NexoOrb, type OrbState } from "@/components/jarvis/nexo-orb";
import { useJarvisMicrophone } from "@/hooks/useJarvisMicrophone";
import { useJarvisVoice } from "@/hooks/useJarvisVoice";
import { rememberArrival } from "@/lib/arrival";
import { personalizationDefaults, type JarvisPersonalization } from "@/lib/jarvis-personalization";
import type { VoiceAvailability } from "@/lib/jarvis-voice";
import {
  ACCENT_NAMES, PORTAL_SCENES, PORTAL_TOTAL, TONE_LABELS, TONE_PREVIEWS, afterLine, describeAnswer, fillLine, parseSpokenAnswer, portalDefaults, portalSubmission, portalSummary,
  typingSchedule, validateAnswer, type PortalAnswers, type PortalScene, type SpokenResult,
} from "@/lib/onboarding-portal";
import { formatCOP } from "@/lib/utils";
import { interpretPortalAnswer, savePortal } from "./actions";
import styles from "./portal.module.css";

type Phase = "boot" | "typing" | "asking" | "after" | "saving" | "done" | "leaving";
/** The opening: dark screen, the agent peeks over the bottom edge, looks around, takes its place, the HUD lights up. */
type Boot = "dark" | "peek" | "look" | "rise" | "ready";
type Peek = { top: number; left: number; size: number; transition: string };
type Entry = { id: number; who: "nexo" | "you"; text: string; at: string };
type Telemetry = { store: string | null; plan: string; products: number; whatsapp: boolean; email: string };
const stamp = () => new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const PLAN_LABELS: Record<string, string> = { pilot: "PILOTO", trial: "PRUEBA", starter: "STARTER", pro: "PRO", business: "BUSINESS" };
/** How long the exit sequence plays before the CRM loads behind it. */
const LEAVE_MS = 1800;

/** A few synthesized notes (no files): the portal waking up, a line ready for you, an answer taken, done, the jump to the CRM. */
function createSound() {
  let context: AudioContext | null = null;
  const audio = () => {
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      context ??= new Ctor();
      if (context.state === "suspended") void context.resume();
      return context;
    } catch { return null; }
  };
  const tone = (frequency: number, at: number, duration: number, gain: number, type: OscillatorType = "sine") => {
    const ctx = audio(); if (!ctx) return;
    const oscillator = ctx.createOscillator(), volume = ctx.createGain(), start = ctx.currentTime + at;
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, start);
    volume.gain.setValueAtTime(0.0001, start); volume.gain.exponentialRampToValueAtTime(gain, start + 0.03); volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(volume).connect(ctx.destination); oscillator.start(start); oscillator.stop(start + duration + 0.05);
  };
  return {
    boot: () => { tone(196, 0, 1.2, 0.05); tone(392, 0.14, 1, 0.04); tone(587, 0.3, 1.4, 0.035); },
    ready: () => tone(880, 0, 0.2, 0.025, "triangle"),
    confirm: () => { tone(523, 0, 0.14, 0.03); tone(784, 0.09, 0.2, 0.03); },
    done: () => { tone(392, 0, 0.6, 0.04); tone(523, 0.16, 0.6, 0.04); tone(659, 0.32, 0.9, 0.04); tone(784, 0.48, 1.4, 0.035); },
    warp: () => {
      const ctx = audio(); if (!ctx) return;
      const oscillator = ctx.createOscillator(), volume = ctx.createGain(), start = ctx.currentTime;
      oscillator.type = "sine"; oscillator.frequency.setValueAtTime(150, start); oscillator.frequency.exponentialRampToValueAtTime(980, start + 1.1);
      volume.gain.setValueAtTime(0.0001, start); volume.gain.exponentialRampToValueAtTime(0.05, start + 0.3); volume.gain.exponentialRampToValueAtTime(0.0001, start + 1.5);
      oscillator.connect(volume).connect(ctx.destination); oscillator.start(start); oscillator.stop(start + 1.6);
      tone(523, 0.95, 1.2, 0.03); tone(784, 1.05, 1.4, 0.03);
    },
  };
}

/**
 * The welcome portal. Zorax wakes up on a full screen, speaks and types one question per scene,
 * and the whole screen takes the answers at once: its name in the brand, the chosen color
 * everywhere, the voice out loud. Side panels show real telemetry and the live transcript;
 * they fade when Zorax is configured, and the agent jumps through the screen into the CRM.
 */
export function WelcomePortal({ initial, replay, telemetry, voiceAvailability, voiceProfile, fixture }: {
  initial: Partial<PortalAnswers>; replay: boolean; telemetry: Telemetry; voiceAvailability: VoiceAvailability; voiceProfile?: JarvisPersonalization["voice"];
  /** Local preview only (app/dev/portal): start at a later scene and finish without saving. */
  fixture?: { startAt?: number; dryRun?: boolean };
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("boot");
  const [boot, setBoot] = useState<Boot>("dark");
  const [peek, setPeek] = useState<Peek | null>(null);
  const [gaze, setGaze] = useState({ x: 0, y: -5 });
  const [scene, setScene] = useState(Math.min(Math.max(fixture?.startAt ?? 0, 0), PORTAL_TOTAL - 1));
  const [answers, setAnswers] = useState<PortalAnswers>({ ...portalDefaults, ...initial });
  const [typing, setTyping] = useState({ id: 0, text: "", count: 0 });
  const [log, setLog] = useState<Entry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(!(initial.voice ?? true));
  const [draft, setDraft] = useState("");
  const [slider, setSlider] = useState(initial.maxDiscountPct ?? portalDefaults.maxDiscountPct);
  const [clock, setClock] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [burst, setBurst] = useState(0);
  // Voice answers: what Zorax heard, whether it is still working it out, and the owner's switch to typing.
  const [heard, setHeard] = useState<{ text: string; status: "thinking" | "ok" | "retry" } | null>(null);
  const [interpreting, setInterpreting] = useState(false);
  const [pending, setPending] = useState(false);
  const [voiceAnswers, setVoiceAnswers] = useState(true);
  const retries = useRef(0);
  const micUsed = useRef(false);
  // The desktop bubble is too small for the portal: it points to the main window instead.
  const [surface, setSurface] = useState<"web" | "crm" | "bubble">("web");
  const sound = useRef<ReturnType<typeof createSound> | null>(null);
  const orbRef = useRef<HTMLDivElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const answersRef = useRef(answers);
  const afterTyping = useRef<(() => void) | null>(null);
  const lock = useRef(false);
  const ids = useRef(0);
  useEffect(() => { answersRef.current = answers; }, [answers]);

  // The welcome always speaks with the neural voice when the account has it; the device voice is
  // never swapped in mid-portal, so one failed request only costs that line, not the rest.
  const profile = useMemo(() => ({ ...personalizationDefaults, displayName: answers.displayName,
    voice: { ...personalizationDefaults.voice, ...(voiceProfile ?? {}), engine: "auto" as const, enabled: !muted } }), [answers.displayName, muted, voiceProfile]);
  const voice = useJarvisVoice(profile, answers.tone, undefined, voiceAvailability);
  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    const ready = setTimeout(() => {
      setSurface(window.nexoDesktop ? (window.nexoDesktop.surface === "crm" ? "crm" : "bubble") : "web");
      setCanFullscreen(Boolean(document.fullscreenEnabled) && !window.nexoDesktop); sync();
    }, 0);
    document.addEventListener("fullscreenchange", sync);
    return () => { clearTimeout(ready); document.removeEventListener("fullscreenchange", sync); };
  }, []);
  const toggleFullscreen = () => { void (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {}); };
  const mutedRef = useRef(muted);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  const play = (name: keyof ReturnType<typeof createSound>) => { if (!mutedRef.current) sound.current?.[name](); };
  const speakRef = useRef(voice.speak);
  useEffect(() => { speakRef.current = voice.speak; }, [voice.speak]);
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  // A line that could not be voiced (rate limit, hiccup) is retried once a moment later, with the same voice.
  const retried = useRef(0);
  useEffect(() => {
    if (!voice.error || !typing.text || retried.current === typing.id || !["typing", "after", "done"].includes(phaseRef.current)) return;
    retried.current = typing.id;
    const text = typing.text;
    const again = setTimeout(() => { if (!mutedRef.current) speakRef.current(text); }, 2400);
    return () => clearTimeout(again);
  }, [voice.error, typing.id, typing.text]);
  // Tone previews wait for the choice to settle, so clicking through the cards is one request, not four.
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewTone = (tone: string) => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => { if (!mutedRef.current) speakRef.current(TONE_PREVIEWS[tone] ?? "", true); }, 350);
  };
  useEffect(() => () => { if (previewTimer.current) clearTimeout(previewTimer.current); }, []);
  const say = useCallback((text: string, then?: () => void) => {
    const id = ++ids.current, at = stamp();
    afterTyping.current = then ?? null;
    setTyping({ id, text, count: 0 });
    setLog(list => [...list, { id, who: "nexo", text, at }]);
    if (!mutedRef.current) speakRef.current(text);
  }, []);

  // The opening, timed in one place. A travelling copy of the orb rises from below the screen,
  // peeks, glances left and right, then flies to where the real orb sits; the HUD follows.
  useEffect(() => {
    if (window.nexoDesktop && window.nexoDesktop.surface !== "crm") return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { const now = setTimeout(() => setBoot("ready"), 0); return () => clearTimeout(now); }
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, run: () => void) => timers.push(setTimeout(run, ms));
    const size = () => orbRef.current?.getBoundingClientRect().width || 170;
    const centered = (width: number) => window.innerWidth / 2 - width / 2;
    at(0, () => { const width = size(); setPeek({ top: window.innerHeight + 24, left: centered(width), size: width, transition: "none" }); });
    at(350, () => { const width = size(); setPeek({ top: window.innerHeight - width * 0.56, left: centered(width), size: width, transition: "top .9s cubic-bezier(.22, 1, .36, 1)" }); setBoot("peek"); });
    at(1500, () => { setBoot("look"); setGaze({ x: -9, y: -4 }); });
    at(1950, () => setGaze({ x: 9, y: -4 }));
    at(2400, () => setGaze({ x: 0, y: -2 }));
    at(2750, () => {
      const box = orbRef.current?.getBoundingClientRect();
      const width = box?.width || size();
      setPeek({ top: box ? box.top : window.innerHeight / 2 - width / 2, left: box ? box.left : centered(width), size: width, transition: "top .85s cubic-bezier(.34, 1.25, .5, 1), left .85s cubic-bezier(.34, 1.25, .5, 1)" });
      setGaze({ x: 0, y: 0 }); setBoot("rise");
    });
    at(3650, () => { setBoot("ready"); setPeek(null); });
    return () => timers.forEach(clearTimeout);
  }, []);

  // Typewriter: quick characters, a breath after each sentence; everything at once with reduced motion.
  useEffect(() => {
    if (!typing.text || typing.count >= typing.text.length) return;
    const { id, text } = typing;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delays = typingSchedule(text);
    const start = performance.now();
    let frame = 0;
    const finish = () => { const then = afterTyping.current; afterTyping.current = null; setTimeout(() => then?.(), 380); };
    const step = () => {
      const elapsed = performance.now() - start;
      let count = 0;
      while (count < delays.length && delays[count] <= elapsed) count++;
      if (reduced) count = text.length;
      setTyping(current => current.id === id ? { ...current, count } : current);
      if (count < text.length) frame = requestAnimationFrame(step); else finish();
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  // Only a new line restarts the animation; progress updates must not.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typing.id]);
  useEffect(() => { const el = feedRef.current; if (el) el.scrollTop = el.scrollHeight; }, [log]);
  useEffect(() => {
    const format = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    const tick = () => setClock(format.format(new Date()));
    const first = setTimeout(tick, 0);
    const interval = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(interval); };
  }, []);

  const current: PortalScene = PORTAL_SCENES[Math.min(scene, PORTAL_TOTAL - 1)];
  const startScene = useCallback((index: number, known: PortalAnswers) => {
    setScene(index); setDraft(""); setError(null); setHeard(null); retries.current = 0; setPhase("typing");
    say(fillLine(PORTAL_SCENES[index].say, known), () => { setPhase("asking"); lock.current = false; if (!mutedRef.current) sound.current?.ready(); });
  }, [say]);
  const begin = () => {
    if (phase !== "boot" || boot !== "ready") return;
    // The click is the gesture browsers need before audio and fullscreen are allowed.
    sound.current ??= createSound();
    play("boot");
    setBurst(value => value + 1);
    if (canFullscreen && !document.fullscreenElement) void document.documentElement.requestFullscreen().catch(() => {});
    startScene(scene, answersRef.current);
  };

  const dryRun = Boolean(fixture?.dryRun);
  const finishPortal = useCallback(async (known: PortalAnswers) => {
    setPhase("saving");
    const parsed = portalSubmission.safeParse(known);
    const result = !parsed.success ? { ok: false as const, error: "Falta una respuesta. Revisa los pasos anteriores." } : dryRun ? { ok: true as const } : await savePortal(parsed.data);
    if (!result.ok) { setError(result.error); setPhase("asking"); lock.current = false; return; }
    setPhase("done");
    setBurst(value => value + 1);
    if (!mutedRef.current) sound.current?.done();
    say(`Listo${known.displayName ? `, ${known.displayName}` : ""}. ${known.agentName} en línea. Tu tienda ya tiene agente.`);
  }, [say, dryRun]);

  const submit = useCallback((value: string | number | boolean) => {
    if (phase !== "asking" || lock.current) return;
    const problem = validateAnswer(current, value);
    if (problem) { setError(problem); return; }
    lock.current = true; setError(null);
    const clean = typeof value === "string" ? value.trim() : value;
    const next = { ...answersRef.current, [current.key]: clean } as PortalAnswers;
    answersRef.current = next; setAnswers(next);
    if (current.key === "voice") setMuted(!clean);
    play("confirm");
    const id = ++ids.current, at = stamp(), said = describeAnswer(current.key, clean);
    setLog(list => [...list, { id, who: "you", text: said, at }]);
    setPhase("after");
    const last = scene === PORTAL_TOTAL - 1;
    say(afterLine(current, next, clean), () => { if (last) void finishPortal(next); else startScene(scene + 1, next); });
  }, [phase, current, scene, say, startScene, finishPortal]);

  // ---------- The conversation: Zorax asks out loud and the owner answers out loud ----------
  // The microphone opens as soon as a question has been spoken, pauses while Zorax talks, and
  // what it hears is read locally (choices, amounts, yes/no) or by the model (names, free text).
  const currentRef = useRef(current); useEffect(() => { currentRef.current = current; }, [current]);
  const sceneRef = useRef(scene); useEffect(() => { sceneRef.current = scene; }, [scene]);
  const submitRef = useRef(submit); useEffect(() => { submitRef.current = submit; }, [submit]);
  const handleSpoken = useCallback(async (text: string) => {
    if (phaseRef.current !== "asking" || lock.current) return;
    const asked = currentRef.current, index = sceneRef.current;
    setHeard({ text, status: "thinking" }); setInterpreting(true);
    let result: SpokenResult = parseSpokenAnswer(asked, text);
    if (["agentName", "displayName", "businessName", "businessType", "city", "rules"].includes(asked.key)) {
      try {
        const known = answersRef.current;
        result = await interpretPortalAnswer({ key: asked.key, transcript: text, answers: { agentName: known.agentName, displayName: known.displayName, businessName: known.businessName } });
      } catch { /* The local reading stands. */ }
    }
    setInterpreting(false);
    // The scene moved on while we were thinking (a typed answer went in): drop it.
    if (phaseRef.current !== "asking" || sceneRef.current !== index || lock.current) return;
    if (!result.ok) {
      retries.current += 1;
      setHeard({ text, status: "retry" });
      say(retries.current >= 2 ? `${result.reply} Si prefieres, escríbelo abajo.` : result.reply);
      return;
    }
    retries.current = 0;
    const value = result.value;
    setHeard({ text, status: "ok" }); setPending(true);
    if (asked.kind === "choice") setAnswers(known => ({ ...known, tone: String(value) }));
    else if (asked.kind === "swatches") { setAnswers(known => ({ ...known, accent: String(value) })); setBurst(count => count + 1); }
    else if (asked.kind === "slider") setSlider(Number(value));
    else if (asked.kind === "money") setDraft(Number(value) === 0 ? "" : String(value));
    else if (typeof value === "string") setDraft(value);
    // A beat so the person sees what was understood, then it goes in exactly like a typed answer.
    setTimeout(() => { setPending(false); if (phaseRef.current === "asking" && sceneRef.current === index) submitRef.current(value); }, 700);
  }, [say]);
  const handleSpokenRef = useRef(handleSpoken); useEffect(() => { handleSpokenRef.current = handleSpoken; }, [handleSpoken]);
  const onTranscript = useCallback((text: string, wakeOnly: boolean) => { if (wakeOnly) return false; void handleSpokenRef.current(text); return true; }, []);
  const micBlocked = phase !== "asking" || voice.busy || interpreting || pending || !voiceAnswers;
  const mic = useJarvisMicrophone(profile.voice.locale, onTranscript, micBlocked);
  const micStarted = useRef(false);
  const startMic = mic.start;
  useEffect(() => {
    if (phase !== "asking" || !voiceAnswers || micStarted.current || !mic.supported || voice.busy) return;
    micStarted.current = true;
    startMic(false, true, false);
  }, [phase, voiceAnswers, mic.supported, voice.busy, startMic]);
  useEffect(() => { if (mic.listening) micUsed.current = true; }, [mic.listening]);

  // The exit: the agent grows through the screen, its color floods everything, its name stays
  // for a beat, and the CRM opens behind with a note so it can greet the owner on arrival.
  const leave = () => {
    if (phase !== "done") return;
    voice.stop(); play("warp");
    mic.stop();
    rememberArrival(sessionStorage, { agent: answers.agentName.trim() || "Zorax", you: answers.displayName, accent: answers.accent, mic: micUsed.current });
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    setBurst(value => value + 1);
    setPhase("leaving");
    setTimeout(() => { router.replace("/dashboard/jarvis"); router.refresh(); }, LEAVE_MS);
  };

  const finished = phase === "done" || phase === "leaving";
  const pulse: FieldPulse = phase === "leaving" || voice.speaking ? "speaking" : mic.listening ? "listening" : phase === "typing" || phase === "after" || phase === "saving" || interpreting ? "processing" : null;
  const orbState: OrbState = phase === "boot" ? (boot === "ready" ? "idle" : "off") : voice.speaking || phase === "typing" || phase === "after" ? "speaking" : phase === "saving" || interpreting ? "thinking" : mic.listening ? "listening" : "idle";
  const agent = answers.agentName.trim() || "Zorax";
  const typedText = typing.text.slice(0, typing.count);
  const submitForm = (event: FormEvent) => { event.preventDefault(); submit(current.kind === "money" ? Number(draft.replace(/[^\d]/g, "")) : draft); };

  if (surface === "bubble") return <main className={styles.guard} style={{ "--nexo-color": answers.accent } as CSSProperties}>
    <NexoMark className={styles.mark} />
    <h1 className={styles.title}>Conóceme en la ventana principal.</h1>
    <p className={styles.lead}>Mi bienvenida necesita toda la pantalla. Ábrela en la ventana del CRM y vuelve aquí cuando terminemos.</p>
    <div className={styles.row}>
      <button type="button" className={styles.primary} onClick={() => void window.nexoDesktop?.openPanel("/dashboard").catch(() => {})}>Abrir ventana principal<ExternalLink size={15} /></button>
      <button type="button" className={styles.secondary} onClick={() => window.location.replace("/dashboard/jarvis")}><RefreshCw size={15} />Ya terminé</button>
    </div>
  </main>;

  return <main className={styles.portal} data-phase={phase} data-boot={phase === "boot" ? boot : undefined} style={{ "--nexo-color": answers.accent } as CSSProperties}>
    <DotField className={styles.field} accent={answers.accent} pulse={pulse} originRef={orbRef} burstKey={burst} />
    {peek && <div className={styles.peeker} aria-hidden="true" style={{ top: peek.top, left: peek.left, "--orb-size": `${peek.size}px`, transition: peek.transition } as CSSProperties}>
      <NexoOrb state="idle" look={gaze} pulseKey="peek" errorKey={null} />
    </div>}
    <header className={styles.top}>
      <div className={styles.brand}><NexoMark className={styles.mark} /><div><strong key={agent} data-enter>{agent.toUpperCase()} <span>{"// AGENTE"}</span></strong><small><i data-on={phase !== "boot"} />{phase === "boot" ? "EN ESPERA" : "EN LÍNEA"}</small></div></div>
      <div className={styles.topRight}>
        {voice.readyToPlay && <button type="button" className={styles.ghost} onClick={() => voice.resume()}><Volume2 size={14} /><span>Reproducir voz</span></button>}
        {canFullscreen && <button type="button" className={styles.ghost} onClick={toggleFullscreen} aria-pressed={fullscreen} title={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}>{fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}<span>{fullscreen ? "Salir" : "Pantalla completa"}</span></button>}
        <button type="button" className={styles.ghost} onClick={() => { setMuted(value => !value); voice.stop(); }} aria-pressed={!muted}>{muted ? <VolumeX size={14} /> : <Volume2 size={14} />}<span>{muted ? "Activar voz" : "Silenciar"}</span></button>
        {phase !== "boot" && !finished && <span className={styles.counter}>{String(scene + 1).padStart(2, "0")} / {PORTAL_TOTAL}</span>}
      </div>
    </header>

    <aside className={styles.left} data-hidden={finished}>
      <section className={styles.panel}>
        <p className={styles.panelHead}><i />SISTEMA<span>NODO · CO</span></p>
        <dl className={styles.rows}>
          <div><dt>Hora Colombia</dt><dd className={styles.clock}>{clock || "--:--:--"}</dd></div>
          <div><dt>Cuenta</dt><dd title={telemetry.email}>{telemetry.email || "—"}</dd></div>
          <div><dt>Sesión</dt><dd data-tone="good">Cifrada</dd></div>
        </dl>
      </section>
      <section className={styles.panel}>
        <p className={styles.panelHead}><i />TU TIENDA<span>{PLAN_LABELS[telemetry.plan] ?? telemetry.plan.toUpperCase()}</span></p>
        <dl className={styles.rows}>
          <div><dt>Nombre</dt><dd>{answers.businessName.trim() || telemetry.store || "—"}</dd></div>
          <div><dt>Catálogo</dt><dd>{telemetry.products} {telemetry.products === 1 ? "producto" : "productos"}</dd></div>
          <div><dt>WhatsApp</dt><dd data-tone={telemetry.whatsapp ? "good" : "warn"}>{telemetry.whatsapp ? "Conectado" : "Pendiente"}</dd></div>
          <div><dt>Agente</dt><dd>{answers.agentName.trim() || "—"} · {TONE_LABELS[answers.tone]}</dd></div>
        </dl>
      </section>
    </aside>

    <section className={styles.stage} aria-live="polite"><div className={styles.stageInner}>
      {phase === "boot" ? <div className={styles.boot}>
        <div ref={orbRef} className={styles.orb}><NexoOrb state={orbState} look={{ x: 0, y: 0 }} pulseKey="boot" errorKey={null} /></div>
        <p className={styles.eyebrow}>{replay ? "VOLVER A EMPEZAR" : "PORTAL DE BIENVENIDA"}</p>
        <h1 className={styles.title}>{replay ? "Conozcámonos otra vez." : "Tu tienda está a punto de tener agente."}</h1>
        <p className={styles.lead}>Dos minutos. Zorax se presenta, te pregunta cómo quieres que sea y queda listo para vender contigo.</p>
        <button type="button" className={styles.primary} onClick={begin} disabled={boot !== "ready"}>Iniciar<ArrowRight size={15} /></button>
        <small className={styles.note}>Con sonido si tu navegador lo permite; puedes silenciarlo arriba a la derecha.</small>
      </div> : <>
        <div ref={orbRef} className={styles.orb} data-done={finished}><NexoOrb state={orbState} look={{ x: 0, y: 0 }} pulseKey={`${scene}:${phase}`} errorKey={error} /></div>
        <p className={styles.eyebrow}>{finished ? "CONFIGURACIÓN COMPLETA" : phase === "saving" ? "GUARDANDO" : current.title.toUpperCase()}</p>
        <h1 className={styles.line}>{typedText}<span className={styles.caret} data-on={typing.count < typing.text.length} aria-hidden="true" /></h1>
        {phase === "saving" && <p className={styles.saving}><Loader2 size={14} className={styles.spin} />Dejando todo listo…</p>}
        {phase === "asking" && <div className={styles.answer} key={current.key} data-enter>
          <div className={styles.listen} data-state={mic.listening ? "on" : interpreting || pending ? "thinking" : "off"} role="status">
            <i aria-hidden="true" />
            <span>{mic.listening ? "Te escucho" : interpreting ? "Entendiendo…" : pending ? "Anotado" : !voiceAnswers ? "Escribe tu respuesta" : mic.error ? "Sin micrófono; escribe abajo" : !mic.supported ? "Responde escribiendo abajo" : voice.busy ? "Un momento…" : "Responde con tu voz"}</span>
            {heard && <q>{heard.text}</q>}
            {mic.supported && <button type="button" onClick={() => setVoiceAnswers(value => !value)} aria-pressed={voiceAnswers} aria-label={voiceAnswers ? "Responder escribiendo" : "Responder con la voz"} title={voiceAnswers ? "Prefiero escribir" : "Responder con la voz"}>{voiceAnswers ? <Mic size={13} /> : <MicOff size={13} />}</button>}
          </div>
          <Answer scene={current} answers={answers} draft={draft} setDraft={setDraft} slider={slider} setSlider={setSlider}
            onPick={(key, value) => { setAnswers(known => ({ ...known, [key]: value })); if (key === "accent") setBurst(count => count + 1); if (key === "tone") previewTone(String(value)); }}
            onSubmit={submitForm} submit={submit} onVoiceSample={() => { setMuted(false); voice.speak("Así sueno. Me vas a oír cuando me actives.", true); }} />
        </div>}
        {finished && <div className={styles.summary} data-enter>
          <dl>{portalSummary(portalSubmission.parse(answers)).map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
          <button type="button" className={styles.primary} onClick={leave} disabled={phase === "leaving"}>Entrar a mi CRM<ArrowRight size={15} /></button>
          <small className={styles.note}>Puedes cambiar cualquier cosa luego en Personalización y en Agente y autonomía.</small>
        </div>}
        {error && <p role="alert" className={styles.error} data-enter>{error}</p>}
      </>}
    </div></section>

    <aside className={styles.right} data-hidden={finished}>
      <section className={`${styles.panel} ${styles.feed}`}>
        <p className={styles.panelHead}><i />TRANSMISIÓN<span>EN VIVO</span></p>
        <div ref={feedRef} className={styles.feedBody}>
          {log.map(entry => <article key={entry.id} data-who={entry.who}><header><span>{entry.who === "nexo" ? agent.toUpperCase() : "TÚ"}</span><time>{entry.at}</time></header><p>{entry.text}</p></article>)}
          {!log.length && <p className={styles.feedEmpty}>Esperando la primera transmisión…</p>}
        </div>
        <p className={styles.feedFoot}>— canal cifrado —</p>
      </section>
    </aside>

    <footer className={styles.bottom}>
      <ol className={styles.progress} aria-label="Avance">{PORTAL_SCENES.map((item, index) => <li key={item.key} data-done={index < scene || finished} data-current={index === scene && !finished && phase !== "boot"} />)}</ol>
      <span>{finished ? "Listo para vender" : phase === "boot" ? "Portal de bienvenida" : current.title}</span>
    </footer>

    {phase === "leaving" && <div className={styles.flood} aria-hidden="true"><div className={styles.exitCard}><span>{agent.toUpperCase()}</span><small>ENTRANDO A TU CRM</small></div></div>}
  </main>;
}

function Answer({ scene, answers, draft, setDraft, slider, setSlider, onPick, onSubmit, submit, onVoiceSample }: {
  scene: PortalScene; answers: PortalAnswers; draft: string; setDraft(value: string): void; slider: number; setSlider(value: number): void;
  onPick(key: PortalScene["key"], value: string): void; onSubmit(event: FormEvent): void; submit(value: string | number | boolean): void; onVoiceSample(): void;
}) {
  const field = <input className={styles.input} autoFocus value={draft} onChange={event => setDraft(event.target.value)} placeholder={scene.placeholder} maxLength={scene.key === "agentName" ? 24 : scene.key === "displayName" ? 40 : 120} aria-label={scene.title} autoComplete="off" />;
  const go = <button type="submit" className={styles.primary} disabled={!draft.trim()}>Continuar<ArrowRight size={15} /></button>;
  switch (scene.kind) {
    case "text": case "chips-text":
      return <form onSubmit={onSubmit} className={styles.form}>
        <div className={styles.row}>{field}{go}</div>
        {scene.chips && <div className={styles.chips}>{scene.chips.map(chip => <button key={chip} type="button" onClick={() => submit(chip)}>{chip}</button>)}</div>}
      </form>;
    case "choice":
      return <div className={styles.form}>
        <div className={styles.tones}>{(scene.chips ?? []).map(tone => <button key={tone} type="button" aria-pressed={answers.tone === tone} onClick={() => onPick("tone", tone)}>
          <strong>{TONE_LABELS[tone] ?? tone}</strong><span>{TONE_PREVIEWS[tone]}</span></button>)}</div>
        <div className={styles.row}><button type="button" className={styles.primary} onClick={() => submit(answers.tone)}>Así me gusta<Check size={15} /></button></div>
      </div>;
    case "swatches":
      return <div className={styles.form}>
        <div className={styles.swatches}>{(scene.chips ?? []).map(color => <button key={color} type="button" style={{ "--swatch": color } as CSSProperties} aria-label={ACCENT_NAMES[color] ?? color} aria-pressed={answers.accent === color} onClick={() => onPick("accent", color)}><i /><span>{ACCENT_NAMES[color] ?? color}</span></button>)}</div>
        <div className={styles.row}><button type="button" className={styles.primary} onClick={() => submit(answers.accent)}>Este color<Check size={15} /></button></div>
      </div>;
    case "voice":
      return <div className={styles.form}>
        <div className={styles.row}>
          <button type="button" className={styles.primary} onClick={() => { onVoiceSample(); submit(true); }}><Volume2 size={15} />Sí, háblame</button>
          <button type="button" className={styles.secondary} onClick={() => submit(false)}><VolumeX size={15} />Solo texto</button>
        </div>
      </div>;
    case "slider":
      return <form onSubmit={event => { event.preventDefault(); submit(slider); }} className={styles.form}>
        <div className={styles.sliderRow}><input type="range" min={scene.slider!.min} max={scene.slider!.max} step={scene.slider!.step} value={slider} onChange={event => setSlider(Number(event.target.value))} aria-label="Descuento máximo" /><output>{slider === 0 ? "Sin descuentos" : `${slider}%`}</output></div>
        <div className={styles.row}><button type="submit" className={styles.primary}>Continuar<ArrowRight size={15} /></button></div>
      </form>;
    case "money":
      return <form onSubmit={onSubmit} className={styles.form}>
        <div className={styles.chips}>{(scene.amounts ?? []).map(amount => <button key={amount} type="button" onClick={() => submit(amount)}>{amount === 0 ? "Siempre pregúntame" : formatCOP(amount)}</button>)}</div>
        <div className={styles.row}><input className={styles.input} inputMode="numeric" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Otro monto en pesos" aria-label="Monto máximo" />{go}</div>
      </form>;
    case "textarea":
      return <form onSubmit={onSubmit} className={styles.form}>
        <textarea className={styles.textarea} autoFocus value={draft} onChange={event => setDraft(event.target.value)} placeholder={scene.placeholder} rows={4} maxLength={2000} aria-label={scene.title} />
        <div className={styles.row}>{go}<button type="button" className={styles.secondary} onClick={() => submit("")}>{scene.skipLabel}</button></div>
      </form>;
  }
}
