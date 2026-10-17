"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { buildBriefing, type BriefingData } from "@/lib/briefing";
import type { SalesMetrics } from "@/lib/sales-metrics";
import {
  buildEvening, buildWeekly, defaultSettings, diffPulse, dueRoutines, isQuiet, parseSettings, pulseSchema, selectAlerts,
  type ProactiveAlert, type ProactiveSettings, type RoutineCard, type RoutineId, type Seen,
} from "@/lib/proactive";

const POLL_MS = 45_000;
const read = <T,>(key: string, fallback: T): T => { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; } };
const write = (key: string, value: unknown) => { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private mode: keep it in memory. */ } };

export type Announcement = { alerts: ProactiveAlert[]; routine: RoutineCard | null; quiet: boolean; settings: ProactiveSettings };

/**
 * NEXO's proactive bubble: watches the business and runs the routines the person chose.
 * Settings live on this computer (like the bubble color); the data comes from the CRM.
 */
export function useProactive(enabled: boolean, userId: string | undefined, onAnnounce: (announcement: Announcement) => void, name?: string) {
  const keys = { settings: `nexo-proactive:${userId}`, seen: `nexo-proactive-seen:${userId}`, routines: `nexo-proactive-routines:${userId}` };
  const [settings, setSettings] = useState<ProactiveSettings>(defaultSettings);
  const [alerts, setAlerts] = useState<ProactiveAlert[]>([]);
  const [routine, setRoutine] = useState<RoutineCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const settingsRef = useRef(settings);
  const announceRef = useRef(onAnnounce);
  const nameRef = useRef(name);
  useEffect(() => { announceRef.current = onAnnounce; nameRef.current = name; }, [onAnnounce, name]);

  useEffect(() => {
    if (!enabled || !userId) return;
    const load = () => { const saved = parseSettings(read(`nexo-proactive:${userId}`, null)); settingsRef.current = saved; setSettings(saved); setReady(true); };
    load();
  }, [enabled, userId]);

  const update = useCallback((patch: Partial<ProactiveSettings>) => {
    const previous = settingsRef.current;
    const next = parseSettings({ ...previous, ...patch, asked: true });
    // Turning alerts on again starts from the current state, never from a stale list.
    if (next.alerts && !previous.alerts) write(`nexo-proactive-seen:${userId}`, null);
    settingsRef.current = next; setSettings(next); write(`nexo-proactive:${userId}`, next);
  }, [userId]);

  const check = useCallback(async (signal?: AbortSignal) => {
    const current = settingsRef.current;
    if (!current.alerts) return;
    const response = await fetch("/api/jarvis/pulse", { cache: "no-store", signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? "No pude revisar tu negocio.");
    const pulse = pulseSchema.parse(body.pulse);
    const { fresh, seen } = diffPulse(pulse, read<Seen | null>(keys.seen, null), Date.now());
    write(keys.seen, seen);
    setError(null);
    const selected = selectAlerts(fresh, current);
    if (!selected.length) return;
    setAlerts(previous => [...selected.reverse(), ...previous].slice(0, 20));
    announceRef.current({ alerts: selected, routine: null, quiet: isQuiet(current, Date.now()), settings: current });
  }, [keys.seen]);

  const runRoutines = useCallback(async () => {
    const current = settingsRef.current, now = Date.now();
    const delivered = read<Partial<Record<RoutineId, string>>>(keys.routines, {});
    for (const id of dueRoutines(current, now, delivered)) {
      // Mark first: a slow or failed request never repeats the routine in a loop.
      delivered[id] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date(now));
      write(keys.routines, delivered);
      try {
        let card: RoutineCard;
        if (id === "weekly") {
          const response = await fetch("/api/jarvis/week", { cache: "no-store" });
          const body = await response.json();
          if (!response.ok) throw new Error();
          card = buildWeekly(body.metrics as SalesMetrics);
        } else {
          const response = await fetch("/api/jarvis/briefing", { cache: "no-store" });
          const body = await response.json();
          if (!response.ok) throw new Error();
          const data = body.briefing as BriefingData;
          if (id === "evening") card = buildEvening(data);
          else { const briefing = buildBriefing(data, { name: nameRef.current }); card = { id, title: "Resumen de la mañana", headline: briefing.headline, items: briefing.items }; }
        }
        setRoutine(card);
        announceRef.current({ alerts: [], routine: card, quiet: false, settings: current });
      } catch { setError("No pude preparar tu rutina. La intentaré mañana a la misma hora."); }
    }
  }, [keys.routines]);

  useEffect(() => {
    if (!enabled || !userId) return;
    const controller = new AbortController();
    const tick = () => { void check(controller.signal).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "No pude revisar tu negocio."); }); void runRoutines(); };
    const start = setTimeout(tick, 1500);
    const poll = setInterval(tick, POLL_MS);
    const focus = () => tick();
    window.addEventListener("focus", focus);
    return () => { controller.abort(); clearTimeout(start); clearInterval(poll); window.removeEventListener("focus", focus); };
  }, [enabled, userId, check, runRoutines, settings.alerts]);

  const dismiss = useCallback((key: string) => setAlerts(previous => previous.filter(alert => alert.key !== key)), []);
  const clear = useCallback(() => setAlerts([]), []);
  const closeRoutine = useCallback(() => setRoutine(null), []);
  /** Look at the business right now (a job just finished) instead of waiting for the next poll. */
  const refresh = useCallback(() => { void check().catch(() => {}); }, [check]);
  return { settings, ready, update, alerts, dismiss, clear, routine, closeRoutine, error, refresh };
}
