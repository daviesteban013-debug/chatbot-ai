"use client";

import { ArrowUpRight, Check, Circle, LoaderCircle, ShieldCheck, X } from "lucide-react";
import type { OperatorAction, OperatorNavigation } from "@/lib/crm-operator";
import styles from "./operator-task.module.css";

export function OperatorTask({ actions, busy, onOpen, compact = false }: {
  actions: OperatorAction[];
  busy: boolean;
  compact?: boolean;
  onOpen(navigation: OperatorNavigation): void;
}) {
  if (!actions.length) return null;
  const awaiting = actions.some(action => action.status === "approval_required");
  const failed = actions.some(action => action.status === "failed");
  return <section className={styles.task} data-compact={compact} aria-label="Actividad de NEXO">
    <header><span><ShieldCheck size={15}/>NEXO EN ACCIÓN</span><small>{busy ? "Trabajando" : failed ? "Revisa los pendientes" : awaiting ? "Propuesta preparada" : "Completado"}</small></header>
    <ol>{actions.map(action => <li key={action.id} data-status={action.status}>
      <span className={styles.icon} aria-hidden="true">{action.status === "running" ? <LoaderCircle size={16}/> : action.status === "failed" ? <X size={16}/> : action.status === "approval_required" ? <Circle size={16}/> : <Check size={16}/>}</span>
      <div><strong>{action.label}</strong><small>{action.status === "running" ? "En curso…" : action.summary || (action.status === "failed" ? "No se completó este paso." : "Paso verificado.")}</small>
        {action.navigation && action.status === "completed" && <button type="button" disabled={busy} onClick={() => onOpen(action.navigation!)}>{action.navigation.label.startsWith("Ver ") ? action.navigation.label : `Ver ${action.navigation.label}`}<ArrowUpRight size={12}/></button>}
      </div>
    </li>)}</ol>
    {awaiting && <p>Consulta la tarjeta de cada propuesta para ver su estado y decidir. El pedido solo se registra al confirmarlo.</p>}
  </section>;
}
