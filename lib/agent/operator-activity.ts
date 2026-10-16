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
  propose_catalog_change: "Preparar cambio de catálogo", get_sales_results: "Consultar resultados de ventas",
  start_background_job: "Iniciar trabajo en segundo plano", save_business_fact: "Anotar dato del negocio",
};
const autoLabels: Record<string, string> = {
  propose_catalog_change: "Actualizar catálogo", propose_business_memory: "Guardar recuerdo", propose_crm_task: "Crear tarea", save_business_fact: "Anotar dato del negocio",
};
export function operatorAction(id: string, tool: string, result?: ToolResult): OperatorAction {
  const kind = tool === "open_crm_panel" ? "navigation" : tool.startsWith("prepare_") || tool.startsWith("propose_") || tool === "save_business_fact" ? "proposal" : "read";
  const data = result?.data && typeof result.data === "object" ? result.data as Record<string, unknown> : {};
  const navigation = result?.ok ? parseOperatorNavigation(data.navigation) : null;
  const failed = result && (!result.ok || (kind === "navigation" && (!navigation || data.destination_verified !== true || data.interface_action !== "open_panel")));
  // Low-risk changes the owner allowed NEXO to apply alone: done, logged and undoable.
  const automatic = !failed && kind === "proposal" && data.applied_automatically === true;
  return { id, tool, label: automatic ? autoLabels[tool] ?? labels[tool] ?? "Comprobar solicitud" : labels[tool] ?? "Comprobar solicitud", kind,
    status: !result ? "running" : failed ? "failed" : automatic || data.duplicate === true ? "completed" : kind === "proposal" ? "approval_required" : "completed",
    ...(result ? { summary: failed ? "No pude completar este paso. Revisa la respuesta antes de reintentar."
      : tool === "save_business_fact" ? (data.duplicate === true ? "NEXO ya tenía este dato; no guardó otra copia." : "Anotado como dato del negocio. Puedes deshacerlo en «Lo que hizo NEXO».")
      : automatic ? "Aplicado por NEXO según tu configuración. Puedes deshacerlo."
      : tool === "propose_catalog_change" ? "Cambio preparado. Revisa su tarjeta para confirmarlo o cancelarlo; aún no se aplicó."
      : tool.startsWith("propose_") ? "Propuesta preparada. Abre Memoria y tareas → Por confirmar para revisarla y activarla."
      : kind === "proposal" ? "Propuesta verificada. Revisa su tarjeta para confirmar, cancelar o pasarla a una persona."
      : kind === "navigation" ? "Destino verificado; la pantalla se abrirá al terminar la respuesta."
      : tool === "start_background_job" ? "Trabajo en cola. NEXO te avisará al terminar; puedes seguirlo en Trabajos."
      : typeof data.total_matches === "number" ? `${data.total_matches} coincidencias${data.truncated ? "; mostrando una parte" : ""}.`
      : "Consulta completada con datos del negocio." } : {}),
    ...(navigation && !failed ? { navigation } : {}),
  };
}
