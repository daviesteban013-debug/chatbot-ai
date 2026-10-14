"use client";
import { BellRing, X } from "lucide-react";
import { ALERT_KINDS, ROUTINES, type ProactiveAlert, type ProactiveSettings, type RoutineCard } from "@/lib/proactive";
import styles from "./proactive.module.css";

const ago = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (!Number.isFinite(minutes)) return "";
  return minutes < 1 ? "Ahora" : minutes < 60 ? `Hace ${minutes} min` : `Hace ${Math.round(minutes / 60)} h`;
};

/** New things in the business, each with the one action that resolves it. */
export function ProactiveAlerts({ alerts, onOpen, onDismiss, onClear }: {
  alerts: ProactiveAlert[]; onOpen(href: string, label: string): void; onDismiss(key: string): void; onClear(): void;
}) {
  if (!alerts.length) return null;
  return <section className={styles.card} aria-label="Avisos de NEXO">
    <p className={styles.head}><span>AVISOS</span><strong>{alerts.length}</strong><button type="button" onClick={onClear}>Marcar como vistos</button></p>
    <ul className={styles.list}>
      {alerts.slice(0, 5).map(alert => <li key={alert.key} className={styles.item}>
        <span className={styles.dot} data-kind={alert.kind} aria-hidden="true" />
        <span className={styles.text}>{alert.text}<small>{ago(alert.at)}</small></span>
        <button type="button" className={styles.action} onClick={() => { onOpen(alert.href, alert.action); onDismiss(alert.key); }}>{alert.action}</button>
        <button type="button" className={styles.dismiss} onClick={() => onDismiss(alert.key)} aria-label={`Descartar: ${alert.text}`}><X size={12} /></button>
      </li>)}
    </ul>
    {alerts.length > 5 && <p className={styles.hint}>Y {alerts.length - 5} avisos más.</p>}
  </section>;
}

/** The evening or weekly routine, as facts with actions. */
export function RoutineSummary({ card, onOpen, onClose }: { card: RoutineCard; onOpen(href: string, label: string): void; onClose(): void }) {
  return <section className={styles.card} aria-label={card.title}>
    <p className={styles.head}><span>{card.title.toUpperCase()}</span><button type="button" onClick={onClose} aria-label={`Cerrar ${card.title}`}><X size={12} /></button></p>
    <ul className={styles.list}>
      {card.items.map(item => <li key={item.id} className={styles.item}>
        <span className={styles.dot} data-tone={item.tone} aria-hidden="true" />
        <span className={styles.text}>{item.text}</span>
        {item.action && <button type="button" className={styles.action} onClick={() => onOpen(item.action!.href, item.action!.label)}>{item.action.label}</button>}
      </li>)}
    </ul>
  </section>;
}

/** Shown once: alerts are off until the person turns them on. */
export function ProactiveInvite({ onEnable, onLater }: { onEnable(): void; onLater(): void }) {
  return <section className={styles.card} data-tone="invite" aria-label="Activar avisos de NEXO">
    <p className={styles.head}><BellRing size={12} /><span>AVISOS DE NEXO</span></p>
    <p className={styles.note}>Te aviso cuando un cliente espere un asesor, entre un pedido por aprobar, te paguen, NEXO cierre una venta o se agote un producto.</p>
    <div className={styles.buttons}><button type="button" className={styles.primary} onClick={onEnable}>Activar avisos</button><button type="button" className={styles.secondary} onClick={onLater}>Ahora no</button></div>
  </section>;
}

function Switch({ checked, onChange, label, disabled = false }: { checked: boolean; onChange(value: boolean): void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={styles.switch} onClick={() => onChange(!checked)} />;
}

/** What NEXO announces on this computer, how, and when it stays quiet. */
export function ProactiveSettingsPanel({ settings, update, systemAvailable }: {
  settings: ProactiveSettings; update(patch: Partial<ProactiveSettings>): void; systemAvailable: boolean;
}) {
  const off = !settings.alerts;
  return <div className={styles.settings}>
    <div className={styles.section}>
      <p>AVISOS</p>
      <div className={styles.box}>
        <label className={styles.row}><span>Avisarme de lo que pase<small>Revisa tu negocio cada 45 segundos, sin gastar créditos.</small></span><Switch label="Avisos" checked={settings.alerts} onChange={value => update({ alerts: value })} /></label>
        {ALERT_KINDS.map(({ kind, label }) => <label key={kind} className={styles.row} data-disabled={off}><span>{label}</span>
          <Switch label={label} disabled={off} checked={settings.kinds[kind]} onChange={value => update({ kinds: { ...settings.kinds, [kind]: value } })} /></label>)}
      </div>
    </div>
    <div className={styles.section}>
      <p>CÓMO TE AVISO</p>
      <div className={styles.box}>
        <label className={styles.row} data-disabled={!systemAvailable}><span>Notificación del sistema<small>{systemAvailable ? "Aparece aunque trabajes en otra ventana." : "Disponible al actualizar NEXO para escritorio."}</small></span>
          <Switch label="Notificación del sistema" disabled={!systemAvailable} checked={systemAvailable && settings.system} onChange={value => update({ system: value })} /></label>
        <label className={styles.row}><span>Decirlo en voz alta<small>Solo si NEXO está encendido y con voz.</small></span><Switch label="Decir avisos en voz alta" checked={settings.voice} onChange={value => update({ voice: value })} /></label>
        <div className={styles.row}><span>No molestar<small>Sin sonido ni notificaciones; los avisos quedan aquí.</small></span>
          <Switch label="No molestar" checked={settings.quiet.enabled} onChange={value => update({ quiet: { ...settings.quiet, enabled: value } })} />
          {settings.quiet.enabled && <div className={styles.times}>De <input aria-label="No molestar desde" type="time" className={styles.time} value={settings.quiet.from} onChange={event => event.target.value && update({ quiet: { ...settings.quiet, from: event.target.value } })} />
            a <input aria-label="No molestar hasta" type="time" className={styles.time} value={settings.quiet.to} onChange={event => event.target.value && update({ quiet: { ...settings.quiet, to: event.target.value } })} /></div>}</div>
      </div>
    </div>
    <div className={styles.section}>
      <p>RUTINAS</p>
      <div className={styles.box}>
        {ROUTINES.map(({ id, label, detail, monday }) => { const routine = settings.routines[id]; return <div key={id} className={styles.row}><span>{label}<small>{detail}</small></span>
          <Switch label={label} checked={routine.enabled} onChange={value => update({ routines: { ...settings.routines, [id]: { ...routine, enabled: value } } })} />
          {routine.enabled && <div className={styles.times}>{monday ? "Los lunes a las" : "Todos los días a las"} <input aria-label={`Hora de ${label}`} type="time" className={styles.time} value={routine.time} onChange={event => event.target.value && update({ routines: { ...settings.routines, [id]: { ...routine, time: event.target.value } } })} /></div>}</div>; })}
      </div>
      <p className={styles.hint}>Horas de Colombia. Si NEXO estaba cerrado, la rutina llega al abrirlo, hasta 4 horas después.</p>
    </div>
  </div>;
}
