"use client";

import { useEffect, useState } from "react";
import { creditState, type CreditBalance } from "@/lib/credits";

export function CreditBalancePanel({ compact = false, theme = compact ? "dark" : "light" }: { compact?: boolean; theme?: "dark" | "light" }) {
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
  const percent = balance.quotaTokens > 0 ? Math.max(0, Math.min(100, balance.availableTokens / balance.quotaTokens * 100)) : 0;
  const label = percent > 0 && percent < 1 ? "<1 %" : `${Math.floor(percent)} %`;
  const dark = theme === "dark";
  const fill = state === "exhausted" ? "bg-rose-500" : state === "low" ? "bg-amber-500" : "bg-gradient-to-r from-amber-500 to-yellow-300";
  const renewal = new Date(balance.resetsAt).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return <section aria-label="Créditos de tu plan" className={compact ? "my-3 w-full text-xs text-zinc-300" : `my-6 rounded-2xl border p-5 text-sm ${dark ? "border-white/10 bg-zinc-900/60 text-zinc-300" : "border-slate-200 bg-white text-slate-700"}`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><p className="font-medium">{balance.plan === "trial" ? "Créditos de prueba" : "Créditos de tu plan"}</p><p className="mt-1 text-xs opacity-65">{state === "exhausted" ? "Tu cupo disponible se agotó" : "Capacidad disponible para tu agente"}</p></div>
      <strong className={`tabular-nums ${compact ? "text-lg" : "text-3xl"} ${dark ? "text-yellow-300" : "text-slate-950"}`}>{label}</strong>
    </div>
    <div role="progressbar" aria-label="Porcentaje de créditos disponibles" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${label} disponible`} className={`mt-3 h-2.5 overflow-hidden rounded-full ${dark ? "bg-white/10" : "bg-slate-100"}`}><div style={{ width: `${percent}%` }} className={`h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none ${fill}`} /></div>
    <div className="mt-2 flex flex-wrap justify-between gap-1 text-[11px] opacity-65"><span>NEXO + WhatsApp</span><span>Renueva {renewal}</span></div>
    {balance.reservedTokens > 0 && <p className="mt-2 text-xs opacity-70">Parte del cupo está en uso o pendiente de confirmar.</p>}
    {balance.plan === "trial" && !compact && <p className="mt-2 text-xs opacity-70">Estás usando el cupo de prueba. Tu plan se activa con una suscripción vigente.</p>}
    {state !== "ready" && <p role="status" className="mt-2 font-medium">{state === "exhausted" ? "Sin saldo disponible: las nuevas respuestas de IA quedan pausadas." : "Tu cupo está por agotarse: queda un 10 % o menos."}</p>}
  </section>;
}
