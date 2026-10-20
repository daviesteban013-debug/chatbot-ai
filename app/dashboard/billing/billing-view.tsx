"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { Panel, PanelHeader, Segmented } from "@/components/dashboard/panel";
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

  const notes = "rounded-lg border border-line bg-surface p-4 text-sm text-ink-soft";
  return <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
    <PageHeader title="Planes y pagos" description="Capacidad de Zorax para tu negocio. Suscripción automática o pago por periodo con tarjeta, PSE o Efecty." />
    <div className="space-y-3">
      {mode === "test" && <aside className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><span className="font-medium">Modo de prueba · No se cobra dinero real</span><p className="mt-1 text-amber-900/80">Paga con la cuenta compradora de prueba de Mercado Pago. Tarjeta Visa <code className="font-mono">4013 5406 8274 6260</code>, CVV <code className="font-mono">123</code>, vence <code className="font-mono">11/30</code>, titular <code className="font-mono">APRO</code>. No introduzcas una tarjeta real.</p></aside>}
      {unavailable && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Los pagos no están disponibles en este momento. Recarga la página en unos minutos.</p>}
      {!owner && <p className={notes}>El propietario de tu negocio puede contratar y gestionar el plan.</p>}
      {verified && <p role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><Check size={16} />Pago recibido. Si ya fue aprobado, tu plan está disponible en Zorax.</p>}
      {notice && <p role="status" className={notes}>{notice}</p>}
      {returned && !verified && owner && <button disabled={!!busy} onClick={() => void verifyPayment()} className="rounded-md border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-subtle disabled:opacity-50">{busy === "verify" ? "Verificando pago…" : "Verificar mi pago"}</button>}
      {canceled && !current && <p className={notes}>Saliste del pago sin completarlo. Puedes intentarlo de nuevo cuando quieras.</p>}
      {pendingPayment && <p className={notes}>Tienes un pago en proceso (por ejemplo, Efecty o PSE). Tu plan se activa en cuanto Mercado Pago lo apruebe; no vuelvas a pagar.</p>}
    </div>
    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <Panel>
        <PanelHeader title="Tu plan" actions={subscription ? <Badge variant={subscribed ? "success" : "neutral"}>Suscripción {(subscriptionNames[subscription.status] ?? subscription.status).toLowerCase()}</Badge> : null} />
        <div className="px-4 py-4 sm:px-5">
          <p className="text-xl font-semibold tracking-tight text-ink">{current?.plan ?? "Sin plan vigente"}</p>
          <p className="mt-1 text-sm text-muted">{current ? `${subscribed ? "Se renueva automáticamente. Pagado hasta" : "Vigente hasta"} el ${date(current.activeUntil)}.` : "Usas el cupo de prueba. Elige un plan para darle más capacidad a Zorax."}</p>
          {subscribed && owner && <button onClick={() => void cancel()} disabled={!!busy} className="mt-4 rounded-md border border-line px-3 py-1.5 text-[13px] font-medium text-ink-soft hover:bg-subtle disabled:opacity-50">{busy === "cancel" ? "Cancelando…" : "Cancelar suscripción automática"}</button>}
        </div>
      </Panel>
      <CreditBalancePanel />
    </div>
    <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-sm font-semibold text-ink">Planes</h2><p className="mt-0.5 text-xs text-muted">Precios en COP. El pago anual tiene un 20 % de descuento.</p></div>
      <Segmented label="Periodo de facturación" value={annual ? "annual" : "monthly"} onChange={value => setAnnual(value === "annual")} options={[{ value: "monthly", label: "Mensual" }, { value: "annual", label: "Anual −20 %" }]} />
    </div>
    <div className="mt-3 grid gap-3 xl:grid-cols-3">{plans.map(plan => { const { label, disabled } = action(plan); const own = current?.planId === plan.id; return <Panel as="article" key={plan.id} className={`flex flex-col p-5 ${plan.featured ? "border-ink" : ""}`}>
      <div className="flex items-center justify-between gap-2"><h3 className="text-[15px] font-semibold text-ink">{plan.name}</h3>{own ? <Badge variant="success">Tu plan</Badge> : plan.featured ? <Badge variant="neutral">Recomendado</Badge> : null}</div>
      <p className="mt-2 min-h-10 text-[13px] leading-5 text-muted">{plan.description}</p>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-ink tabular-nums">{money(annual ? plan.price * .8 : plan.price)}<span className="ml-1.5 text-xs font-normal tracking-normal text-muted">COP / mes</span></p>
      <p className="mt-1 text-xs text-muted">{money(planTotal(plan, annual))} COP {annual ? "cada año, en un pago" : "cada mes"}.</p>
      <ul className="my-5 space-y-2 border-t border-line pt-4">{plan.features.map(feature => <li key={feature} className="flex gap-2 text-[13px] text-ink-soft"><Check size={15} className="mt-0.5 shrink-0 text-emerald-600" />{feature}</li>)}</ul>
      <button onClick={() => setSelected(plan)} disabled={!!busy || disabled} className={`mt-auto flex items-center justify-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium transition disabled:opacity-45 ${plan.featured ? "bg-ink text-white hover:bg-ink-soft" : "border border-line bg-surface text-ink hover:bg-subtle"}`}>{busy === plan.id ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}{label}</button>
    </Panel>; })}</div>
    <p className="mt-6 flex items-start gap-2 text-xs leading-5 text-muted"><ShieldCheck size={15} className="mt-0.5 shrink-0" />Mercado Pago procesa tu pago. Zorax recupera cada mensaje tras 3 horas, con cupo compartido por negocio. WhatsApp conserva créditos mensuales separados, incluso con pago anual. Cargos de Meta no incluidos.</p>
    {selected && <CheckoutModal plan={selected} annual={annual} onClose={() => setSelected(null)} />}
  </div>;
}
