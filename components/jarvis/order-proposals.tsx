"use client";
import type { useOrderProposals } from "@/hooks/useOrderProposals";
import styles from "./order-proposals.module.css";

const money = (value: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value);
export function OrderProposals({ state, onDecision, compact = false }: { state: ReturnType<typeof useOrderProposals>; onDecision(): void; compact?: boolean }) {
  if (!state.proposals.length) return null;
  return <section className={styles.list} data-compact={compact} aria-label="Propuestas de pedidos">
    <div className={styles.heading}><span>TUS PROPUESTAS</span><button type="button" disabled={!!state.busy} onClick={() => void state.refresh()}>Actualizar</button></div>
    {state.error && <p role="alert" className={styles.error}>{state.error}</p>}
    {!state.verified && <p role="status" className={styles.error}>Actualiza el estado para volver a decidir.</p>}
    {state.proposals.map(proposal => {
      const expired = proposal.status === "pending" && Date.parse(proposal.expires_at) <= state.now;
      const pending = proposal.status === "pending" && !expired;
      const status = state.busy === proposal.id ? "Completando acción…" : expired ? "Propuesta vencida" : ({ pending: "Esperando tu confirmación", confirmed: "Borrador registrado", canceled: "Propuesta cancelada", expired: "Propuesta vencida", handed_off: "Asignado a atención humana" })[proposal.status];
      const path = proposal.order_id ? `/dashboard/orders/${proposal.order_id}` : proposal.handoff_id ? `/dashboard/handoffs/${proposal.handoff_id}` : null;
      return <article key={proposal.id} className={styles.card}>
        <p className={styles.status} role="status" data-done={proposal.status === "confirmed" || proposal.status === "handed_off"}>{status}</p>
        <h3>{proposal.snapshot.customer_name}</h3>
        <ul>{proposal.snapshot.items.map(item => <li key={item.variant_id}><div>{item.qty} × {item.name}<small>{item.sku} · {money(item.unit_price)} c/u</small></div><strong>{money(item.qty * item.unit_price)}</strong></li>)}</ul>
        <div className={styles.total}><span>Total productos</span><strong>{money(proposal.snapshot.total)} <small>COP</small></strong></div>
        <p className={styles.note}>{proposal.status === "confirmed" ? "Inventario reservado. Completa envío y pago en el CRM; el pedido sigue en borrador." : proposal.status === "handed_off" ? "El caso incluye esta propuesta y quedó asignado a ti. No se creó pedido ni se reservó inventario." : "Envío y pago pendientes. Confirmar registra un borrador y reserva inventario; no realiza cobros."}</p>
        {pending && <><small className={styles.expiry}>Vence en {Math.max(1, Math.ceil((Date.parse(proposal.expires_at) - state.now) / 60000))} min</small><div className={styles.actions}>
          <button type="button" className={styles.confirm} disabled={!!state.busy || !state.verified} onClick={() => { onDecision(); void state.decide(proposal.id, "confirm"); }}>Confirmar pedido</button>
          <button type="button" disabled={!!state.busy || !state.verified} onClick={() => { onDecision(); void state.decide(proposal.id, "handoff"); }}>Pasar a atención humana</button>
          <button type="button" disabled={!!state.busy || !state.verified} onClick={() => { onDecision(); void state.decide(proposal.id, "cancel"); }}>Cancelar</button>
        </div></>}
        {path && <a className={styles.link} href={path} onClick={event => { if (window.nexoDesktop) { event.preventDefault(); void window.nexoDesktop.openPanel(proposal.order_id ? "/dashboard/orders" : "/dashboard/handoffs").catch(() => {}); } }}>Abrir {proposal.order_id ? "pedido en el CRM" : "caso de atención"} ↗</a>}
      </article>;
    })}
  </section>;
}
