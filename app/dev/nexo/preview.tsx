"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { DesktopBubble } from "@/components/jarvis/desktop-bubble";
import { OrderProposals } from "@/components/jarvis/order-proposals";
import type { OrderProposal } from "@/lib/order-proposals";
import { OperatorTask } from "@/components/jarvis/operator-task";
import { ProactiveAlerts, ProactiveSettingsPanel } from "@/components/jarvis/proactive";
import { defaultSettings, type ProactiveAlert } from "@/lib/proactive";
import { JobCards, WatchFolderSettings, type BubbleAttachments } from "@/components/jarvis/jobs";
import type { JobView } from "@/lib/jobs/types";

const DEMO_JOBS: JobView[] = [
  { id: "11111111-1111-4111-8111-aaaaaaaaaaa1", kind: "catalog_update", status: "running", session_id: "preview", created_at: new Date(Date.now() - 60000).toISOString(), started_at: new Date(Date.now() - 50000).toISOString(), finished_at: null, applied_at: null, progress: { done: 3, total: 9, step: "Actualizando stock" }, summary: null, error: null, counts: {}, note: null },
  { id: "11111111-1111-4111-8111-aaaaaaaaaaa2", kind: "catalog_import", status: "done", session_id: "preview", created_at: new Date(Date.now() - 900000).toISOString(), started_at: null, finished_at: new Date(Date.now() - 600000).toISOString(), applied_at: null, progress: {}, summary: "Dejé 18 productos listos para revisar (4 ya existen)", error: null, counts: { products: 18, existing: 4 }, note: null },
  { id: "11111111-1111-4111-8111-aaaaaaaaaaa3", kind: "collections_review", status: "done", session_id: "preview", created_at: new Date(Date.now() - 3600000).toISOString(), started_at: null, finished_at: new Date(Date.now() - 3500000).toISOString(), applied_at: null, progress: {}, summary: "Revisé 12 pedidos por cobrar ($ 1.450.000): 4 con recordatorio en cola, 2 ya recordados, 6 requieren tu llamada", error: null, counts: { orders: 12 }, note: null },
];

const RICH_REPLY = `Esta semana vendiste **$ 4.870.000** en 35 pedidos, un 19 % más que la anterior. NEXO cerró 29 de ellos por WhatsApp.

**Lo más vendido**

| Producto | Unidades | Ventas |
|---|---:|---:|
| Tenis Urban Blanco | 14 | $ 2.646.000 |
| Gorra Classic | 9 | $ 315.000 |
| Medias Pack x3 | 7 | $ 168.000 |

Pendientes de hoy:
- 3 pedidos esperan pago por $ 450.000
- María espera un asesor desde hace 2 h

Puedes revisarlos en [Pedidos](/dashboard/orders) o decirme «recuérdales el pago».`;

/**
 * Local visual fixture only. No authentication, audio capture or AI requests.
 * ?state=idle|listening|thinking|speaking|off  ?reply=1  ?collapsed=1  ?error=1  ?alerts=0  ?files=1  ?jobs=1  ?paste=1
 */
export function NexoDesktopPreview() {
  const params = useSearchParams();
  const demoState = params.get("state");
  const [input, setInput] = useState("");
  const [powered, setPowered] = useState(demoState !== null && demoState !== "off");
  const [voice, setVoice] = useState(false);
  const [reply, setReply] = useState(params.get("reply") === "1" ? RICH_REPLY : "");
  const [proposal, setProposal] = useState<OrderProposal>(() => ({ id: "11111111-1111-4111-8111-111111111111", session_id: "preview", status: "pending", expires_at: new Date(Date.now() + 900000).toISOString(), order_id: null, handoff_id: null,
    snapshot: { customer_id: "22222222-2222-4222-8222-222222222222", customer_name: "Ana · ejemplo visual", currency: "COP", fulfillment: "unassigned", subtotal: 24000, total: 24000,
      items: [{ variant_id: "33333333-3333-4333-8333-333333333333", sku: "CAM-NEG-M", name: "Camiseta · negro · M", qty: 2, unit_price: 12000 }] } }));
  const [now] = useState(Date.now);
  const [settings, setSettings] = useState({ ...defaultSettings, alerts: true, asked: true });
  const [alerts, setAlerts] = useState<ProactiveAlert[]>(() => params.get("alerts") === "0" ? [] : [
    { key: "a", kind: "handoff", text: "Ana · ejemplo espera un asesor", action: "Atender", href: "/dashboard/handoffs", at: new Date(Date.now() - 120000).toISOString() },
    { key: "b", kind: "payment", text: "Luis · ejemplo pagó $ 189.000", action: "Ver pedido", href: "/dashboard/orders", at: new Date(Date.now() - 900000).toISOString() },
  ]);
  const showProposal = Boolean(reply) && params.get("reply") !== "1";
  const busy = demoState === "thinking" || demoState === "speaking";
  const [files, setFiles] = useState<BubbleAttachments["selected"]>(() => params.get("files") === "1" ? [{ id: "f1", name: "inventario-octubre.xlsx", status: "ready" }] : []);
  const [jobs, setJobs] = useState<JobView[]>(() => params.get("jobs") === "1" ? DEMO_JOBS : []);
  const attachments: BubbleAttachments = {
    selected: files, pending: false, error: null, canPaste: params.get("paste") === "1",
    quickActions: [
      { id: "import", label: "Importar al catálogo", onPick: () => { setFiles([]); setJobs(list => [DEMO_JOBS[0], ...list]); } },
      { id: "stock", label: "Actualizar stock o precios", onPick: () => { setFiles([]); setJobs(list => [DEMO_JOBS[0], ...list]); } },
      { id: "read", label: "Leer y resumir", onPick: () => { setFiles([]); setReply(RICH_REPLY); } },
    ],
    onDrop: dropped => setFiles(list => [...list, ...Array.from(dropped).map((file, index) => ({ id: `d${Date.now()}${index}`, name: file.name, status: "ready" as const }))].slice(0, 3)),
    onRemove: id => setFiles(list => list.filter(file => file.id !== id)),
    onPaste: () => {}, onPasteButton: () => setFiles(list => [...list, { id: `p${Date.now()}`, name: "captura.png", status: "ready" as const }].slice(0, 3)),
  };
  return <DesktopBubble hasProposals={showProposal || alerts.length > 0 || jobs.length > 0} unread={alerts.length} latestAlert={alerts[0]?.text ?? null} initialExpanded={params.get("collapsed") !== "1"}
    question={reply ? "¿Cuánto vendí esta semana y qué tengo pendiente?" : null}
    alerts={<ProactiveAlerts alerts={alerts} onOpen={() => setReply("Vista previa: este acceso abre el CRM en la aplicación instalada.")} onDismiss={key => setAlerts(list => list.filter(item => item.key !== key))} onClear={() => setAlerts([])} />}
    jobs={<JobCards jobs={jobs} busy={null} onOpen={() => setReply("Vista previa: este acceso abre el CRM en la aplicación instalada.")} onCancel={id => setJobs(list => list.map(job => job.id === id ? { ...job, status: "canceled", finished_at: new Date().toISOString() } : job))} onApply={id => setJobs(list => list.map(job => job.id === id ? { ...job, applied_at: new Date().toISOString() } : job))} onCopy={() => {}} />}
    attachments={attachments}
    settingsPanel={<><ProactiveSettingsPanel settings={settings} update={patch => setSettings(value => ({ ...value, ...patch }))} systemAvailable={false} /><WatchFolderSettings /></>}
    today={{ sales: 1240000, orders: 7, unpaid: 3, unpaidTotal: 450000, waiting: 1 }}
    operator={showProposal ? <OperatorTask compact busy={false} actions={[{ id: "preview-history", tool: "get_customer_history", kind: "read", status: "completed", label: "Consultar historial del cliente", summary: "Vista previa · historial verificado", navigation: { href: "/dashboard/orders", label: "Pedidos" } }, { id: "preview-proposal", tool: "prepare_repeat_order_proposal", kind: "proposal", status: "approval_required", label: "Preparar pedido como el anterior", summary: "Vista previa · esperando tu decisión" }]} onOpen={() => setReply("Vista previa: este acceso abre el CRM en la aplicación instalada.")} /> : null}
    proposals={showProposal ? <OrderProposals compact state={{ proposals: [proposal], now, busy: null, error: null, verified: true, refresh: async () => {}, decide: async (_id, decision) => setProposal(previous => ({ ...previous, status: decision === "confirm" ? "confirmed" : decision === "cancel" ? "canceled" : "handed_off" })) }} onDecision={() => setPowered(false)} /> : null}
    powered={powered} listening={demoState === "listening"} armed={powered} busy={busy} speaking={demoState === "speaking"} voice={voice} readyToPlay={false}
    activity={demoState === "thinking" ? "Consultando tus pedidos" : demoState === "speaking" ? "Hablando contigo" : demoState === "listening" ? "Te escucho" : powered ? "Aquí para ayudarte" : "Listo cuando tú lo estés"}
    reply={reply} input={input} error={params.get("error") === "1" ? "Vista previa de un aviso: no pude conectar con el CRM." : null}
    onPower={() => setPowered(value => !value)} onMicrophone={() => setPowered(value => !value)} onVoice={() => setVoice(value => !value)} onStop={() => {}} onResume={() => {}} onInput={setInput}
    onSubmit={event => { event.preventDefault(); if (input.trim()) { setReply(RICH_REPLY); setInput(""); } }} />;
}
