import Link from "next/link";
import { getCurrentTenant } from "@/lib/auth";
import { stripeMode } from "@/lib/stripe/config";
import { billingDatabase, assertBillingMode, currentSubscription, checkoutPending } from "@/lib/stripe/billing";
import { plans } from "@/lib/plans";
import { BillingView } from "./billing-view";

export const metadata = { title: "Planes y pagos · Nexo.ai" };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string; session_id?: string }> }) {
  const tenant = await getCurrentTenant();
  if (!tenant) return <div className="p-8"><Link href="/auth/finish">Termina de configurar tu negocio</Link></div>;
  const query = await searchParams;
  let subscription = null;
  let pending = false;
  let unavailable = false;
  try {
    await assertBillingMode();
    const { data, error } = await billingDatabase().from("billing_accounts").select("customer_id,checkout_expires_at")
      .eq("tenant_id", tenant.tenantId).eq("mode", stripeMode()).maybeSingle();
    if (error) throw new Error("Cuenta no disponible.");
    if (data) {
      pending = checkoutPending(data.checkout_expires_at);
      subscription = await currentSubscription(data.customer_id);
    }
  } catch { unavailable = true; }
  const plan = plans.find(p => p.id === subscription?.items.data[0]?.price.metadata.planId);
  return <BillingView mode={stripeMode()} owner={tenant.role === "owner"} unavailable={unavailable}
    current={subscription ? { plan: plan?.name ?? "Plan", status: subscription.status,
      endsAt: subscription.items.data[0]?.current_period_end ?? null, canceling: subscription.cancel_at_period_end } : null}
    pending={pending && !subscription} canceled={query.checkout === "canceled"}
    sessionId={query.checkout === "success" ? query.session_id : undefined} />;
}
