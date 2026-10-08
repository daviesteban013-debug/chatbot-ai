"use client";
import { useEffect, useState, useSyncExternalStore, type CSSProperties, type FormEvent } from "react";
import { ArrowUpRight, ChevronDown, Grip, Mic, MicOff, Power, Send, Settings2, Square, Volume2, VolumeX, X } from "lucide-react";
import { commandPanels } from "@/lib/jarvis-commands";
import type { DesktopPreferences } from "@/types/nexo-desktop";
import styles from "./desktop-bubble.module.css";
const subscribe = () => () => {};
export function useDesktopMode() {
  return useSyncExternalStore(subscribe, () => Boolean(window.nexoDesktop) || (process.env.NODE_ENV === "development" && new URLSearchParams(window.location.search).get("desktopPreview") === "1"), () => false);
}
interface Props {
  powered: boolean; listening: boolean; armed: boolean; busy: boolean; speaking: boolean;
  activity: string; reply: string; error?: string | null; input: string; voice: boolean; readyToPlay: boolean;
  onPower(): void; onMicrophone(): void; onVoice(): void; onStop(): void; onResume(): void;
  onInput(value: string): void; onSubmit(event: FormEvent): void;
}
export function DesktopBubble(props: Props) {
  const [preferences, setPreferences] = useState<DesktopPreferences>({ color: "#facc15", expanded: true });
  const [settings, setSettings] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [eyes, setEyes] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const bridge = window.nexoDesktop;
    if (!bridge) return;
    let live = true;
    bridge.getPreferences().then(value => { if (live) setPreferences(value); }).catch(() => { if (live) setNotice("No se pudieron cargar tus preferencias."); });
    const off = bridge.onPreferences(setPreferences);
    return () => { live = false; off(); };
  }, []);
  async function expand() {
    try {
      const next = !preferences.expanded;
      setPreferences(window.nexoDesktop ? await window.nexoDesktop.setExpanded(next) : { ...preferences, expanded: next });
      setSettings(false);
    } catch { setNotice("No se pudo cambiar el tamaño."); }
  }
  async function color(value: string) {
    try { setPreferences(window.nexoDesktop ? await window.nexoDesktop.setColor(value) : { ...preferences, color: value }); }
    catch { setNotice("No se pudo guardar el color."); }
  }
  async function open(path: string) {
    try { await window.nexoDesktop?.openPanel(path); }
    catch { setNotice("No se pudo abrir el panel. Inténtalo de nuevo."); }
  }
  return <main className={styles.shell} data-expanded={preferences.expanded} style={{ "--nexo-color": preferences.color, "--eye-x": `${eyes.x}px`, "--eye-y": `${eyes.y}px` } as CSSProperties}>
    <header className={styles.handle}><Grip size={14} /><span>NEXO</span><button type="button" onClick={expand} aria-label={preferences.expanded ? "Contraer NEXO" : "Expandir NEXO"}><ChevronDown size={15} /></button></header>
    <button type="button" className={styles.orbButton} onClick={preferences.expanded ? props.onPower : expand} aria-label={preferences.expanded ? props.powered ? "Apagar NEXO" : "Encender NEXO y activar escucha" : "Abrir NEXO"}
      onPointerMove={event => { const box = event.currentTarget.getBoundingClientRect(); setEyes({ x: (event.clientX - box.left - box.width / 2) / 15, y: (event.clientY - box.top - box.height / 2) / 15 }); }} onPointerLeave={() => setEyes({ x: 0, y: 0 })}>
      <span className={styles.aura} data-active={props.powered} /><span className={styles.orb} data-active={props.powered} data-state={props.speaking ? "speaking" : props.listening ? "listening" : props.busy ? "thinking" : "idle"}><span className={styles.eyes}><i /><i /></span><span className={styles.shine} /></span>
    </button>
    <p className={styles.status} role="status"><span data-active={props.listening} />{props.activity}</p>
    {preferences.expanded && <>
      <div className={styles.toolbar}>
        <button type="button" onClick={props.onPower} aria-pressed={props.powered} aria-label={props.powered ? "Apagar NEXO" : "Encender NEXO"}><Power size={17} /></button>
        <button type="button" onClick={props.onMicrophone} aria-pressed={props.armed} aria-label={props.armed ? "Apagar micrófono" : "Activar escucha continua"}>{props.armed ? <Mic size={17} /> : <MicOff size={17} />}</button>
        <button type="button" onClick={props.onVoice} aria-pressed={props.voice} aria-label={props.voice ? "Silenciar voz" : "Activar voz"}>{props.voice ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
        <button type="button" onClick={() => setSettings(value => !value)} aria-expanded={settings} aria-label="Personalizar burbuja"><Settings2 size={17} /></button>
        {props.busy && <button type="button" onClick={props.onStop} aria-label="Interrumpir respuesta"><Square size={15} /></button>}
      </div>
      {settings && <section className={styles.settings} aria-label="Personalización de NEXO"><p>Tu NEXO, tu color</p><div className={styles.swatches}>{["#facc15", "#a78bfa", "#38bdf8", "#34d399", "#fb7185"].map(value => <button key={value} type="button" style={{ backgroundColor: value }} aria-label={`Color ${value}`} aria-pressed={preferences.color === value} onClick={() => void color(value)} />)}<label>Otro<input type="color" value={preferences.color} onChange={event => void color(event.target.value)} /></label></div><small>Arrastra la barra superior. Alt + Shift + N contrae o expande.</small><button type="button" className={styles.quit} onClick={() => { props.onStop(); void window.nexoDesktop?.quit(); }}><X size={13} />Salir de NEXO</button></section>}
      {(props.error || notice) && <p role="alert" className={styles.error}>{props.error || notice}</p>}
      {props.readyToPlay && <button type="button" className={styles.resume} onClick={props.onResume}>Reproducir respuesta</button>}
      <div className={styles.reply} aria-live="polite">{props.reply}</div>
      <nav className={styles.panels} aria-label="Paneles del CRM">{(["orders", "catalog", "billing", "crm"] as const).map(key => <button type="button" key={key} onClick={() => void open(commandPanels[key].path)}>{commandPanels[key].label}<ArrowUpRight size={12} /></button>)}</nav>
      <form className={styles.composer} onSubmit={props.onSubmit}><input aria-label="Mensaje a NEXO" placeholder="Dile algo a NEXO…" value={props.input} onChange={event => props.onInput(event.target.value)} maxLength={4000} /><button type="submit" aria-label="Enviar mensaje" disabled={props.busy || !props.input.trim()}><Send size={16} /></button></form>
      <p className={styles.hint}>{props.armed ? "Escucha activa · habla después de mi respuesta" : "Activa el micrófono para hablar conmigo"}</p>
    </>}
  </main>;
}
