"use client";

import { useEffect, useState } from "react";
import { creditState, formatCredits, type CreditBalance } from "@/lib/credits";

export function CreditBalancePanel({ compact = false }: { compact?: boolean }) {
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let inFlight = false;
    let refreshAgain = false;
    const refresh = async () => {
      if (inFlight) { refreshAgain = true; return; }
      if (document.hidden || !active) return;
      inFlight = true;
      try {
        const response = await fetch("/api/credits", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok || !data.balance) throw new Error("unavailable");
        if (active) { setBalance(data.balance); setUnavailable(false); }
      } catch {
        if (active && !controller.signal.aborted) { setBalance(null); setUnavailable(true); }
      } finally {
        inFlight = false;
        if (refreshAgain && active) { refreshAgain = false; void refresh(); }
      }
    };
    void refresh();
    const interval = setInterval(refresh, 30_000);
    window.addEventListener("jarvis:credits", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { active = false; controller.abort(); clearInterval(interval); window.removeEventListener("jarvis:credits", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);

  if (!balance) return <p className={compact ? "text-xs text-zinc-400" : "mt-5 text-sm text-slate-500"} role="status">{unavailable ? "Saldo de créditos no disponible" : "Consultando créditos…"}</p>;
  const state = creditState(balance);
  const renewal = new Date(balance.resetsAt).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return <section aria-label="Créditos de IA" className={compact ? "my-2 text-xs text-zinc-300" : "my-6 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700"}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p><strong className={compact ? "text-yellow-300" : "text-slate-950"}>{formatCredits(balance.availableTokens)} créditos disponibles</strong><span className="ml-2 opacity-70">de {formatCredits(balance.quotaTokens)}</span></p>
      <span className="opacity-70">Renueva {renewal}</span>
    </div>
    {!compact && <><progress className="mt-3 h-2 w-full accent-yellow-500" value={Math.min(balance.quotaTokens, balance.usedTokens + balance.reservedTokens)} max={Math.max(1, balance.quotaTokens)} aria-label="Créditos consumidos y reservados" /><p className="mt-2 text-xs text-slate-500">Consumidos: {formatCredits(balance.usedTokens)} · Reservados: {formatCredits(balance.reservedTokens)} · 1 crédito = 1.000 tokens de entrada y salida. Jarvis y WhatsApp comparten saldo.</p></>}
    {balance.reservedTokens > 0 && compact && <p className="mt-1 opacity-70">{formatCredits(balance.reservedTokens)} créditos reservados o pendientes de confirmar.</p>}
    {balance.plan === "trial" && <p className="mt-1 opacity-70">Cupo de prueba. El cupo de tu plan requiere una suscripción vigente verificada.</p>}
    {state !== "ready" && <p role="status" className="mt-2 font-medium">{state === "exhausted" ? "Sin saldo disponible: las nuevas respuestas de IA quedan pausadas." : "Te queda menos del 10 % de tus créditos."}</p>}
  </section>;
}
