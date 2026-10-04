"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { KeyRound, Loader2, Lock, ShieldCheck, Sparkles, X } from "lucide-react";
import { ANNUAL_DISCOUNT, money, planTotal, type Plan } from "@/lib/plans";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

/** Tema de Stripe Elements alineado con el frontend (zinc oscuro + amarillo). */
const appearance = {
  theme: "night" as const,
  variables: {
    colorPrimary: "#facc15",
    colorBackground: "#18181b",
    colorText: "#fafafa",
    colorTextSecondary: "#a1a1aa",
    colorDanger: "#f87171",
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    borderRadius: "12px",
    spacingUnit: "4px",
  },
  rules: {
    ".Input": { border: "1px solid #3f3f46", boxShadow: "none", backgroundColor: "#09090b" },
    ".Input:focus": { border: "1px solid #facc15", boxShadow: "0 0 0 3px rgba(250,204,21,0.15)" },
    ".Label": { fontSize: "12px", fontWeight: "500", letterSpacing: "0.02em" },
    ".Tab": { border: "1px solid #3f3f46", backgroundColor: "#09090b" },
    ".Tab--selected": { border: "1px solid #facc15", backgroundColor: "#facc1514" },
  },
};

interface Props {
  plan: Plan;
  annual: boolean;
  onClose: () => void;
}

export function CheckoutModal({ plan, annual, onClose }: Props) {
  const total = planTotal(plan, annual);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  useEffect(() => {
    if (!stripePromise) return;
    let cancelled = false;
    fetch("/api/stripe/create-subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: plan.id, annual }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "No se pudo iniciar el pago.");
        if (!cancelled) {
          setClientSecret(data.clientSecret);
          setSubscriptionId(data.subscriptionId);
        }
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [plan.id, annual]);

  const options = useMemo(
    () => (clientSecret ? { clientSecret, appearance, locale: "es" as const } : undefined),
    [clientSecret]
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="checkout-title" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="relative my-auto grid w-full max-w-4xl overflow-hidden rounded-3xl border border-yellow-300/40 bg-zinc-950 shadow-[0_0_90px_rgba(250,204,21,0.14)] md:grid-cols-[.9fr_1.1fr]">
        <div className="scanner-line opacity-50" />
        <button type="button" onClick={onClose} aria-label="Cerrar" className="absolute right-4 top-4 z-10 rounded-lg border border-white/10 bg-zinc-900 p-2 text-zinc-400 transition hover:border-yellow-300/50 hover:text-white">
          <X className="size-4" />
        </button>

        {/* Resumen */}
        <aside className="cyber-grid-pattern flex flex-col border-b border-white/10 bg-[linear-gradient(160deg,#facc1512,#09090b_70%)] p-7 sm:p-9 md:border-b-0 md:border-r">
          <p className="landing-eyebrow">Resumen del pedido</p>
          <h2 id="checkout-title" className="mt-3 text-2xl font-medium tracking-[-0.04em] text-white">Plan {plan.name}</h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">{plan.description}</p>
          <ul className="mt-6 space-y-3 text-sm text-zinc-300">
            {plan.features.slice(0, 4).map((f) => (
              <li key={f} className="flex items-start gap-3"><Sparkles className="mt-0.5 size-4 shrink-0 text-yellow-300" />{f}</li>
            ))}
          </ul>
          <div className="mt-auto pt-8">
            <div className="rounded-2xl border border-white/10 bg-zinc-900/70 p-5 text-sm">
              <div className="flex justify-between text-zinc-400"><span>{annual ? "12 meses" : "1 mes"}</span><span className="tabular-nums">{money(annual ? plan.price * 12 : plan.price)}</span></div>
              {annual && <div className="mt-2 flex justify-between text-yellow-300"><span>Descuento anual −{ANNUAL_DISCOUNT * 100}%</span><span className="tabular-nums">−{money(plan.price * 12 * ANNUAL_DISCOUNT)}</span></div>}
              <div className="mt-4 flex items-end justify-between border-t border-white/10 pt-4"><span className="text-zinc-300">Total hoy</span><span className="text-3xl font-medium tracking-[-0.05em] text-white tabular-nums">{money(total)} <span className="text-xs font-normal tracking-normal text-zinc-500">COP</span></span></div>
            </div>
            <p className="mt-4 flex items-center gap-2 text-[11px] text-zinc-500"><ShieldCheck className="size-4 text-yellow-300" />Pago cifrado y procesado por Stripe. Nexo nunca ve tu tarjeta.</p>
          </div>
        </aside>

        {/* Pasarela */}
        <section className="p-7 sm:p-9">
          <p className="landing-eyebrow">Pasarela de pago</p>
          <h3 className="mt-3 text-xl font-medium tracking-[-0.03em] text-white">Activa tu agente Jarvis</h3>
          <p className="mt-2 mb-6 text-sm text-zinc-400">Al pagar, entrarás directo a personalizar tu agente.</p>

          {!stripePromise ? (
            <div className="rounded-2xl border border-dashed border-yellow-300/40 bg-yellow-300/5 p-6">
              <KeyRound className="size-6 text-yellow-300" />
              <p className="mt-3 text-sm font-medium text-white">Espacio para tu API de Stripe</p>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">Agrega estas variables en <code className="text-yellow-300">.env.local</code> y reinicia el servidor:</p>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-black/60 p-4 text-[11px] leading-6 text-zinc-300">{`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...\nSTRIPE_SECRET_KEY=sk_test_...`}</pre>
            </div>
          ) : error ? (
            <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-300">{error}</p>
          ) : !options ? (
            <div className="flex items-center gap-3 py-10 text-sm text-zinc-400"><Loader2 className="size-4 animate-spin text-yellow-300" />Preparando pago seguro…</div>
          ) : (
            <Elements stripe={stripePromise} options={options}>
              <PayForm total={total} planId={plan.id} subscriptionId={subscriptionId} />
            </Elements>
          )}
        </section>
      </div>
    </div>
  );
}

function PayForm({ total, planId, subscriptionId }: { total: number; planId: string; subscriptionId: string | null }) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    const { error: err } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: { return_url: `${window.location.origin}/dashboard/jarvis?plan=${planId}&paid=1${subscriptionId ? `&sub=${subscriptionId}` : ""}` },
    });
    if (err) {
      setError(err.message ?? "No se pudo procesar el pago.");
      setBusy(false);
      return;
    }
    router.push(`/dashboard/jarvis?plan=${planId}&paid=1${subscriptionId ? `&sub=${subscriptionId}` : ""}`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <PaymentElement />
      {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-xs text-red-300">{error}</p>}
      <button type="submit" disabled={!stripe || busy} className="landing-primary w-full disabled:cursor-not-allowed disabled:opacity-60">
        {busy ? <><Loader2 className="size-4 animate-spin" />Procesando…</> : <><Lock className="size-4" />Pagar {money(total)} COP</>}
      </button>
    </form>
  );
}
