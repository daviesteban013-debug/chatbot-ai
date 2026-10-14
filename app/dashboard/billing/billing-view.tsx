"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, CreditCard, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { plans, money, planTotal, type Plan } from "@/lib/plans";
import { CreditBalancePanel } from "@/components/dashboard/credit-balance";
import { CheckoutModal } from "@/components/landing/checkout-modal";

type Current = { planId: string; plan: string; activeUntil: string; annual: boolean };
type Returned = { paymentId?: string; preapprovalId?: string };
const subscriptionNames: Record<string, string> = { authorized: "Activa", pending: "Por completar", paused: "Pausada", cancelled: "Cancelada", canceled: "Cancelada" };
const date = (value: string) => new Date(value).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "long", year: "numeric" });

export function BillingView({ mode, owner, current, subscription, pendingPayment, canceled, returned, unavailable }: {
  mode: "test" | "live"; owner: boolean; current: Current | null; subscription: { status: string } | null;
  pendingPayment: boolean; canceled: boolean; returned: Returned | null; unavailable: boolean;
}) {
  const [annual, setAnnual] = useState(false);
  const [selected, setSelected] = useState<Plan | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const checked = useRef<string | null>(null);
  const router = useRouter();
  const subscribed = subscription?.status === "authorized";

  async function verifyPayment() {
    if (!returned) return;
    setBusy("verify"); setNotice(null);
    try {
      const response = await fetch("/api/billing/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(returned) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setVerified(true); router.refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "No se pudo verificar el pago."); }
    finally { setBusy(null); }
  }

  useEffect(() => {
    const key = returned ? `${returned.paymentId}:${returned.preapprovalId}` : null;
    if (!key || !owner || checked.current === key) return;
    checked.current = key;
    // The server re-reads the payment from Mercado Pago and checks it belongs to this
    // business; the return URL alone never grants a plan.
    void verifyPayment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returned, owner]);

  async function cancel() {
    if (!window.confirm("¿Cancelar la suscripción automática? Conservas tu plan hasta el final del periodo pagado.")) return;
    setBusy("cancel"); setNotice(null);
    try {
      const response = await fetch("/api/billing/subscription", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setNotice("Suscripción cancelada. No se harán más cobros automáticos."); router.refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "No se pudo cancelar la suscripción."); }
    finally { setBusy(null); }
  }

  function action(plan: Plan): { label: string; disabled: boolean } {
    if (!owner || unavailable) return { label: `Elegir ${plan.name}`, disabled: true };
    if (subscribed) return { label: current?.planId === plan.id ? "Tu plan actual" : "Cancela tu suscripción para cambiar", disabled: true };
    if (current && current.planId !== plan.id) return { label: "Disponible al terminar tu plan", disabled: true };
    if (current) return { label: `Renovar ${plan.name}`, disabled: false };
    return { label: mode === "test" ? `Probar ${plan.name}` : `Elegir ${plan.name}`, disabled: false };
  }

  return <div className="min-h-svh bg-[#09090b] px-5 py-8 text-white sm:px-10">
    <div className="mx-auto max-w-6xl">
      <Link href="/dashboard/jarvis" className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-yellow-300"><ArrowLeft size={16} />Volver a NEXO</Link>
      <header className="mt-10"><p className="text-xs uppercase tracking-[.25em] text-yellow-300">Tu siguiente nivel</p><h1 className="mt-3 text-4xl font-medium tracking-tight sm:text-5xl">Planes y pagos.</h1><p className="mt-4 max-w-xl text-sm leading-6 text-zinc-400">Más capacidad para NEXO. Paga con suscripción automática o por periodo con tarjeta, PSE o Efecty.</p></header>
      {mode === "test" && <aside className="mt-8 rounded-2xl border border-yellow-300/25 bg-yellow-300/5 p-5 text-sm"><span className="font-medium text-yellow-300">Modo de prueba · No se cobra dinero real</span><p className="mt-2 text-zinc-400">Paga con la cuenta compradora de prueba de Mercado Pago. Tarjeta Visa <code className="text-zinc-200">4013 5406 8274 6260</code>, CVV <code className="text-zinc-200">123</code>, vence <code className="text-zinc-200">11/30</code>, titular <code className="text-zinc-200">APRO</code>. No introduzcas una tarjeta real.</p></aside>}
      {unavailable && <p role="alert" className="mt-6 text-red-300">Los pagos no están disponibles en este momento. Recarga la página en unos minutos.</p>}
      {!owner && <p className="mt-6 text-zinc-400">El propietario de tu negocio puede contratar y gestionar el plan.</p>}
      {verified && <p role="status" className="mt-6 flex items-center gap-2 text-yellow-300"><Check size={18} />Pago recibido. Si ya fue aprobado, tu plan está disponible en NEXO.</p>}
      {notice && <p role="status" className="mt-6 rounded-xl border border-white/10 p-4 text-sm text-zinc-300">{notice}</p>}
      {returned && !verified && owner && <button disabled={!!busy} onClick={() => void verifyPayment()} className="mt-5 text-sm text-yellow-300">{busy === "verify" ? "Verificando pago…" : "Verificar mi pago"}</button>}
      {canceled && !current && <p className="mt-6 text-sm text-zinc-400">Saliste del pago sin completarlo. Puedes intentarlo de nuevo cuando quieras.</p>}
      {pendingPayment && <p className="mt-6 rounded-xl border border-white/10 p-4 text-sm text-zinc-300">Tienes un pago en proceso (por ejemplo, Efecty o PSE). Tu plan se activa en cuanto Mercado Pago lo apruebe; no vuelvas a pagar.</p>}
      {(current || subscription) && <section className="mt-8 rounded-2xl border border-white/10 bg-zinc-900/60 p-6">
        <p className="text-xs text-zinc-500">Tu plan</p>
        <h2 className="mt-2 text-2xl">{current?.plan ?? "Sin plan vigente"}{subscription && <span className="ml-2 text-sm text-yellow-300">Suscripción {subscriptionNames[subscription.status] ?? subscription.status}</span>}</h2>
        {current && <p className="mt-3 text-sm text-zinc-400">{subscribed ? "Se renueva automáticamente. Pagado hasta" : "Vigente hasta"} el {date(current.activeUntil)}.</p>}
        {subscribed && owner && <button onClick={() => void cancel()} disabled={!!busy} className="mt-4 rounded-xl border border-white/15 px-4 py-2 text-sm text-zinc-300 disabled:opacity-50">{busy === "cancel" ? "Cancelando…" : "Cancelar suscripción automática"}</button>}
      </section>}
      <CreditBalancePanel theme="dark" />
      <div className="mt-10 flex items-center justify-between gap-4"><h2 className="text-xl">Elige el ritmo de tu negocio</h2><div className="flex rounded-xl border border-white/10 bg-zinc-900 p-1" role="group" aria-label="Periodo de facturación">{[false,true].map(value => <button key={String(value)} aria-pressed={annual === value} onClick={() => setAnnual(value)} className={`rounded-lg px-3 py-2 text-xs ${annual === value ? "bg-zinc-700" : "text-zinc-400"}`}>{value ? "Anual −20%" : "Mensual"}</button>)}</div></div>
      <div className="mt-6 grid gap-5 xl:grid-cols-3">{plans.map(plan => { const { label, disabled } = action(plan); return <article key={plan.id} className={`flex flex-col rounded-3xl border p-6 ${plan.featured ? "border-yellow-300/40 bg-[linear-gradient(160deg,#facc1510,#18181b_70%)]" : "border-white/10 bg-zinc-900/40"}`}><div className="flex items-center justify-between"><h3 className="text-lg">{plan.name}</h3>{plan.featured && <Sparkles size={18} className="text-yellow-300" />}</div><p className="mt-3 min-h-12 text-sm text-zinc-400">{plan.description}</p><p className="mt-5 text-4xl tracking-tight">{money(annual ? plan.price * .8 : plan.price)}<span className="ml-2 text-xs tracking-normal text-zinc-500">COP / mes</span></p><p className="mt-3 text-xs text-zinc-500">{money(planTotal(plan, annual))} COP {annual ? "cada año, en un pago" : "cada mes"}.</p><ul className="my-7 space-y-3">{plan.features.map(feature => <li key={feature} className="flex gap-2 text-sm text-zinc-300"><Check size={16} className="mt-0.5 shrink-0 text-yellow-300" />{feature}</li>)}</ul><button onClick={() => setSelected(plan)} disabled={!!busy || disabled} className={`mt-auto flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium disabled:opacity-40 ${plan.featured ? "bg-yellow-300 text-zinc-950" : "border border-white/15 bg-zinc-800"}`}>{busy === plan.id ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}{label}</button></article>; })}</div>
      <p className="mt-8 flex items-center gap-2 text-xs leading-5 text-zinc-500"><ShieldCheck size={16} className="shrink-0" />Mercado Pago procesa tu pago. NEXO recupera cada mensaje tras 3 horas, con cupo compartido por negocio. WhatsApp conserva créditos mensuales separados, incluso con pago anual. Precios en COP; cargos de Meta no incluidos.</p>
    </div>
    {selected && <CheckoutModal plan={selected} annual={annual} onClose={() => setSelected(null)} />}
  </div>;
}
