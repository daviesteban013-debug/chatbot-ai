"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Check, CreditCard, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { plans, money, planTotal } from "@/lib/plans";

type Current = { plan: string; status: string; endsAt: number | null; canceling: boolean };
const statusNames: Record<string,string> = { active: "Activo", trialing: "Periodo de prueba", past_due: "Pago pendiente", unpaid: "Pago no realizado", incomplete: "Pago por completar", paused: "Pausado" };

export function BillingView({ mode, owner, current, pending, canceled, sessionId, unavailable }: {
  mode: "test" | "live"; owner: boolean; current: Current | null; pending: boolean;
  canceled: boolean; sessionId?: string; unavailable: boolean;
}) {
  const [annual, setAnnual] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const checked = useRef<string | null>(null);
  const router = useRouter();

  async function verifyPayment() {
    setBusy("verify"); setNotice(null);
    try {
      const response = await fetch("/api/stripe/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setVerified(true); router.refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "No se pudo verificar el pago."); }
    finally { setBusy(null); }
  }

  useEffect(() => {
    if (!sessionId || !owner || checked.current === sessionId) return;
    checked.current = sessionId;
    // POST verifies the session against Stripe and this business; a success URL
    // alone never grants a plan or writes to the database.
    void verifyPayment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, owner]);

  async function openPayment(action: "checkout" | "portal" | "discard", planId = "esencial") {
    setBusy(action === "checkout" ? planId : action); setNotice(null);
    try {
      const response = await fetch(`/api/stripe/${action === "portal" ? "portal" : "checkout"}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId, annual, action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudo abrir el pago.");
      if (action === "discard") { router.refresh(); setNotice("Pago pendiente descartado. Ya puedes elegir otro plan."); }
      else {
        const destination = new URL(data.url);
        if (destination.protocol !== "https:" || !["checkout.stripe.com", "billing.stripe.com"].includes(destination.hostname)) throw new Error("Destino de pagos inválido.");
        window.location.assign(destination.href);
      }
    } catch (error) { setNotice(error instanceof Error ? error.message : "No se pudo abrir el pago."); setBusy(null); }
    finally { if (action === "discard") setBusy(null); }
  }

  return <div className="min-h-svh bg-[#09090b] px-5 py-8 text-white sm:px-10">
    <div className="mx-auto max-w-6xl">
      <Link href="/dashboard/jarvis" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-yellow-300"><ArrowLeft size={16} />Volver a Jarvis</Link>
      <header className="mt-10 flex flex-wrap items-end justify-between gap-6">
        <div><p className="text-xs uppercase tracking-[.25em] text-yellow-300">Tu siguiente nivel</p><h1 className="mt-3 text-4xl font-medium tracking-tight sm:text-5xl">Planes y pagos.</h1><p className="mt-4 max-w-xl text-sm leading-6 text-zinc-400">Más capacidad para Jarvis. Tu suscripción, tus facturas y tu tarjeta en un solo lugar.</p></div>
        <button onClick={() => void openPayment("portal")} disabled={!owner || !!busy || unavailable} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-zinc-900 px-5 py-3 text-sm disabled:opacity-50"><CreditCard size={17} />Gestionar pagos <ArrowUpRight size={16} /></button>
      </header>
      {mode === "test" && <aside className="mt-8 rounded-2xl border border-yellow-300/25 bg-yellow-300/5 p-5 text-sm"><span className="font-medium text-yellow-300">Modo de prueba · No se cobra dinero real</span><p className="mt-2 text-zinc-400">Tarjeta de prueba: <code className="text-zinc-200">4242 4242 4242 4242</code>. Usa una fecha futura y cualquier CVC de 3 dígitos. No introduzcas una tarjeta real.</p></aside>}
      {unavailable && <p role="alert" className="mt-6 text-red-300">Los pagos no están disponibles en este momento. Recarga la página en unos minutos.</p>}
      {!owner && <p className="mt-6 text-zinc-400">El propietario de tu negocio puede contratar y gestionar la suscripción.</p>}
      {verified && <p role="status" className="mt-6 flex items-center gap-2 text-yellow-300"><Check size={18} />Pago confirmado. Tu plan ya está disponible en Jarvis.</p>}
      {notice && <p role="status" className="mt-6 rounded-xl border border-white/10 p-4 text-sm text-zinc-300">{notice}</p>}
      {sessionId && !verified && owner && <button disabled={!!busy} onClick={() => void verifyPayment()} className="mt-5 text-sm text-yellow-300">{busy === "verify" ? "Verificando pago…" : "Verificar mi pago"}</button>}
      {canceled && !current && <p className="mt-6 text-sm text-zinc-400">Saliste del pago. Puedes retomarlo con el mismo plan o descartar el pago pendiente.</p>}
      {pending && owner && <button onClick={() => void openPayment("discard")} disabled={!!busy} className="mt-5 rounded-xl border border-white/15 px-4 py-2 text-sm text-zinc-300 disabled:opacity-50">Descartar pago pendiente</button>}
      {current && <section className="mt-8 rounded-2xl border border-white/10 bg-zinc-900/60 p-6"><p className="text-xs text-zinc-500">Tu suscripción</p><h2 className="mt-2 text-2xl">{current.plan} <span className="ml-2 text-sm text-yellow-300">{statusNames[current.status] ?? current.status}</span></h2>{current.endsAt && <p className="mt-3 text-sm text-zinc-400">{current.canceling ? "Termina el" : "Próxima renovación:"} {new Date(current.endsAt * 1000).toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}. {current.canceling && "Conservas el acceso hasta esa fecha."}</p>}<p className="mt-2 text-sm text-zinc-500">Cambia tu plan, consulta facturas o cancela desde «Gestionar pagos».</p></section>}
      <div className="mt-10 flex items-center justify-between gap-4"><h2 className="text-xl">Elige el ritmo de tu negocio</h2><div className="flex rounded-xl border border-white/10 bg-zinc-900 p-1" role="group" aria-label="Periodo de facturación">{[false,true].map(value => <button key={String(value)} aria-pressed={annual === value} onClick={() => setAnnual(value)} className={`rounded-lg px-3 py-2 text-xs ${annual === value ? "bg-zinc-700" : "text-zinc-400"}`}>{value ? "Anual −20%" : "Mensual"}</button>)}</div></div>
      <div className="mt-6 grid gap-5 xl:grid-cols-3">{plans.map(plan => <article key={plan.id} className={`flex flex-col rounded-3xl border p-6 ${plan.featured ? "border-yellow-300/40 bg-[linear-gradient(160deg,#facc1510,#18181b_70%)]" : "border-white/10 bg-zinc-900/40"}`}><div className="flex items-center justify-between"><h3 className="text-lg">{plan.name}</h3>{plan.featured && <Sparkles size={18} className="text-yellow-300" />}</div><p className="mt-3 min-h-12 text-sm text-zinc-400">{plan.description}</p><p className="mt-5 text-4xl tracking-tight">{money(annual ? plan.price * .8 : plan.price)}<span className="ml-2 text-xs tracking-normal text-zinc-500">USD / mes</span></p><p className="mt-3 text-xs text-zinc-500">{money(planTotal(plan, annual))} USD {annual ? "cada año, en un pago" : "cada mes"}.</p><ul className="my-7 space-y-3">{plan.features.map(feature => <li key={feature} className="flex gap-2 text-sm text-zinc-300"><Check size={16} className="mt-0.5 shrink-0 text-yellow-300" />{feature}</li>)}</ul><button onClick={() => void openPayment("checkout", plan.id)} disabled={!!busy || !!current || !owner || unavailable} className={`mt-auto flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium disabled:opacity-40 ${plan.featured ? "bg-yellow-300 text-zinc-950" : "border border-white/15 bg-zinc-800"}`}>{busy === plan.id ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}{current ? "Gestiona tu plan en el portal" : mode === "test" ? `Probar ${plan.name}` : `Elegir ${plan.name}`}</button></article>)}</div>
      <p className="mt-8 flex items-center gap-2 text-xs leading-5 text-zinc-500"><ShieldCheck size={16} className="shrink-0" />Stripe procesa tu tarjeta. 1 crédito = 1.000 tokens. Cupos mensuales, incluso con pago anual. Tarifas en USD; cargos de Meta no incluidos.</p>
    </div>
  </div>;
}
