"use client";
import { useState } from "react";
import { DesktopBubble } from "@/components/jarvis/desktop-bubble";
import { OrderProposals } from "@/components/jarvis/order-proposals";
import type { OrderProposal } from "@/lib/order-proposals";
/** Local visual fixture only. No authentication, audio capture or AI requests. */
export function NexoDesktopPreview() {
  const [input, setInput] = useState("");
  const [powered, setPowered] = useState(false);
  const [voice, setVoice] = useState(false);
  const [reply, setReply] = useState("");
  const [proposal, setProposal] = useState<OrderProposal>(() => ({ id: "11111111-1111-4111-8111-111111111111", session_id: "preview", status: "pending", expires_at: new Date(Date.now() + 900000).toISOString(), order_id: null, handoff_id: null,
    snapshot: { customer_id: "22222222-2222-4222-8222-222222222222", customer_name: "Ana · ejemplo visual", currency: "COP", fulfillment: "unassigned", subtotal: 24000, total: 24000,
      items: [{ variant_id: "33333333-3333-4333-8333-333333333333", sku: "CAM-NEG-M", name: "Camiseta · negro · M", qty: 2, unit_price: 12000 }] } }));
  const [now] = useState(Date.now);
  return <DesktopBubble hasProposals={!!reply} proposals={reply ? <OrderProposals compact state={{ proposals: [proposal], now, busy: null, error: null, verified: true, refresh: async () => {}, decide: async (_id, decision) => setProposal(previous => ({ ...previous, status: decision === "confirm" ? "confirmed" : decision === "cancel" ? "canceled" : "handed_off" })) }} onDecision={() => setPowered(false)} /> : null} powered={powered} listening={powered} armed={powered} busy={false} speaking={false} voice={voice} readyToPlay={false}
    activity={powered ? "Vista previa de escucha · sin micrófono real" : "Listo cuando tú lo estés"} reply={reply} input={input}
    onPower={() => setPowered(value => !value)} onMicrophone={() => setPowered(value => !value)} onVoice={() => setVoice(value => !value)} onStop={() => {}} onResume={() => {}} onInput={setInput} onSubmit={event => { event.preventDefault(); if (input.trim()) { setReply("Vista previa del diseño. En tu cuenta, NEXO consulta los datos reales del CRM y reúne las respuestas de sus agentes.\n\nPuedes seguir hablando o abrir el CRM desde el acceso superior."); setInput(""); } }} />;
}
