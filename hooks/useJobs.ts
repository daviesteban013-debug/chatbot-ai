"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { isActiveJob, jobViewSchema, type JobKind, type JobView } from "@/lib/jobs/types";
import { ACTIVITY_EVENT } from "@/hooks/useNexoActivity";

const FAILED = "No pude cargar los trabajos.";
const ACTIVE_POLL_MS = 5000;
const IDLE_POLL_MS = 60000;
export type StartJobRequest = { kind: JobKind; file_ids?: string[]; note?: string; options?: Record<string, unknown> };

/**
 * Background jobs of this business. Polls every 5 s while something runs, once a minute
 * otherwise, and tells the caller when a job finishes so the bubble can react at once.
 */
export function useJobs(enabled: boolean, { mine = true, sessionId, onFinished }: { mine?: boolean; sessionId?: string; onFinished?(job: JobView): void } = {}) {
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const known = useRef<Map<string, string>>(new Map());
  const finished = useRef(onFinished);
  useEffect(() => { finished.current = onFinished; }, [onFinished]);

  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/jarvis/jobs?limit=20${mine ? "&mine=1" : ""}`, { cache: "no-store", signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? FAILED);
    const parsed = jobViewSchema.array().safeParse(body.jobs ?? []);
    if (signal?.aborted) return;
    const next = parsed.success ? parsed.data : [];
    // A job that was active last time and is not any more: announce it and refresh activity lists.
    let changed = false;
    for (const job of next) {
      const previous = known.current.get(job.id);
      if (previous && ["queued", "running"].includes(previous) && !isActiveJob(job)) { changed = true; finished.current?.(job); }
    }
    known.current = new Map(next.map(job => [job.id, job.status]));
    setJobs(next); setError(null); setLoaded(true);
    if (changed) window.dispatchEvent(new Event(ACTIVITY_EVENT));
  }, [mine]);
  const refresh = useCallback(() => load().catch(cause => setError(cause instanceof Error ? cause.message : FAILED)), [load]);
  const active = jobs.some(isActiveJob);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const start = () => load(controller.signal).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : FAILED); });
    void start();
    const poll = setInterval(() => { if (document.visibilityState === "visible" || active) void refresh(); }, active ? ACTIVE_POLL_MS : IDLE_POLL_MS);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => { controller.abort(); clearInterval(poll); window.removeEventListener("focus", focus); };
  }, [enabled, active, load, refresh]);

  const post = useCallback(async (url: string, payload: unknown) => {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(30000) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? "No pude completar la acción.");
    return body as { job?: JobView; existing?: boolean; applied?: unknown };
  }, []);
  /** Queues a job in this conversation (or in the person's own "Trabajos" session from the CRM). */
  const start = useCallback(async (request: StartJobRequest) => {
    setBusy("start"); setError(null);
    try {
      const body = await post("/api/jarvis/jobs", { ...request, session_id: sessionId ?? "jobs", request_key: crypto.randomUUID() });
      const job = jobViewSchema.safeParse(body.job);
      if (job.success) { known.current.set(job.data.id, job.data.status); setJobs(list => [job.data, ...list.filter(item => item.id !== job.data.id)]); }
      return job.success ? job.data : null;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pude iniciar el trabajo."); return null; }
    finally { setBusy(null); }
  }, [post, sessionId]);
  const act = useCallback(async (id: string, payload: { action: "cancel" } | { action: "apply"; mode?: "merge" | "only_new"; selected?: number[] }) => {
    setBusy(id); setError(null);
    try {
      const body = await post(`/api/jarvis/jobs/${id}`, payload);
      const job = jobViewSchema.safeParse(body.job);
      if (job.success) { known.current.set(job.data.id, job.data.status); setJobs(list => list.map(item => item.id === id ? job.data : item)); }
      window.dispatchEvent(new Event(ACTIVITY_EVENT));
      return body;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pude completar la acción."); return null; }
    finally { setBusy(null); }
  }, [post]);
  const cancel = useCallback((id: string) => act(id, { action: "cancel" }), [act]);
  const apply = useCallback((id: string, options: { mode?: "merge" | "only_new"; selected?: number[] } = {}) => act(id, { action: "apply", ...options }), [act]);
  const detail = useCallback(async (id: string) => {
    const response = await fetch(`/api/jarvis/jobs/${id}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? "No pude cargar el trabajo.");
    return body as { job: JobView; result: Record<string, unknown> | null };
  }, []);
  return { jobs, active, loaded, error, busy, refresh, start, cancel, apply, detail, clearError: () => setError(null) };
}
