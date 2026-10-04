"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, CreditCard } from "lucide-react";
import { plans, money, type Plan } from "@/lib/plans";
import { CheckoutModal } from "./checkout-modal";

export function Pricing() {
  const [annual, setAnnual] = useState(false);
  const [selected, setSelected] = useState<Plan | null>(null);
  return (
    <section id="precios" className="landing-section" aria-labelledby="pricing-title">
      <div className="flex flex-wrap items-end justify-between gap-7"><div><p className="landing-eyebrow">Un asistente. Un siguiente nivel.</p><h2 id="pricing-title" className="landing-title">Elige cómo quieres crecer.</h2><p className="landing-copy">Empieza explorando Nexo gratis. Conoce la propuesta para tu negocio antes de contratar.</p></div>
        <div className="flex rounded-xl border border-white/10 bg-zinc-900 p-1" role="group" aria-label="Periodo de facturación">
          <button type="button" aria-pressed={!annual} onClick={() => setAnnual(false)} className={`rounded-lg px-4 py-2.5 text-xs font-medium ${!annual ? "bg-zinc-700 text-white" : "text-zinc-400"}`}>Mensual</button>
          <button type="button" aria-pressed={annual} onClick={() => setAnnual(true)} className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-medium ${annual ? "bg-zinc-700 text-white" : "text-zinc-400"}`}>Anual <span className="text-[10px] text-yellow-300">−20%</span></button>
        </div>
      </div>
      <p className="mt-6 text-xs leading-relaxed text-zinc-500">Tarifas en USD, no una oferta comercial vigente. Impuestos y cargos de Meta no incluidos; condiciones y límites por confirmar antes de contratar.</p>
      <div className="mt-8 grid gap-5 lg:grid-cols-3">{plans.map((plan) => {
        const monthly = annual ? plan.price * 0.8 : plan.price;
        return <article key={plan.name} className={`cyber-card relative flex flex-col overflow-hidden rounded-3xl border p-6 backdrop-blur-xl sm:p-8 ${plan.featured ? "border-yellow-300/60 bg-[linear-gradient(160deg,#facc1518,#18181b_60%)] shadow-[0_0_70px_rgba(250,204,21,0.16)] ring-1 ring-yellow-400/30" : "border-white/10 bg-zinc-900/40"}`}>
          {plan.featured && <div className="scanner-line opacity-40" />}
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-medium">{plan.name}</h3>{plan.featured && <span className="rounded-full bg-yellow-300 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-950">Recomendado</span>}</div>
          <p className="mt-3 min-h-10 text-sm leading-relaxed text-zinc-400">{plan.description}</p>
          <div className="mt-8" aria-live="polite" aria-atomic="true"><p className="text-4xl font-medium tracking-[-0.05em] tabular-nums">{money(monthly)} <span className="text-xs font-normal tracking-normal text-zinc-500">USD / mes</span></p><p className="mt-3 min-h-10 text-xs leading-relaxed text-zinc-500">{annual ? `${money(monthly * 12)} USD al año, en un solo pago. Ahorras ${money(plan.price * 12 * 0.2)} USD.` : `${money(plan.price)} USD facturados cada mes.`}</p></div>
          <button type="button" onClick={() => setSelected(plan)} aria-label={`Contratar el plan ${plan.name}`} className={`${plan.featured ? "landing-primary" : "landing-secondary"} mt-6 w-full`}><CreditCard className="size-4" />Contratar plan <ArrowRight className="size-4" /></button>
          <Link href="/signup" aria-label={`Empieza gratis con ${plan.name}`} className="mt-3 block text-center text-xs text-zinc-500 transition hover:text-yellow-300">o explora gratis primero</Link>
          <ul className="mt-8 space-y-4 border-t border-white/10 pt-6">{plan.features.map((feature) => <li key={feature} className="flex items-start gap-3 text-sm text-zinc-300"><Check className="mt-0.5 size-4 shrink-0 text-yellow-300" />{feature}</li>)}</ul>
        </article>;
      })}</div>
      <p className="mt-6 text-center text-xs text-zinc-500">El registro gratuito no cobra un plan. Sin tarjeta para explorar.</p>
      {selected && <CheckoutModal plan={selected} annual={annual} onClose={() => setSelected(null)} />}
    </section>
  );
}
