import Link from "next/link";
import { getCurrentTenant } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { mercadoPagoMode } from "@/lib/mercadopago/client";
import { plans } from "@/lib/plans";
import { BillingView } from "./billing-view";

export const metadata = { title: "Planes y pagos · Nexo.ai" };
const ID = /^[\w-]{1,64}$/;
const id = (value: unknown) => typeof value === "string" && ID.test(value) ? value : undefined;

/** Server state only: the paid period, the automatic subscription and payments in process. */
async function readBilling(tenantId: string) {
  const mode = mercadoPagoMode();
  const admin = createAdminClient();
  const [{ data: row, error }, { data: pending, error: pendingError }] = await Promise.all([
    admin.from("tenants").select("plan,plan_period,plan_active_until,billing_mode,mp_preapproval_status").eq("id", tenantId).single(),
    admin.from("billing_payments").select("mp_payment_id").eq("tenant_id", tenantId).eq("mode", mode)
      .in("status", ["pending", "in_process"]).limit(1),
  ]);
  if (error || pendingError) throw new Error("Pagos no disponibles.");
  const sameMode = row.billing_mode === mode;
  const activeUntil = sameMode && row.plan_active_until && Date.parse(row.plan_active_until) > Date.now() ? row.plan_active_until : null;
  const plan = plans.find(p => p.id === row.plan);
  return {
    mode,
    current: activeUntil && plan ? { planId: plan.id, plan: plan.name, activeUntil, annual: row.plan_period === "annual" } : null,
    subscription: sameMode && row.mp_preapproval_status ? { status: row.mp_preapproval_status } : null,
    pendingPayment: Boolean(pending?.length),
  };
}

export default async function BillingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tenant = await getCurrentTenant();
  if (!tenant) return <div className="p-8"><Link href="/auth/finish">Termina de configurar tu negocio</Link></div>;
  const query = await searchParams;
  const billing = await readBilling(tenant.tenantId).catch(() => null);
  const returned = query.checkout === "return" ? { paymentId: id(query.payment_id) ?? id(query.collection_id), preapprovalId: id(query.preapproval_id) } : null;
  return <BillingView mode={billing?.mode ?? "test"} owner={tenant.role === "owner"} unavailable={!billing}
    current={billing?.current ?? null} subscription={billing?.subscription ?? null} pendingPayment={billing?.pendingPayment ?? false}
    canceled={query.checkout === "canceled"} returned={returned?.paymentId || returned?.preapprovalId ? returned : null} />;
}
