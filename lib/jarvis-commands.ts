export const commandPanels = {
  crm: { path: "/dashboard", label: "Resumen" },
  orders: { path: "/dashboard/orders", label: "Pedidos" },
  catalog: { path: "/dashboard/catalog", label: "Catálogo" },
  conversations: { path: "/dashboard/conversations", label: "Conversaciones" },
  handoffs: { path: "/dashboard/handoffs", label: "Handoffs" },
  approvals: { path: "/dashboard/approval", label: "Aprobaciones" },
  agent: { path: "/dashboard/agent", label: "Configuración del agente" },
  whatsapp: { path: "/dashboard/whatsapp", label: "Conexión de WhatsApp" },
  billing: { path: "/dashboard/billing", label: "Planes y pagos" },
  nexo: { path: "/dashboard/jarvis", label: "NEXO" },
} as const;
export type PanelCommand = keyof typeof commandPanels;
export type JarvisCommand = "wake" | "sleep" | PanelCommand;
export function jarvisCommandPanel(command: JarvisCommand | null) {
  return command && command in commandPanels ? commandPanels[command as PanelCommand] : null;
}

/** Only whole commands match: quoted instructions and business messages stay chat. */
export function jarvisCommand(text: string): JarvisCommand | null {
  const command = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[.,¡!¿?;:]/g, " ").trim().replace(/\s+/g, " ")
    .replace(/^(?:nexo|jarvis)\s+/, "").replace(/\s+por favor$/, "");
  if (/^(enciendete|enciende|encender|encender (?:nexo|jarvis)|activate|activar|activar (?:nexo|jarvis)|despierta|inicia)$/.test(command)) return "wake";
  if (/^(apagate|apagar|apagar (?:nexo|jarvis)|desactivate|descansa)$/.test(command)) return "sleep";
  if (/^(abre el crm|abre crm|abrir crm|abrir el crm|ir al crm|muestrame el crm)$/.test(command)) return "crm";
  const panel = command.match(/^(?:abre|abrir|muestrame|ve a|ir a) (?:el |la |los |las |al |a la )?(?:panel de |seccion de )?(.+)$/)?.[1];
  const aliases: Record<string, PanelCommand> = {
    resumen: "crm", dashboard: "crm", pedidos: "orders", catalogo: "catalog", productos: "catalog",
    conversaciones: "conversations", chats: "conversations", handoffs: "handoffs", derivaciones: "handoffs",
    aprobaciones: "approvals", agente: "agent", configuracion: "agent", "configuracion del agente": "agent",
    whatsapp: "whatsapp", wsp: "whatsapp", "conexion de whatsapp": "whatsapp",
    pagos: "billing", planes: "billing", facturacion: "billing", "planes y pagos": "billing", nexo: "nexo",
  };
  if (panel && aliases[panel]) return aliases[panel];
  return null;
}
