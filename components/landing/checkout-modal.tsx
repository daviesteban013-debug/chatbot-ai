"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CreditCard, Loader2, Repeat, ShieldCheck, X } from "lucide-react";
import { money, planTotal, type Plan } from "@/lib/plans";

type Kind = "subscription" | "one_time";

/** Only Mercado Pago's HTTPS checkout pages may receive the buyer. */
export function mercadoPagoDestination(value: unknown): URL {
  const destination = new URL(String(value));
  const host = destination.hostname;
  if (destination.protocol !== "https:" || !(host === "mercadopago.com.co" || host.endsWith(".mercadopago.com.co") || host === "mercadopago.com" || host.endsWith(".mercadopago.com")))
    throw new Error("Destino de pagos inválido.");
  return destination;
}

export function CheckoutModal({ plan, annual, onClose }: { plan: Plan; annual: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [login, setLogin] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", onKey); };
  }, [onClose]);
  async function checkout(kind: Kind) {
    setBusy(kind); setError(null);
    try {
      const response = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId: plan.id, annual, kind }) });
      const data = await response.json();
      if (response.status === 401) { setLogin(true); return; }
      if (!response.ok) throw new Error(data.error ?? "No se pudo abrir el pago.");
      window.location.assign(mercadoPagoDestination(data.url).href);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo abrir el pago."); }
    finally { setBusy(null); }
  }
  const period = annual ? "año" : "mes";
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="checkout-title" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="relative max-h-[calc(100svh-2rem)] w-full max-w-lg overflow-y-auto rounded-3xl border border-yellow-300/30 bg-zinc-950 p-6 text-white sm:p-8">
      <button onClick={onClose} aria-label="Cerrar" className="absolute right-4 top-4 rounded-lg p-2 text-zinc-400"><X size={20} /></button>
      <p className="landing-eyebrow">Tu siguiente nivel</p><h2 id="checkout-title" className="mt-3 text-3xl tracking-tight">Plan {plan.name}</h2><p className="mt-3 text-sm text-zinc-400">{plan.description}</p>
      <p className="mt-8 text-4xl">{money(planTotal(plan, annual))} <span className="text-sm text-zinc-400">COP / {period}</span></p>
      {error && <p role="alert" className="mt-6 text-sm text-red-300">{error} <Link href="/dashboard/billing" className="underline">Abrir planes y pagos</Link></p>}
      {login ? <div className="mt-7 space-y-3"><p className="text-sm text-zinc-400">Primero entra a tu cuenta para asignar el plan a tu negocio.</p><Link href="/login?next=%2Fdashboard%2Fbilling" className="landing-primary w-full">Iniciar sesión</Link><Link href="/signup" className="block text-center text-sm text-yellow-300">Crear mi cuenta gratis</Link></div>
        : <div className="mt-7 space-y-3">
          <button onClick={() => void checkout("subscription")} disabled={!!busy} className="landing-primary w-full disabled:opacity-50">{busy === "subscription" ? <Loader2 size={18} className="animate-spin" /> : <Repeat size={18} />}Suscripción automática con tarjeta</button>
          <p className="text-xs text-zinc-500">Se cobra solo cada {period}. Puedes cancelarla cuando quieras desde Planes y pagos.</p>
          <button onClick={() => void checkout("one_time")} disabled={!!busy} className="landing-secondary w-full disabled:opacity-50">{busy === "one_time" ? <Loader2 size={18} className="animate-spin" /> : <CreditCard size={18} />}Pagar este {period}: tarjeta, PSE o Efecty</button>
          <p className="text-xs text-zinc-500">Pago único por {annual ? "12 meses" : "1 mes"}. Renuevas desde Planes y pagos cuando quieras; el tiempo se suma al que te quede.</p>
        </div>}
      <p className="mt-6 flex gap-2 text-xs text-zinc-500"><ShieldCheck size={16} className="shrink-0" />Mercado Pago procesa tu pago. Zorax solo recibe la confirmación.</p>
    </section>
  </div>;
}
