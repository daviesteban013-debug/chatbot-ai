"use client";
import { useEffect, useState, useSyncExternalStore, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowUpRight, ChevronDown, GripHorizontal, LayoutDashboard, ListTodo, Mic, MicOff, Package, Power, Send, Settings2, ShoppingBag, Square, UserRound, Volume2, VolumeX, X } from "lucide-react";
import { commandPanels } from "@/lib/jarvis-commands";
import { compactCOP } from "@/lib/sales-metrics";
import type { DesktopPreferences } from "@/types/nexo-desktop";
import styles from "./desktop-bubble.module.css";
import { DesktopUpdates } from "@/components/pwa/desktop-updates";
const subscribe = () => () => {};
export function useDesktopMode() {
  return useSyncExternalStore(subscribe, () => Boolean(window.nexoDesktop && window.nexoDesktop.surface !== "crm") || (process.env.NODE_ENV === "development" && new URLSearchParams(window.location.search).get("desktopPreview") === "1"), () => false);
}
/** Today at a glance, from the daily briefing facts. */
export type BubbleToday = { sales: number; orders: number; unpaid: number; unpaidTotal: number; waiting: number };
interface Props {
  operator?: ReactNode;
  navigationNotice?: string | null;
  proposals?: ReactNode;
  hasProposals?: boolean;
  /** Proactive cards (alerts, routines, invitation), shown first. */
  alerts?: ReactNode;
  unread?: number;
  latestAlert?: string | null;
  /** Alerts and routines settings, shown in the settings view. */
  settingsPanel?: ReactNode;
  today?: BubbleToday | null;
  powered: boolean; listening: boolean; armed: boolean; busy: boolean; speaking: boolean;
  activity: string; reply: string; error?: string | null; input: string; voice: boolean; readyToPlay: boolean;
  onPower(): void; onMicrophone(): void; onVoice(): void; onStop(): void; onResume(): void;
  onInput(value: string): void; onSubmit(event: FormEvent): void;
}
const SHORTCUTS = [
  { label: "Pedidos", path: commandPanels.orders.path, icon: ShoppingBag },
  { label: "Atención", path: commandPanels.handoffs.path, icon: UserRound },
  { label: "Catálogo", path: commandPanels.catalog.path, icon: Package },
  { label: "Tareas", path: commandPanels.workspace.path, icon: ListTodo },
];
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
    try {
      if (window.nexoDesktop) await window.nexoDesktop.openPanel(path);
      else if (process.env.NODE_ENV === "development") setNotice("Vista previa: este acceso abre el panel en la app instalada.");
    }
    catch { setNotice("No se pudo abrir el panel. Inténtalo de nuevo."); }
  }
  const state = props.speaking ? "speaking" : props.listening ? "listening" : props.busy ? "thinking" : "idle";
  const hasReply = props.reply && props.reply !== "Estoy aquí. ¿Qué vamos a hacer hoy?";
  const unread = props.unread ?? 0;
  const compactStatus = props.error ? "Revisar aviso" : unread && props.latestAlert ? props.latestAlert : props.speaking ? "Hablando" : props.busy ? "Pensando" : props.armed ? "Escucha activa" : "NEXO";
  return <main className={styles.shell} data-proposals={props.hasProposals} data-expanded={preferences.expanded} data-state={state} style={{ "--nexo-color": preferences.color, "--eye-x": `${eyes.x}px`, "--eye-y": `${eyes.y}px` } as CSSProperties}>
    <header className={styles.handle}>{preferences.expanded ? <><span className={styles.wordmark}>NEXO<span>.</span></span><span className={styles.headerLabel}>{settings ? "Ajustes" : "Tu agente"}</span><button type="button" onClick={() => void open("/dashboard")} aria-label="Abrir CRM" title="Abrir CRM"><LayoutDashboard size={14} /><span>CRM</span><ArrowUpRight size={12} /></button><button type="button" onClick={expand} aria-label="Contraer NEXO" title="Contraer"><ChevronDown size={16} /></button></> : <GripHorizontal size={16} aria-label="Arrastra para mover NEXO" />}</header>
    {!settings && <button type="button" className={styles.orbButton} onClick={preferences.expanded ? props.onPower : expand} aria-label={preferences.expanded ? props.powered ? "Apagar NEXO" : "Encender NEXO y activar escucha" : unread ? `Abrir NEXO: ${unread} ${unread === 1 ? "aviso nuevo" : "avisos nuevos"}` : "Abrir NEXO"}
      onPointerMove={event => { const box = event.currentTarget.getBoundingClientRect(); setEyes({ x: (event.clientX - box.left - box.width / 2) / 15, y: (event.clientY - box.top - box.height / 2) / 15 }); }} onPointerLeave={() => setEyes({ x: 0, y: 0 })}>
      <span className={styles.aura} data-active={props.powered} /><span className={styles.orb} data-active={props.powered} data-state={state}><span className={styles.eyes}><i /><i /></span><span className={styles.shine} /></span>
      {unread > 0 && <span className={styles.badge} aria-hidden="true">{unread > 9 ? "9+" : unread}</span>}
    </button>}
    {!settings && <p className={styles.status} role="status" title={preferences.expanded ? props.activity : compactStatus} data-alert={!preferences.expanded && unread > 0 && !props.error}><span data-active={props.listening} /><span>{preferences.expanded ? props.activity : compactStatus}</span></p>}
    {!preferences.expanded && <button type="button" className={styles.compactPower} onClick={props.onPower} aria-label={props.powered ? "Apagar NEXO y micrófono" : "Encender NEXO y activar escucha"} aria-pressed={props.powered} title={props.powered ? "Apagar NEXO" : "Encender NEXO"}><Power size={12} /></button>}
    {preferences.expanded && <>
      {settings ? <section className={styles.settingsView} aria-label="Ajustes de NEXO">
        <button type="button" className={styles.back} onClick={() => setSettings(false)}><ArrowLeft size={13} />Volver a la conversación</button>
        {props.settingsPanel}
        <div className={styles.appearance}><p>APARIENCIA</p><div className={styles.swatches}>{["#facc15", "#a78bfa", "#38bdf8", "#34d399", "#fb7185"].map(value => <button key={value} type="button" style={{ backgroundColor: value }} aria-label={`Color ${value}`} aria-pressed={preferences.color === value} onClick={() => void color(value)} />)}<label>Otro<input type="color" value={preferences.color} onChange={event => void color(event.target.value)} /></label></div><small>Arrastra la barra superior para moverme. Alt + Shift + N me contrae o expande.</small></div>
        <DesktopUpdates compact beforeInstall={props.onStop} />
        <button type="button" className={styles.quit} onClick={() => { props.onStop(); void window.nexoDesktop?.quit(); }}><X size={13} />Salir de NEXO</button>
      </section> : <section className={styles.conversation} aria-label="Conversación con NEXO">
        {props.alerts}
        {props.operator}
        {props.navigationNotice && <p className={styles.hint} role="status">{props.navigationNotice}</p>}
        {props.proposals}
        {hasReply ? <><span className={styles.eyebrow}>NEXO CONTIGO</span><div className={styles.reply} aria-live="polite">{props.reply}</div></> : <div className={styles.welcome}>
          {props.today ? <>
            <span className={styles.eyebrow}>HOY EN TU NEGOCIO</span>
            <div className={styles.glance}>
              <button type="button" onClick={() => void open(commandPanels.orders.path)}><strong>{compactCOP(props.today.sales)}</strong><small>{props.today.orders} {props.today.orders === 1 ? "pedido" : "pedidos"}</small></button>
              <button type="button" onClick={() => void open(commandPanels.orders.path)} data-warn={props.today.unpaid > 0}><strong>{props.today.unpaid}</strong><small>por cobrar</small></button>
              <button type="button" onClick={() => void open(commandPanels.handoffs.path)} data-warn={props.today.waiting > 0}><strong>{props.today.waiting}</strong><small>esperan asesor</small></button>
            </div>
          </> : <h1>¿Qué hacemos hoy?</h1>}
          <div className={styles.chips}>{SHORTCUTS.map(({ label, path, icon: Icon }) => <button key={path} type="button" onClick={() => void open(path)}><Icon size={13} />{label}</button>)}</div>
          <p className={styles.try}>Prueba: «¿cuánto vendí esta semana?» o «llegaron 20 tenis talla 40».</p>
        </div>}
      </section>}
      {(props.error || notice) && <p role="alert" className={styles.error}>{props.error || notice}</p>}
      {props.readyToPlay && <button type="button" className={styles.resume} onClick={props.onResume}>Reproducir respuesta</button>}
      {!settings && <div className={styles.dock}>
        <div className={styles.toolbar}>
          <button type="button" className={styles.power} onClick={props.onPower} aria-pressed={props.powered}><Power size={14} />{props.powered ? "Encendido" : "Activar NEXO"}</button>
          <button type="button" onClick={props.onMicrophone} aria-pressed={props.armed} aria-label={props.armed ? "Apagar micrófono" : "Activar escucha continua"} title={props.armed ? "Apagar micrófono" : "Activar escucha continua"}>{props.armed ? <Mic size={16} /> : <MicOff size={16} />}</button>
          <button type="button" onClick={props.onVoice} aria-pressed={props.voice} aria-label={props.voice ? "Silenciar voz" : "Activar voz"} title={props.voice ? "Silenciar voz" : "Activar voz"}>{props.voice ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>
          <button type="button" onClick={() => setSettings(true)} aria-label="Ajustes de NEXO: avisos, rutinas y apariencia" title="Ajustes"><Settings2 size={16} /></button>
        </div>
        <form className={styles.composer} onSubmit={props.onSubmit}><input aria-label="Mensaje a NEXO" placeholder="Escribe o habla con NEXO…" value={props.input} onChange={event => props.onInput(event.target.value)} maxLength={4000} />{props.busy ? <button type="button" onClick={props.onStop} aria-label="Interrumpir respuesta"><Square size={15} /></button> : <button type="submit" aria-label="Enviar mensaje" disabled={!props.input.trim()}><Send size={16} /></button>}</form>
        <p className={styles.hint}>{props.speaking ? "Espera a que termine para hablar" : props.busy ? "Preparando tu respuesta" : props.armed ? props.listening ? "Micrófono activo · te escucho" : "Micrófono en pausa temporal" : "Micrófono apagado · tú decides cuándo hablar"}</p>
      </div>}
    </>}
  </main>;
}
