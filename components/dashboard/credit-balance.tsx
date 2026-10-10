"use client";

import { useEffect, useState } from "react";
import type { CreditBalance, MessageBalance } from "@/lib/credits";

export function CreditBalancePanel({ compact = false, theme = compact ? "dark" : "light" }: { compact?: boolean; theme?: "dark" | "light" }) {
  const [balance, setBalance] = useState<(MessageBalance & { whatsappBalance?: CreditBalance | null }) | null>(null);
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
        if (active) { setBalance({ ...data.balance, whatsappBalance: data.whatsappBalance }); setUnavailable(false); }
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

  if (!balance) return <p className={compact ? "text-xs text-zinc-400" : "mt-5 text-sm text-slate-500"} role="status">{unavailable ? "Cupo de mensajes no disponible" : "Consultando mensajes…"}</p>;
  const state = balance.availableMessages <= 0 ? "exhausted" : balance.availableMessages <= balance.quotaMessages * 0.1 ? "low" : "ready";
  const percent = balance.quotaMessages > 0 ? Math.max(0, Math.min(100, balance.availableMessages / balance.quotaMessages * 100)) : 0;
  const label = percent > 0 && percent < 1 ? "<1 %" : `${Math.floor(percent)} %`;
  const dark = theme === "dark";
  const fill = state === "exhausted" ? "bg-rose-500" : state === "low" ? "bg-amber-500" : "bg-gradient-to-r from-amber-500 to-yellow-300";
  const renewal = balance.resetsAt ? new Date(balance.resetsAt).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;
  const planName = ({ trial: "Prueba", esencial: "Esencial", crecimiento: "Crecimiento", equipo: "Equipo" } as Record<string, string>)[balance.plan] ?? balance.plan;
  const whatsapp = balance.whatsappBalance;
  const whatsappPercent = whatsapp && whatsapp.quotaTokens > 0 ? Math.max(0, Math.min(100, whatsapp.availableTokens / whatsapp.quotaTokens * 100)) : 0;
  return <section aria-label="Mensajes de NEXO" className={compact ? "my-3 w-full text-xs text-zinc-300" : `my-6 rounded-2xl border p-5 text-sm ${dark ? "border-white/10 bg-zinc-900/60 text-zinc-300" : "border-slate-200 bg-white text-slate-700"}`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><p className="font-medium">NEXO · {planName}</p><p className="mt-1 text-xs opacity-65">{balance.businessName || "Tu cuenta"} · {balance.quotaMessages} mensajes / {balance.windowHours} horas</p></div>
      <strong className={`tabular-nums ${compact ? "text-lg" : "text-3xl"} ${dark ? "text-yellow-300" : "text-slate-950"}`}>{label}</strong>
    </div>
    <div role="progressbar" aria-label="Porcentaje de mensajes disponibles" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${label} disponible`} className={`mt-3 h-2.5 overflow-hidden rounded-full ${dark ? "bg-white/10" : "bg-slate-100"}`}><div style={{ width: `${percent}%` }} className={`h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none ${fill}`} /></div>
    <div className="mt-2 flex flex-wrap justify-between gap-1 text-[11px] opacity-65"><span>{balance.availableMessages} mensajes disponibles</span><span>{renewal ? `Recuperas espacio ${renewal} · Colombia` : "Todo el cupo disponible"}</span></div>
    <p className="mt-2 text-xs opacity-70">Cada mensaje recupera su espacio tras 3 horas. Las consultas internas no gastan mensajes extra.</p>
    {!compact && <p className="mt-1 text-xs opacity-60">Los reintentos excesivos pueden activar una pausa temporal de protección.</p>}
    {balance.reservedMessages > 0 && <p className="mt-2 text-xs opacity-70">Parte del cupo está en uso. Si la respuesta falla, el mensaje se devuelve.</p>}
    {balance.plan === "trial" && <p className="mt-2 text-xs opacity-70">Cupo de prueba de este negocio. Un plan contratado en otro negocio no se comparte aquí. <a href="/dashboard/billing" className="underline">Revisar plan</a></p>}
    {state !== "ready" && <p role="status" className="mt-2 font-medium">{state === "exhausted" ? "Sin mensajes disponibles por ahora. Tu CRM sigue disponible y el cupo se recupera automáticamente." : "Tu cupo está por agotarse: queda un 10 % o menos."}</p>}
    {!compact && whatsapp && <div className="mt-4 border-t border-current/10 pt-3 text-xs"><div className="flex justify-between"><span>WhatsApp · cupo mensual separado</span><strong>{whatsappPercent > 0 && whatsappPercent < 1 ? "<1" : Math.floor(whatsappPercent)} %</strong></div><div role="progressbar" aria-label="Cupo de WhatsApp disponible" aria-valuemin={0} aria-valuemax={100} aria-valuenow={whatsappPercent} className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-500/15"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${whatsappPercent}%` }} /></div></div>}
  </section>;
}
