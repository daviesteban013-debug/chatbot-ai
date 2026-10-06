"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CreditCard, Loader2, ShieldCheck, X } from "lucide-react";
import { money, planTotal, type Plan } from "@/lib/plans";

export function CheckoutModal({ plan, annual, onClose }: { plan: Plan; annual: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [login, setLogin] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", onKey); };
  }, [onClose]);
  async function checkout() {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/stripe/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId: plan.id, annual }) });
      const data = await response.json();
      if (response.status === 401) { setLogin(true); return; }
      if (!response.ok) throw new Error(data.error ?? "No se pudo abrir el pago.");
      const destination = new URL(data.url);
      if (destination.protocol !== "https:" || destination.hostname !== "checkout.stripe.com") throw new Error("Destino de pagos inválido.");
      window.location.assign(destination.href);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo abrir el pago."); }
    finally { setBusy(false); }
  }
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="checkout-title" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="relative w-full max-w-lg rounded-3xl border border-yellow-300/30 bg-zinc-950 p-8 text-white">
      <button onClick={onClose} aria-label="Cerrar" className="absolute right-4 top-4 rounded-lg p-2 text-zinc-400"><X size={20} /></button>
      <p className="landing-eyebrow">Tu siguiente nivel</p><h2 id="checkout-title" className="mt-3 text-3xl tracking-tight">Plan {plan.name}</h2><p className="mt-3 text-sm text-zinc-400">{plan.description}</p>
      <p className="mt-8 text-4xl">{money(planTotal(plan, annual))} <span className="text-sm text-zinc-400">USD / {annual ? "año" : "mes"}</span></p><p className="mt-3 text-sm text-zinc-400">Suscripción con renovación {annual ? "anual" : "mensual"}. Puedes cancelarla desde tu portal de pagos.</p>
      {error && <p role="alert" className="mt-6 text-sm text-red-300">{error} <Link href="/dashboard/billing" className="underline">Abrir planes y pagos</Link></p>}
      {login ? <div className="mt-7 space-y-3"><p className="text-sm text-zinc-400">Primero entra a tu cuenta para asignar el plan a tu negocio.</p><Link href="/login?next=%2Fdashboard%2Fbilling" className="landing-primary w-full">Iniciar sesión</Link><Link href="/signup" className="block text-center text-sm text-yellow-300">Crear mi cuenta gratis</Link></div> : <button onClick={() => void checkout()} disabled={busy} className="landing-primary mt-7 w-full disabled:opacity-50">{busy ? <Loader2 size={18} className="animate-spin" /> : <CreditCard size={18} />}Continuar con Stripe</button>}
      <p className="mt-5 flex gap-2 text-xs text-zinc-500"><ShieldCheck size={16} />Stripe procesa tu tarjeta. Nexo recibe la confirmación del pago.</p>
    </section>
  </div>;
}
