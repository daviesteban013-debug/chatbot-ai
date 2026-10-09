/** Browser-safe descriptions of CRM work. These are evidence, never executable instructions. */
export interface OperatorNavigation {
  href: string;
  label: string;
}

export interface OperatorAction {
  id: string;
  tool: string;
  label: string;
  status: "running" | "completed" | "failed" | "approval_required";
  kind: "read" | "navigation" | "proposal";
  summary?: string;
  navigation?: OperatorNavigation;
}

const PANELS: Record<string, string> = {
  "/dashboard": "Resumen",
  "/dashboard/jarvis": "NEXO",
  "/dashboard/conversations": "Conversaciones",
  "/dashboard/whatsapp": "WhatsApp",
  "/dashboard/orders": "Pedidos",
  "/dashboard/catalog": "Catálogo",
  "/dashboard/handoffs": "Handoffs",
  "/dashboard/approval": "Aprobaciones",
  "/dashboard/agent": "Configuración del agente",
  "/dashboard/billing": "Planes y pagos",
};
const DETAIL_LABELS: Record<string, string> = {
  orders: "Ver pedido",
  conversations: "Ver conversación",
  handoffs: "Ver handoff",
};
const DETAIL_PATH = /^\/dashboard\/(orders|conversations|handoffs)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const MAX_ACTIONS = 64;

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** Canonical internal targets only: no query strings, fragments, encodings or external URLs. */
export function parseOperatorNavigation(value: unknown): OperatorNavigation | null {
  const href = typeof value === "string" ? value : record(value) ? value.href : null;
  if (typeof href !== "string" || href.length > 100) return null;
  if (Object.hasOwn(PANELS, href)) return { href, label: PANELS[href] };
  const detail = href.match(DETAIL_PATH);
  if (!detail || detail[1] !== detail[1].toLowerCase()) return null;
  return { href: `/dashboard/${detail[1]}/${detail[2].toLowerCase()}`, label: DETAIL_LABELS[detail[1]] };
}

function displayText(value: unknown, limit: number): string | undefined {
  if (typeof value !== "string") return;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return text ? text.slice(0, limit) : undefined;
}

/** Revalidate both streamed actions and persisted metadata before showing navigation. */
export function normalizeOperatorActions(value: unknown): OperatorAction[] {
  if (!Array.isArray(value)) return [];
  const actions: OperatorAction[] = [];
  const seen = new Set<string>();
  for (const item of value.slice(0, MAX_ACTIONS)) {
    if (!record(item) || typeof item.id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/.test(item.id)
      || typeof item.tool !== "string" || !/^[a-z][a-z0-9_]{0,99}$/.test(item.tool)
      || !["running", "completed", "failed", "approval_required"].includes(String(item.status))
      || !["read", "navigation", "proposal"].includes(String(item.kind)) || seen.has(item.id)) continue;
    const label = displayText(item.label, 160);
    if (!label) continue;
    const navigation = parseOperatorNavigation(item.navigation);
    // Navigation starts before its destination is verified. Keep that progress (and
    // a failed attempt), but never retain a supplied unsafe or unconfirmed target.
    if (item.kind === "navigation" && (
      (Object.hasOwn(item, "navigation") && item.navigation !== undefined && !navigation)
      || (item.status === "completed" && !navigation)
    )) continue;
    const summary = displayText(item.summary, 1000);
    actions.push({
      id: item.id,
      tool: item.tool,
      label,
      status: item.status as OperatorAction["status"],
      kind: item.kind as OperatorAction["kind"],
      ...(summary ? { summary } : {}),
      ...(navigation ? { navigation } : {}),
    });
    seen.add(item.id);
  }
  return actions;
}

/** Keep stable action IDs and never regress terminal evidence to a late running event. */
export function mergeOperatorActions(previous: readonly OperatorAction[], incoming: unknown): OperatorAction[] {
  const actions = normalizeOperatorActions(previous);
  for (const action of normalizeOperatorActions(incoming)) {
    const index = actions.findIndex(entry => entry.id === action.id);
    if (index < 0) {
      if (actions.length < MAX_ACTIONS) actions.push(action);
      continue;
    }
    const existing = actions[index];
    if (existing.tool !== action.tool || existing.kind !== action.kind) continue;
    if (existing.status !== "running" && action.status === "running") continue;
    // The stream cannot erase work already confirmed by the backend.
    if (existing.status === "completed") continue;
    actions[index] = { ...existing, ...action };
  }
  return actions;
}

/** A disconnected/cancelled stream must never leave an action displayed as executing. */
export function settleOperatorActions(value: unknown, outcome: "completed" | "error" | "cancelled"): OperatorAction[] {
  return normalizeOperatorActions(value).map(action => action.status !== "running" ? action : {
    ...action,
    status: "failed",
    summary: outcome === "cancelled" ? "Solicitud detenida; no se confirmó el resultado de este paso."
      : outcome === "error" ? "La respuesta se interrumpió; no se confirmó el resultado de este paso."
        : "No se recibió la confirmación del resultado de este paso.",
  });
}
