import Link from "next/link";
import { Activity, ArrowUpRight, Clock3, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { Json, TenantMemberRole } from "@/lib/database.types";
import { CancelFollowupButton } from "./sales-followups-form";

type Run = { id: string; conversation_id: string; status: string; tool_calls: Json; created_at: string };
type Followup = { id: string; conversation_id: string; order_id: string; reminder_no: number; due_at: string; status: string; reason: string | null; updated_at: string };
type StateLabel = { text: string; variant: BadgeProps["variant"] };

const runStates: Record<string, StateLabel> = {
  sent: { text: "Respuesta enviada", variant: "success" },
  proposed: { text: "Respuesta preparada", variant: "warning" },
  approved: { text: "Respuesta aprobada", variant: "info" },
  edited: { text: "Respuesta editada", variant: "info" },
  rejected: { text: "Respuesta descartada", variant: "neutral" },
  error: { text: "No se pudo completar", variant: "danger" },
};
const followupStates: Record<string, StateLabel> = {
  queued: { text: "Programado", variant: "warning" },
  claimed: { text: "Preparando", variant: "info" },
  sending: { text: "Enviando", variant: "info" },
  sent: { text: "Enviado", variant: "success" },
  canceled: { text: "Cancelado", variant: "neutral" },
  blocked: { text: "Bloqueado", variant: "warning" },
  unknown: { text: "Envío sin confirmar", variant: "danger" },
  failed: { text: "No enviado", variant: "danger" },
};
const toolLabels: Record<string, string> = {
  search_catalog: "Consultó el catálogo",
  check_stock: "Comprobó disponibilidad",
  quote_order: "Calculó la cotización",
  save_shipping_details: "Guardó los datos de entrega",
  create_draft_order: "Preparó el pedido",
  prepare_order_confirmation: "Preparó el resumen para el cliente",
  confirm_order: "Confirmó el pedido",
  cancel_draft_order: "Canceló el borrador",
  get_sale_state: "Consultó el estado de la venta",
  get_payment_options: "Consultó los medios de pago",
  get_customer_context: "Consultó las preferencias y compras anteriores",
  remember_customer_preference: "Recordó una preferencia del cliente",
  forget_customer_preference: "Olvidó una preferencia del cliente",
  send_product_media: "Envió una imagen del producto",
  escalate_to_human: "Registró una solicitud de atención humana",
};
const reasonLabels: Record<string, string> = {
  customer_replied: "El cliente volvió a escribir; NEXO retoma la conversación en lugar de enviar este recordatorio.",
  customer_opted_out: "El cliente pidió dejar de recibir seguimientos.",
  service_window_closed: "Pasaron 24 horas desde el último mensaje del cliente. Se necesita una plantilla aprobada para retomar el contacto.",
  conversation_unavailable: "La conversación ya no está disponible para este seguimiento.",
  order_no_longer_pending: "El pedido ya no cumple las condiciones de un pago pendiente.",
  autonomy_disabled: "El agente ya no tiene activado el modo autónomo.",
  followups_paused: "El negocio desactivó los seguimientos automáticos.",
  payment_terms_changed: "Cambiaron las instrucciones de pago; este recordatorio ya no usa las condiciones actuales.",
  credentials_unavailable: "No se pudo usar la conexión de WhatsApp de este negocio. Revisa su configuración.",
  invalid_snapshot: "No se pudo validar la información del pedido para este recordatorio.",
  message_too_long: "Las instrucciones de pago son demasiado largas para este recordatorio.",
  channel_not_configured: "La conexión de WhatsApp no está lista para enviar este recordatorio.",
  provider_rejected: "WhatsApp rechazó este envío. Revisa la conexión antes de retomar el seguimiento.",
  rate_limited: "La conexión de WhatsApp alcanzó un límite temporal de envíos.",
  canceled_by_user: "Un miembro del equipo canceló este recordatorio.",
  lease_expired: "La preparación del recordatorio se interrumpió y necesita revisar su estado.",
  previous_reminder_unavailable: "El recordatorio anterior todavía no permite continuar con este seguimiento.",
};

function object(value: Json | undefined): Record<string, Json | undefined> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function actions(calls: Json): string[] {
  if (!Array.isArray(calls)) return [];
  const labels = new Set<string>();
  for (const value of calls) {
    const call = object(value);
    const name = call && typeof call.name === "string" ? call.name : "";
    const result = call ? object(call.result) : null;
    if (Object.hasOwn(toolLabels, name)) labels.add(result?.ok === true ? toolLabels[name] : `${toolLabels[name]} · sin completar`);
  }
  return [...labels];
}

function reasonText(followup: Followup): string {
  if (followup.status === "unknown") return "No se puede asegurar si WhatsApp aceptó el mensaje. No se reenvía automáticamente para evitar duplicados.";
  if (followup.reason && Object.hasOwn(reasonLabels, followup.reason)) return reasonLabels[followup.reason];
  if (followup.status === "failed") return "No se pudo completar este envío. Revisa la conexión de WhatsApp antes de retomar el seguimiento.";
  if (followup.status === "blocked") return "El envío no cumple las condiciones actuales. Revisa la ventana de 24 horas, la conexión de WhatsApp y el estado del pedido.";
  if (followup.status === "canceled") return "Este recordatorio ya no se enviará. El pago y el pedido conservan su estado real.";
  if (followup.status === "sent") return "WhatsApp aceptó el recordatorio. Esto no confirma que el cliente haya pagado.";
  if (followup.status === "sending") return "El envío ya comenzó y no puede cancelarse desde aquí.";
  return "NEXO comprobará el pedido y la conversación antes de enviar el recordatorio.";
}

function eventTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(date);
}

export async function SalesActivity({ tenantId, role, conversationId }: {
  tenantId: string;
  role: TenantMemberRole;
  conversationId?: string;
}) {
  const supabase = await createClient();
  let runQuery = supabase.from("agent_runs").select("id, conversation_id, status, tool_calls, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(25);
  let followupQuery = supabase.from("nexo_sales_followups").select("id, conversation_id, order_id, reminder_no, due_at, status, reason, updated_at").eq("tenant_id", tenantId).order("updated_at", { ascending: false }).limit(25);
  if (conversationId) {
    runQuery = runQuery.eq("conversation_id", conversationId);
    followupQuery = followupQuery.eq("conversation_id", conversationId);
  }
  const [runsResult, followupsResult] = await Promise.all([runQuery, followupQuery]);
  const events: Array<{ key: string; time: string; run?: Run; followup?: Followup }> = [
    ...(runsResult.error ? [] : (runsResult.data ?? [])).map(run => ({ key: `run-${run.id}`, time: run.created_at, run })),
    ...(followupsResult.error ? [] : (followupsResult.data ?? [])).map(followup => ({ key: `followup-${followup.id}`, time: followup.updated_at, followup })),
  ].sort((a, b) => Date.parse(b.time) - Date.parse(a.time)).slice(0, 25);
  const loadFailed = Boolean(runsResult.error || followupsResult.error);

  return <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
    <div className="flex items-center gap-2">
      <Activity className="size-4 text-slate-500" />
      <h2 className="text-sm font-semibold text-slate-900">Actividad de NEXO</h2>
    </div>
    <p className="mt-2 text-sm leading-6 text-slate-500">{conversationId ? "Acciones y seguimientos de esta conversación." : "Últimas 25 respuestas y seguimientos de este negocio."} Horas de Colombia.</p>
    {loadFailed && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm leading-6 text-rose-700">No se pudo cargar {runsResult.error && followupsResult.error ? "la actividad ni los seguimientos" : runsResult.error ? "la actividad de respuestas" : "los seguimientos"}. La lista puede estar incompleta. Actualiza esta página para reintentarlo.</p>}
    {events.length ? <ol className="mt-5 space-y-3">
      {events.map(event => {
        const state = event.run ? runStates[event.run.status] : followupStates[event.followup!.status];
        const labels = event.run ? actions(event.run.tool_calls) : [];
        const conversation = event.run?.conversation_id ?? event.followup?.conversation_id;
        return <li key={event.key} className="rounded-xl border border-slate-100 bg-slate-50/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800">{event.followup ? `Recordatorio de pago ${event.followup.reminder_no}` : "Atención al cliente"}</p>
            <Badge variant={state?.variant ?? "neutral"}>{state?.text ?? "Estado no disponible"}</Badge>
          </div>
          <time dateTime={event.time} className="mt-2 block text-xs text-slate-500">{eventTime(event.time)}</time>
          {event.run && labels.length > 0 ? <ul className="mt-3 space-y-1 text-xs leading-5 text-slate-600">{labels.slice(0, 4).map(label => <li key={label}>• {label}</li>)}{labels.length > 4 && <li>Y {labels.length - 4} acciones más.</li>}</ul> : null}
          {event.run?.status === "error" && <p className="mt-2 text-xs leading-5 text-rose-700">Esta atención encontró un bloqueo. Revisa la conversación y el pedido antes de reintentar.</p>}
          {event.followup && <>
            <p className="mt-3 text-xs leading-5 text-slate-600">{reasonText(event.followup)}</p>
            {["queued", "claimed"].includes(event.followup.status) && <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><Clock3 className="size-3.5" /> Programado para {eventTime(event.followup.due_at)}</p>}
          </>}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-slate-700">
            {conversation && !conversationId && <Link className="inline-flex items-center gap-1 hover:text-slate-950" href={`/dashboard/conversations/${conversation}`}>Conversación <ArrowUpRight className="size-3.5" /></Link>}
            {event.followup && <Link className="inline-flex items-center gap-1 hover:text-slate-950" href={`/dashboard/orders/${event.followup.order_id}`}>Pedido <ArrowUpRight className="size-3.5" /></Link>}
          </div>
          {event.followup && ["queued", "claimed"].includes(event.followup.status) && role !== "viewer" && <CancelFollowupButton id={event.followup.id} />}
        </li>;
      })}
    </ol> : !loadFailed ? <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-500">Todavía no hay acciones registradas. Aquí aparecerán las respuestas y los recordatorios cuando NEXO atienda a tus clientes.</p> : null}
    <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 size-3.5 shrink-0" /> Los pagos siguen pendientes hasta verificarse con el proveedor o el banco. La conexión de verificación de cobros aún debe configurarse.</p>
  </section>;
}
