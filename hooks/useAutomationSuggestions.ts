"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { suggestionSchema, type AutomationSuggestion } from "@/lib/suggestions";
import type { AutonomyKey } from "@/lib/activity";
import { ACTIVITY_EVENT } from "@/hooks/useNexoActivity";

const FAILED = "No pude revisar las sugerencias.";

/** Automation the owner might turn on; the list always comes from the database. */
export function useAutomationSuggestions(enabled: boolean) {
  const [suggestions, setSuggestions] = useState<AutomationSuggestion[]>([]);
  const [busy, setBusy] = useState<AutonomyKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const lock = useRef(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/jarvis/suggestions", { cache: "no-store", signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? FAILED);
    const parsed = suggestionSchema.array().safeParse(body.suggestions ?? []);
    if (!signal?.aborted) { setSuggestions(parsed.success ? parsed.data : []); setError(null); }
  }, []);
  const refresh = useCallback(() => load().catch(cause => setError(cause instanceof Error ? cause.message : FAILED)), [load]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void load(controller.signal).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : FAILED); });
    const poll = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 600000);
    const update = () => void refresh();
    window.addEventListener(ACTIVITY_EVENT, update);
    return () => { controller.abort(); clearInterval(poll); window.removeEventListener(ACTIVITY_EVENT, update); };
  }, [enabled, load, refresh]);
  /** "enable" turns the switch on in the database; "dismiss" hides the card for 30 days. */
  const decide = useCallback(async (key: AutonomyKey, action: "enable" | "dismiss", enabledText?: string) => {
    if (lock.current) return false;
    lock.current = true; setBusy(key); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/jarvis/suggestions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, action }), signal: AbortSignal.timeout(15000) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No pude guardar tu decisión.");
      setSuggestions(list => list.filter(item => item.key !== key));
      if (action === "enable" && enabledText) setNotice(enabledText);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pude guardar tu decisión.");
      return false;
    } finally { lock.current = false; setBusy(null); }
  }, []);
  return { suggestions, busy, error, notice, decide, refresh, clearNotice: () => setNotice(null) };
}
