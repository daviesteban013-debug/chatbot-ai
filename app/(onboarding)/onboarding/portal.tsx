"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Loader2, Volume2, VolumeX } from "lucide-react";
import { DotField, type FieldPulse } from "@/components/brand/dot-field";
import { NexoMark } from "@/components/brand/nexo-mark";
import { NexoOrb, type OrbState } from "@/components/jarvis/nexo-orb";
import { useJarvisVoice } from "@/hooks/useJarvisVoice";
import { personalizationDefaults } from "@/lib/jarvis-personalization";
import {
  ACCENT_NAMES, PORTAL_SCENES, PORTAL_TOTAL, TONE_LABELS, TONE_PREVIEWS, afterLine, describeAnswer, fillLine, portalDefaults, portalSubmission, portalSummary,
  typingSchedule, validateAnswer, type PortalAnswers, type PortalScene,
} from "@/lib/onboarding-portal";
import { formatCOP } from "@/lib/utils";
import { savePortal } from "./actions";
import styles from "./portal.module.css";

type Phase = "boot" | "typing" | "asking" | "after" | "saving" | "done";
type Entry = { id: number; who: "nexo" | "you"; text: string; at: string };
type Telemetry = { store: string | null; plan: string; products: number; whatsapp: boolean; email: string };
const stamp = () => new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const PLAN_LABELS: Record<string, string> = { pilot: "PILOTO", trial: "PRUEBA", starter: "STARTER", pro: "PRO", business: "BUSINESS" };

/**
 * The welcome portal. NEXO wakes up on a full screen, speaks and types one question per scene,
 * and the whole screen takes the answers at once: its name in the brand, the chosen color
 * everywhere, the voice out loud. Side panels show real telemetry and the live transcript;
 * they fade when NEXO is configured and the person enters the CRM.
 */
export function WelcomePortal({ initial, replay, telemetry }: { initial: Partial<PortalAnswers>; replay: boolean; telemetry: Telemetry }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("boot");
  const [scene, setScene] = useState(0);
  const [answers, setAnswers] = useState<PortalAnswers>({ ...portalDefaults, ...initial });
  const [typing, setTyping] = useState({ id: 0, text: "", count: 0 });
  const [log, setLog] = useState<Entry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(!(initial.voice ?? true));
  const [draft, setDraft] = useState("");
  const [slider, setSlider] = useState(initial.maxDiscountPct ?? portalDefaults.maxDiscountPct);
  const [clock, setClock] = useState("");
  const orbRef = useRef<HTMLDivElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const answersRef = useRef(answers);
  const afterTyping = useRef<(() => void) | null>(null);
  const lock = useRef(false);
  const ids = useRef(0);
  useEffect(() => { answersRef.current = answers; }, [answers]);

  const profile = useMemo(() => ({ ...personalizationDefaults, displayName: answers.displayName, voice: { ...personalizationDefaults.voice, enabled: !muted } }), [answers.displayName, muted]);
  const voice = useJarvisVoice(profile, answers.tone, undefined, { elevenLabs: false });
  const mutedRef = useRef(muted);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  const speakRef = useRef(voice.speak);
  useEffect(() => { speakRef.current = voice.speak; }, [voice.speak]);
  const say = useCallback((text: string, then?: () => void) => {
    ids.current += 1;
    afterTyping.current = then ?? null;
    setTyping({ id: ids.current, text, count: 0 });
    setLog(list => [...list, { id: ids.current, who: "nexo", text, at: stamp() }]);
    if (!mutedRef.current) speakRef.current(text);
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
    setScene(index); setDraft(""); setError(null); setPhase("typing");
    say(fillLine(PORTAL_SCENES[index].say, known), () => { setPhase("asking"); lock.current = false; });
  }, [say]);
  const begin = () => { if (phase !== "boot") return; startScene(0, answersRef.current); };

  const finishPortal = useCallback(async (known: PortalAnswers) => {
    setPhase("saving");
    const parsed = portalSubmission.safeParse(known);
    const result = parsed.success ? await savePortal(parsed.data) : { ok: false as const, error: "Falta una respuesta. Revisa los pasos anteriores." };
    if (!result.ok) { setError(result.error); setPhase("asking"); lock.current = false; return; }
    setPhase("done");
    say(`Listo${known.displayName ? `, ${known.displayName}` : ""}. ${known.agentName} en línea. Tu tienda ya tiene agente.`);
  }, [say]);

  const submit = useCallback((value: string | number | boolean) => {
    if (phase !== "asking" || lock.current) return;
    const problem = validateAnswer(current, value);
    if (problem) { setError(problem); return; }
    lock.current = true; setError(null);
    const clean = typeof value === "string" ? value.trim() : value;
    const next = { ...answersRef.current, [current.key]: clean } as PortalAnswers;
    answersRef.current = next; setAnswers(next);
    if (current.key === "voice") setMuted(!clean);
    ids.current += 1;
    setLog(list => [...list, { id: ids.current, who: "you", text: describeAnswer(current.key, clean), at: stamp() }]);
    setPhase("after");
    const last = scene === PORTAL_TOTAL - 1;
    say(afterLine(current, next, clean), () => { if (last) void finishPortal(next); else startScene(scene + 1, next); });
  }, [phase, current, scene, say, startScene, finishPortal]);

  const pulse: FieldPulse = voice.speaking ? "speaking" : phase === "typing" || phase === "after" || phase === "saving" ? "processing" : null;
  const orbState: OrbState = phase === "boot" ? "off" : voice.speaking || phase === "typing" || phase === "after" ? "speaking" : phase === "saving" ? "thinking" : "idle";
  const agent = answers.agentName.trim() || "NEXO";
  const typedText = typing.text.slice(0, typing.count);
  const submitForm = (event: FormEvent) => { event.preventDefault(); submit(current.kind === "money" ? Number(draft.replace(/[^\d]/g, "")) : draft); };

  return <main className={styles.portal} data-phase={phase} style={{ "--nexo-color": answers.accent } as CSSProperties}>
    <DotField className={styles.field} accent={answers.accent} pulse={pulse} originRef={orbRef} />
    <header className={styles.top}>
      <div className={styles.brand}><NexoMark className={styles.mark} /><div><strong>{agent.toUpperCase()} <span>{"// AGENTE"}</span></strong><small><i data-on={phase !== "boot"} />{phase === "boot" ? "EN ESPERA" : "EN LÍNEA"} · {muted ? "VOZ EN SILENCIO" : voice.supported ? "VOZ ACTIVA" : "VOZ NO DISPONIBLE"}</small></div></div>
      <div className={styles.topRight}>
        <button type="button" className={styles.ghost} onClick={() => { setMuted(value => !value); voice.stop(); }} aria-pressed={!muted}>{muted ? <VolumeX size={14} /> : <Volume2 size={14} />}{muted ? "Activar voz" : "Silenciar"}</button>
        {phase !== "boot" && phase !== "done" && <span className={styles.counter}>{String(scene + 1).padStart(2, "0")} / {PORTAL_TOTAL}</span>}
      </div>
    </header>

    <aside className={styles.left} data-hidden={phase === "done"}>
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
        <div ref={orbRef} className={styles.orb}><NexoOrb state="off" look={{ x: 0, y: 0 }} pulseKey="boot" errorKey={null} /></div>
        <p className={styles.eyebrow}>{replay ? "VOLVER A EMPEZAR" : "PORTAL DE BIENVENIDA"}</p>
        <h1 className={styles.title}>{replay ? "Conozcámonos otra vez." : "Tu tienda está a punto de tener agente."}</h1>
        <p className={styles.lead}>Dos minutos. NEXO se presenta, te pregunta cómo quieres que sea y queda listo para vender contigo.</p>
        <button type="button" className={styles.primary} onClick={begin}>Iniciar<ArrowRight size={15} /></button>
        <small className={styles.note}>Con sonido si tu navegador lo permite; puedes silenciarlo arriba a la derecha.</small>
      </div> : <>
        <div ref={orbRef} className={styles.orb} data-done={phase === "done"}><NexoOrb state={orbState} look={{ x: 0, y: 0 }} pulseKey={`${scene}:${phase}`} errorKey={error} /></div>
        <p className={styles.eyebrow}>{phase === "done" ? "CONFIGURACIÓN COMPLETA" : phase === "saving" ? "GUARDANDO" : current.title.toUpperCase()}</p>
        <h1 className={styles.line}>{typedText}<span className={styles.caret} data-on={typing.count < typing.text.length} aria-hidden="true" /></h1>
        {phase === "saving" && <p className={styles.saving}><Loader2 size={14} className={styles.spin} />Dejando todo listo…</p>}
        {phase === "asking" && <div className={styles.answer} key={current.key} data-enter>
          <Answer scene={current} answers={answers} draft={draft} setDraft={setDraft} slider={slider} setSlider={setSlider}
            onPick={(key, value) => { setAnswers(known => ({ ...known, [key]: value })); if (key === "tone" && !muted) voice.speak(TONE_PREVIEWS[String(value)] ?? "", true); }}
            onSubmit={submitForm} submit={submit} onVoiceSample={() => { setMuted(false); voice.speak("Así sueno. Me vas a oír cuando me actives.", true); }} />
        </div>}
        {phase === "done" && <div className={styles.summary} data-enter>
          <dl>{portalSummary(portalSubmission.parse(answers)).map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
          <button type="button" className={styles.primary} onClick={() => { voice.stop(); router.replace("/dashboard/jarvis"); router.refresh(); }}>Entrar a mi CRM<ArrowRight size={15} /></button>
          <small className={styles.note}>Puedes cambiar cualquier cosa luego en Personalización y en Agente y autonomía.</small>
        </div>}
        {error && <p role="alert" className={styles.error} data-enter>{error}</p>}
      </>}
    </div></section>

    <aside className={styles.right} data-hidden={phase === "done"}>
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
      <ol className={styles.progress} aria-label="Avance">{PORTAL_SCENES.map((item, index) => <li key={item.key} data-done={index < scene || phase === "done"} data-current={index === scene && phase !== "done" && phase !== "boot"} />)}</ol>
      <span>{phase === "done" ? "Listo para vender" : phase === "boot" ? "Portal de bienvenida" : current.title}</span>
    </footer>
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
