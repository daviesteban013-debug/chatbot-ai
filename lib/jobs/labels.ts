import type { JobKind, JobStatus } from "./types";

export const jobLabels: Record<JobKind, string> = {
  catalog_import: "Importar catálogo desde archivo",
  catalog_update: "Actualizar stock o precios desde archivo",
  collections_review: "Revisión de cobros",
};

/** Short form for cards and notifications. */
export const jobShortLabels: Record<JobKind, string> = {
  catalog_import: "Importar catálogo",
  catalog_update: "Actualizar stock y precios",
  collections_review: "Revisar cobros",
};

export const jobStatusLabels: Record<JobStatus, string> = {
  queued: "En cola", running: "En curso", done: "Terminado", failed: "No terminó", canceled: "Cancelado",
};

/** Why an unpaid order needs a call instead of an automatic reminder. */
export const collectionReasons: Record<string, string> = {
  followups_paused: "Los recordatorios automáticos están apagados",
  payment_method: "Paga contraentrega o con un método sin recordatorio",
  not_whatsapp_confirmed: "El pedido no se confirmó por WhatsApp",
  service_window_closed: "Pasaron más de 24 h desde su último mensaje",
  customer_replied: "El cliente respondió después del pedido",
  customer_opted_out: "El cliente pidió no recibir mensajes",
  conversation_unavailable: "Una persona del equipo tomó la conversación",
  order_no_longer_pending: "El pedido cambió después",
  payment_terms_changed: "Cambiaron las instrucciones de pago",
  delivery_uncertain: "No se pudo confirmar la entrega del recordatorio",
  credentials_unavailable: "Falta configurar WhatsApp",
  not_eligible: "No cumple las condiciones del recordatorio automático",
};

export const collectionStates: Record<string, string> = {
  scheduled: "Recordatorio en cola", reminded: "Ya se le recordó", requires_call: "Requiere tu llamada",
};
