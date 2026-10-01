import type {
  ConversationStatus,
  HandoffPriority,
  HandoffReason,
  HandoffStatus,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  RunStatus,
} from "@/lib/database.types";

/**
 * Etiquetas en español y variantes de `Badge` para los enums del esquema.
 * Centralizado para que todas las vistas del panel muestren los mismos
 * textos y colores por estado.
 */

export type BadgeVariant = "success" | "warning" | "danger" | "neutral" | "info";

export const orderStatusLabel: Record<OrderStatus, string> = {
  draft: "Borrador",
  pending_approval: "Pendiente de aprobación",
  pending_payment: "Pendiente de pago",
  confirmed: "Confirmado",
  shipped: "Enviado",
  delivered: "Entregado",
  canceled: "Cancelado",
};

export const orderStatusVariant: Record<OrderStatus, BadgeVariant> = {
  draft: "neutral",
  pending_approval: "warning",
  pending_payment: "info",
  confirmed: "success",
  shipped: "info",
  delivered: "success",
  canceled: "danger",
};

export const orderTypeLabel: Record<OrderType, string> = {
  retail: "Minorista",
  wholesale: "Mayorista",
};

export const conversationStatusLabel: Record<ConversationStatus, string> = {
  open: "Abierta",
  handoff: "En handoff",
  closed: "Cerrada",
};

export const conversationStatusVariant: Record<ConversationStatus, BadgeVariant> = {
  open: "success",
  handoff: "warning",
  closed: "neutral",
};

export const handoffReasonLabel: Record<HandoffReason, string> = {
  reclamo: "Reclamo",
  negociacion: "Negociación",
  incertidumbre: "Incertidumbre del agente",
  fuera_de_catalogo: "Fuera de catálogo",
  solicitud_cliente: "Solicitud del cliente",
  pedido_alto_valor: "Pedido de alto valor",
  otro: "Otro",
};

export const handoffStatusLabel: Record<HandoffStatus, string> = {
  open: "Abierto",
  taken: "Tomado",
  resolved: "Resuelto",
};

export const handoffStatusVariant: Record<HandoffStatus, BadgeVariant> = {
  open: "danger",
  taken: "warning",
  resolved: "success",
};

export const handoffPriorityLabel: Record<HandoffPriority, string> = {
  low: "Baja",
  normal: "Normal",
  high: "Alta",
};

export const handoffPriorityVariant: Record<HandoffPriority, BadgeVariant> = {
  low: "neutral",
  normal: "info",
  high: "danger",
};

export const paymentMethodLabel: Record<PaymentMethod, string> = {
  contraentrega: "Contraentrega",
  transferencia: "Transferencia",
  nequi: "Nequi",
  daviplata: "Daviplata",
  bancolombia: "Bancolombia",
  pse: "PSE",
  otro: "Otro",
};

export const paymentStatusLabel: Record<PaymentStatus, string> = {
  pending: "Pendiente",
  paid: "Pagado",
  failed: "Fallido",
  refunded: "Reembolsado",
};

export const paymentStatusVariant: Record<PaymentStatus, BadgeVariant> = {
  pending: "warning",
  paid: "success",
  failed: "danger",
  refunded: "neutral",
};

export const runStatusLabel: Record<RunStatus, string> = {
  sent: "Enviado",
  proposed: "Propuesto",
  approved: "Aprobado",
  edited: "Editado",
  rejected: "Rechazado",
  error: "Error",
};

export const runStatusVariant: Record<RunStatus, BadgeVariant> = {
  sent: "success",
  proposed: "warning",
  approved: "success",
  edited: "info",
  rejected: "neutral",
  error: "danger",
};

export const agentModeLabel: Record<string, string> = {
  shadow: "Sombra (solo observa)",
  copilot: "Copiloto (propone respuestas)",
  autonomous: "Autónomo (responde solo)",
};

/**
 * Normaliza un join de Supabase que puede venir como objeto, arreglo o null
 * (la inferencia de PostgREST varía según la relación).
 */
export function singleJoin<T>(joined: T | T[] | null | undefined): T | null {
  if (Array.isArray(joined)) return joined[0] ?? null;
  return joined ?? null;
}
