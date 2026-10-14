"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { catalogProposalSchema, type CatalogProposal } from "@/lib/catalog-proposals";
import type { ChatMessage } from "@/types/jarvis";

/** Catalog changes prepared by NEXO in this conversation; state always comes from the database. */
export function useCatalogProposals(sessionId: string, messages: ChatMessage[], enabled: boolean) {
  const [proposals, setProposals] = useState<CatalogProposal[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [now, setNow] = useState(Date.now);
  const lock = useRef(false);
  const currentSession = useRef(sessionId);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/jarvis/catalog-proposals?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store", signal });
    if (!response.ok) throw new Error("No pude actualizar los cambios del catálogo.");
    const data = await response.json();
    const parsed = catalogProposalSchema.array().parse(data.proposals);
    if (!signal?.aborted && currentSession.current === sessionId) { setProposals(parsed); setVerified(true); }
  }, [sessionId]);
  const version = messages.filter(message => message.status === "completed").map(message => message.id).join(",");
  useEffect(() => {
    currentSession.current = sessionId;
    const controller = new AbortController();
    const reset = () => { setProposals([]); setError(null); setVerified(false); };
    reset();
    if (enabled) void refresh(controller.signal).catch(() => {});
    return () => controller.abort();
  }, [sessionId, enabled, refresh]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void refresh(controller.signal).catch(() => {});
    return () => controller.abort();
  }, [version, enabled, refresh]);
  useEffect(() => {
    if (!enabled) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const update = () => { void refresh().catch(() => setVerified(false)); };
    window.addEventListener("focus", update);
    return () => { clearInterval(tick); window.removeEventListener("focus", update); };
  }, [enabled, refresh]);
  const decide = async (id: string, decision: "confirm" | "cancel") => {
    if (lock.current || !verified) return;
    lock.current = true; setBusy(id); setError(null);
    try {
      const response = await fetch("/api/jarvis/catalog-proposals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, decision }), signal: AbortSignal.timeout(30000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No pude completar la acción.");
      const proposal = catalogProposalSchema.parse(data.proposal);
      if (currentSession.current === sessionId) setProposals(previous => previous.map(row => row.id === id ? proposal : row));
    } catch (cause) {
      if (currentSession.current === sessionId) {
        setError(cause instanceof Error ? cause.message : "Revisa el estado antes de repetir la acción.");
        // A lost HTTP response might still have committed. Always recover the database state.
        try { await refresh(); } catch { setVerified(false); }
      }
    } finally { lock.current = false; setBusy(null); }
  };
  return { proposals, busy, error, verified, now, decide, refresh: async () => {
    setError(null); try { await refresh(); } catch { setVerified(false); setError("No pude actualizar los cambios del catálogo."); }
  } };
}
