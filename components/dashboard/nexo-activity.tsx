"use client";
import Link from "next/link";
import type { useNexoActivity } from "@/hooks/useNexoActivity";
import type { ActivityItem } from "@/lib/activity";
import { timeAgo } from "@/lib/utils";
import { Panel, PanelHeader } from "@/components/dashboard/panel";
import styles from "@/components/jarvis/order-proposals.module.css";

const KIND: Record<ActivityItem["kind"], string> = { catalog: "Catálogo", work: "Memoria y tareas", job: "Trabajo en segundo plano", reminder: "Recordatorio de pago", sale: "Venta por WhatsApp" };

/** "Lo que hizo NEXO": actions taken on its own, with a link and Undo where it applies. */
export function NexoActivity({ state, tone = "light", canConfigure = false, onOpen }: {
  state: ReturnType<typeof useNexoActivity>;
  tone?: "light" | "dark";
  canConfigure?: boolean;
  /** Dark NEXO screen: open CRM screens through the operator instead of a plain link. */
  onOpen?(href: string): void;
}) {
  const { items, error, busy } = state;
  if (tone === "dark") {
    if (!items?.length) return null;
    return <section className={styles.list} data-compact aria-label="Lo que hizo NEXO">
      <article className={styles.card}>
        <div className={styles.heading}><span>LO QUE HIZO NEXO</span><button type="button" onClick={() => void state.refresh()}>Actualizar</button></div>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <ul style={{ marginTop: 10 }}>
          {items.slice(0, 5).map(item => <li key={`${item.kind}-${item.at}-${item.text}`} style={{ alignItems: "center" }}>
            <div>
              <button type="button" onClick={() => onOpen?.(item.href)} style={{ all: "unset", cursor: "pointer", textDecoration: item.status === "undone" ? "line-through" : undefined }}>{item.text}</button>
              <small>{timeAgo(item.at)} · {KIND[item.kind]}{item.status === "undone" ? " · deshecho" : ""}</small>
            </div>
            {item.undoable && item.log_id && <button type="button" disabled={!!busy} onClick={() => void state.undo(item.log_id!)}
              style={{ flexShrink: 0, padding: "6px 9px", border: "1px solid #ffffff20", borderRadius: 8, color: "#ddd", background: "#ffffff05", cursor: "pointer", fontSize: 11 }}>
              {busy === item.log_id ? "Deshaciendo…" : "Deshacer"}
            </button>}
          </li>)}
        </ul>
      </article>
    </section>;
  }

  return (
    <Panel aria-labelledby="nexo-activity-title">
      <PanelHeader id="nexo-activity-title" title="Lo que hizo NEXO" description="Por su cuenta · últimos 30 días"
        actions={canConfigure ? <Link href="/dashboard/agent#autonomia" className="text-xs font-medium text-muted transition hover:text-ink">Autonomía</Link> : null} />
      {error && <p role="alert" className="border-b border-line px-4 py-2 text-xs text-rose-700 sm:px-5">{error}</p>}
      {items === null ? (
        <p className="px-4 py-6 text-sm text-muted sm:px-5" role="status">Cargando…</p>
      ) : items.length === 0 ? (
        <div className="px-4 py-6 text-sm text-muted sm:px-5">
          <p>Todavía no hay acciones de NEXO en este periodo.</p>
          <p className="mt-1 text-xs">Aquí aparecen las ventas que cierra por WhatsApp, los recordatorios de pago que envía y los cambios que hace con tu autorización.</p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {items.map(item => (
            <li key={`${item.kind}-${item.at}-${item.text}`} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
              <span className={`size-1.5 shrink-0 rounded-full ${item.status === "undone" ? "bg-zinc-300" : item.kind === "sale" ? "bg-emerald-500" : item.kind === "reminder" ? "bg-sky-500" : "bg-accent"}`} aria-hidden="true" />
              <Link href={item.href} className="min-w-0 flex-1 group">
                <span className={`block truncate text-[13px] text-ink group-hover:underline ${item.status === "undone" ? "text-muted line-through" : ""}`}>{item.text}</span>
                <span className="block text-[11px] text-muted">{timeAgo(item.at)} · {KIND[item.kind]}{item.status === "undone" ? " · deshecho" : ""}</span>
              </Link>
              {item.undoable && item.log_id ? (
                <button type="button" disabled={!!busy} onClick={() => void state.undo(item.log_id!)}
                  className="shrink-0 rounded-md border border-line px-2 py-1 text-xs font-medium text-ink-soft transition hover:bg-subtle disabled:opacity-50">
                  {busy === item.log_id ? "Deshaciendo…" : "Deshacer"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
