"use client";
import { useCallback, useEffect, useState } from "react";
import type { BriefingData } from "@/lib/briefing";

const FAILED = "No pude preparar tu resumen del día.";

/** Facts for today's briefing. Computed in the database; no model call, no credits. */
export function useDailyBriefing(enabled: boolean) {
  const [data, setData] = useState<BriefingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/jarvis/briefing", { cache: "no-store", signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.briefing) throw new Error(body.error ?? FAILED);
    if (!signal?.aborted) { setData(body.briefing as BriefingData); setError(null); }
  }, []);
  const refresh = useCallback(() => load().catch(cause => setError(cause instanceof Error ? cause.message : FAILED)), [load]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const start = () => load(controller.signal).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : FAILED); });
    void start();
    // Keep it current while Zorax stays open (orders and handoffs change during the day).
    const poll = setInterval(() => void refresh(), 10 * 60 * 1000);
    return () => { controller.abort(); clearInterval(poll); };
  }, [enabled, load, refresh]);
  return { data, error, refresh };
}
