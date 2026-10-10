import { parseOperatorNavigation, type OperatorAction } from "@/lib/crm-operator";
import type { ToolResult } from "./tools";

const labels: Record<string, string> = {
  search_customers: "Buscar cliente", get_customer_history: "Revisar historial del cliente",
  list_orders: "Consultar pedidos", get_order_details: "Revisar productos del pedido",
  list_conversations: "Buscar conversaciones", get_conversation: "Leer conversación",
  list_handoffs: "Revisar atención humana", search_catalog: "Consultar catálogo",
  check_stock: "Comprobar existencias", get_business_overview: "Consultar resumen del negocio",
  prepare_order_proposal: "Preparar pedido", prepare_repeat_order_proposal: "Preparar otro pedido",
  open_crm_panel: "Abrir pantalla del CRM", read_attachment: "Leer archivo",
  calculate_sheet_column: "Calcular datos del archivo",
  search_business_memory: "Consultar memoria confirmada", list_crm_tasks: "Consultar tareas",
  propose_business_memory: "Preparar recuerdo para revisión", propose_crm_task: "Preparar tarea para revisión",
};
export function operatorAction(id: string, tool: string, result?: ToolResult): OperatorAction {
  const kind = tool === "open_crm_panel" ? "navigation" : tool.startsWith("prepare_") || tool.startsWith("propose_") ? "proposal" : "read";
  const data = result?.data && typeof result.data === "object" ? result.data as Record<string, unknown> : {};
  const navigation = result?.ok ? parseOperatorNavigation(data.navigation) : null;
  const failed = result && (!result.ok || (kind === "navigation" && (!navigation || data.destination_verified !== true || data.interface_action !== "open_panel")));
  return { id, tool, label: labels[tool] ?? "Comprobar solicitud", kind,
    status: !result ? "running" : failed ? "failed" : kind === "proposal" ? "approval_required" : "completed",
    ...(result ? { summary: failed ? "No pude completar este paso. Revisa la respuesta antes de reintentar."
      : tool.startsWith("propose_") ? "Propuesta preparada. Abre Memoria y tareas → Por confirmar para revisarla y activarla."
      : kind === "proposal" ? "Propuesta verificada. Revisa su tarjeta para confirmar, cancelar o pasarla a una persona."
      : kind === "navigation" ? "Destino verificado; la pantalla se abrirá al terminar la respuesta."
      : typeof data.total_matches === "number" ? `${data.total_matches} coincidencias${data.truncated ? "; mostrando una parte" : ""}.`
      : "Consulta completada con datos del negocio." } : {}),
    ...(navigation && !failed ? { navigation } : {}),
  };
}
