import { normalizeOperatorActions, parseOperatorNavigation, type OperatorNavigation } from "./crm-operator";

/** Called only for a newly completed turn, never while restoring chat history. */
export function completedOperatorNavigation(value: unknown): OperatorNavigation | null {
  const actions = normalizeOperatorActions(value);
  const navigation = actions.findLast(action => action.kind === "navigation" && action.tool === "open_crm_panel");
  return navigation?.status === "completed" ? navigation.navigation ?? null : null;
}

/** Older desktop releases support lists but not record detail routes. */
export function desktopPanelFallback(value: unknown): OperatorNavigation | null {
  const navigation = parseOperatorNavigation(value);
  if (!navigation) return null;
  const parts = navigation.href.split("/");
  return parts.length === 4 ? parseOperatorNavigation(parts.slice(0, 3).join("/")) : null;
}
