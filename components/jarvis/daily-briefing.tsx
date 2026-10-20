"use client";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import type { Briefing } from "@/lib/briefing";
import styles from "./order-proposals.module.css";

const ICONS = { good: CheckCircle2, warning: CircleAlert, info: Info } as const;
const TONE = { good: "#6ee7b7", warning: "#fbbf24", info: "#a3a3ad" } as const;

/** Today's briefing: facts from the database with one-click actions. */
export function DailyBriefing({ briefing, onOpen, onDismiss, compact = false }: {
  briefing: Briefing; onOpen(href: string, label: string): void; onDismiss(): void; compact?: boolean;
}) {
  // Always full height: the Zorax dock already scrolls, a nested scroll would hide items.
  return <section className={styles.list} data-compact aria-label="Resumen del día" data-desktop={compact}>
    <article className={styles.card}>
      <div className={styles.heading}><span>TU RESUMEN DEL DÍA</span><button type="button" onClick={onDismiss} aria-label="Ocultar resumen del día"><X size={13} /></button></div>
      <ul style={{ marginTop: 10 }}>
        {briefing.items.map(item => {
          const Icon = ICONS[item.tone];
          return <li key={item.id} style={{ alignItems: "center" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <Icon size={14} style={{ color: TONE[item.tone], flexShrink: 0, marginTop: 1 }} aria-label={item.tone === "warning" ? "Requiere atención" : item.tone === "good" ? "Bien" : "Información"} />
              <span>{item.text}</span>
            </div>
            {item.action && <button type="button" onClick={() => onOpen(item.action!.href, item.action!.label)}
              style={{ flexShrink: 0, padding: "6px 9px", border: "1px solid #ffffff20", borderRadius: 8, color: "#ddd", background: "#ffffff05", cursor: "pointer", fontSize: 11 }}>
              {item.action.label}
            </button>}
          </li>;
        })}
      </ul>
      <p className={styles.note}>Datos de tu CRM en hora de Colombia. Pregúntame «¿cuánto vendí esta semana?» o «llegaron 20 tenis talla 40».</p>
    </article>
  </section>;
}
