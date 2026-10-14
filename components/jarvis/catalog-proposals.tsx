"use client";
import type { useCatalogProposals } from "@/hooks/useCatalogProposals";
import type { CatalogProposalLine } from "@/lib/catalog-proposals";
import styles from "./order-proposals.module.css";

const money = (value: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
const units = (value: number) => `${value} u`;

function Change({ line }: { line: CatalogProposalLine }) {
  if (line.kind === "create") {
    const stock = line.variants.reduce((sum, v) => sum + (v.stock_qty ?? 0), 0);
    const options = line.variants.map(v => [v.color, v.size].filter(Boolean).join(" ")).filter(Boolean);
    return <li><div>{line.label}<small>{[line.category, options.length ? options.join(", ") : null, `${stock} en stock`, line.photo ? `foto: ${line.photo}` : null].filter(Boolean).join(" · ")}</small></div><strong>{money(line.after)}</strong></li>;
  }
  const show = line.kind === "price" ? money : line.kind === "stock" ? units : (value: boolean) => value ? "Disponible" : "Oculto";
  return <li><div>{line.label}<small>{line.sku}{line.kind === "stock" && line.reserved ? ` · ${line.reserved} reservadas` : ""}</small></div>
    <strong>{(show as (v: number | boolean) => string)(line.before)} → {(show as (v: number | boolean) => string)(line.after)}</strong></li>;
}

/** Cards for catalog changes NEXO prepared. Only a click here applies them. */
export function CatalogProposals({ state, onDecision, compact = false }: { state: ReturnType<typeof useCatalogProposals>; onDecision(): void; compact?: boolean }) {
  if (!state.proposals.length) return null;
  return <section className={styles.list} data-compact={compact} aria-label="Cambios del catálogo">
    <div className={styles.heading}><span>CAMBIOS DEL CATÁLOGO</span><button type="button" disabled={!!state.busy} onClick={() => void state.refresh()}>Actualizar</button></div>
    {state.error && <p role="alert" className={styles.error}>{state.error}</p>}
    {!state.verified && <p role="status" className={styles.error}>Actualiza el estado para volver a decidir.</p>}
    {state.proposals.map(proposal => {
      const expired = proposal.status === "pending" && Date.parse(proposal.expires_at) <= state.now;
      const pending = proposal.status === "pending" && !expired;
      const undone = proposal.activity?.status === "undone";
      const status = state.busy === proposal.id ? (proposal.applied_by_nexo ? "Deshaciendo…" : "Aplicando…") : expired ? "Propuesta vencida"
        : undone ? "Deshecho" : proposal.applied_by_nexo && proposal.status === "applied" ? "Aplicado por NEXO"
        : ({ pending: "Esperando tu confirmación", applied: "Cambio aplicado", canceled: "Cambio cancelado", expired: "Propuesta vencida" })[proposal.status];
      return <article key={proposal.id} className={styles.card}>
        <p className={styles.status} role="status" data-done={proposal.status === "applied" && !undone}>{status}</p>
        <h3>{proposal.snapshot.title}</h3>
        <ul>{proposal.snapshot.lines.map((line, index) => <Change key={index} line={line} />)}</ul>
        <p className={styles.note}>{undone ? "Se restauraron los valores anteriores." : proposal.applied_by_nexo && proposal.status === "applied" ? "Lo aplicó NEXO porque activaste esta autonomía. Puedes deshacerlo durante 7 días si nadie lo cambió después."
          : proposal.status === "applied" ? "Listo en tu catálogo. NEXO ya lo usa en WhatsApp." : "Nada cambia hasta que confirmes. Si alguien modifica estos productos antes, no se aplicará."}</p>
        {pending && <><small className={styles.expiry}>Vence en {Math.max(1, Math.ceil((Date.parse(proposal.expires_at) - state.now) / 60000))} min</small><div className={styles.actions}>
          <button type="button" className={styles.confirm} disabled={!!state.busy || !state.verified} onClick={() => { onDecision(); void state.decide(proposal.id, "confirm"); }}>Confirmar cambio</button>
          <button type="button" disabled={!!state.busy || !state.verified} onClick={() => { onDecision(); void state.decide(proposal.id, "cancel"); }}>Cancelar</button>
        </div></>}
        {proposal.activity?.undoable && proposal.activity.status === "applied" && <div className={styles.actions}>
          <button type="button" disabled={!!state.busy} onClick={() => { onDecision(); void state.undo(proposal.id, proposal.activity!.id); }}>Deshacer</button>
        </div>}
        {proposal.status === "applied" && !undone && <a className={styles.link} href="/dashboard/catalog" onClick={event => { if (window.nexoDesktop) { event.preventDefault(); void window.nexoDesktop.openPanel("/dashboard/catalog").catch(() => {}); } }}>Ver catálogo ↗</a>}
      </article>;
    })}
  </section>;
}
