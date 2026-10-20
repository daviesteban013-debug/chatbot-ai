"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { activityItemSchema, type ActivityItem } from "@/lib/activity";

const FAILED = "No pude cargar lo que hizo Zorax.";
/** Fired after any undo so every list on screen refreshes from the database. */
export const ACTIVITY_EVENT = "nexo:activity";

/** What Zorax did on its own; state always comes from the database. */
export function useNexoActivity(enabled: boolean, { limit = 8, version = "" }: { limit?: number; version?: string } = {}) {
  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const lock = useRef(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/jarvis/activity?limit=${limit}`, { cache: "no-store", signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? FAILED);
    const parsed = activityItemSchema.array().parse(body.items ?? []);
    if (!signal?.aborted) { setItems(parsed); setError(null); }
  }, [limit]);
  const refresh = useCallback(() => load().catch(cause => setError(cause instanceof Error ? cause.message : FAILED)), [load]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const start = () => load(controller.signal).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : FAILED); });
    void start();
    const poll = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 60000);
    const update = () => void refresh();
    window.addEventListener(ACTIVITY_EVENT, update);
    window.addEventListener("focus", update);
    return () => { controller.abort(); clearInterval(poll); window.removeEventListener(ACTIVITY_EVENT, update); window.removeEventListener("focus", update); };
  }, [enabled, load, refresh, version]);
  const undo = useCallback(async (logId: string) => {
    if (lock.current) return false;
    lock.current = true; setBusy(logId); setError(null);
    try {
      const response = await fetch("/api/jarvis/activity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ log_id: logId }), signal: AbortSignal.timeout(20000) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "No pude deshacer el cambio.");
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pude deshacer el cambio.");
      return false;
    } finally {
      lock.current = false; setBusy(null);
      // A lost response might still have committed: always re-read, everywhere.
      window.dispatchEvent(new Event(ACTIVITY_EVENT));
    }
  }, []);
  return { items, error, busy, undo, refresh };
}
