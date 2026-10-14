import { plans } from "@/lib/plans";

export type BillingRow = {
  plan: string; plan_active_until: string | null; billing_mode: string | null; mp_preapproval_status: string | null;
};
const GRACE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * The plan the business actually has, mirroring credit_balance() in SQL: paid while the
 * period is current in this billing mode, with a 3-day grace for authorized automatic
 * subscriptions. `tenants.plan` alone keeps the last plan after it expires.
 */
export function activePlan(row: BillingRow | null | undefined, mode: string, now = Date.now()) {
  if (!row?.plan_active_until || row.billing_mode !== mode) return null;
  const until = Date.parse(row.plan_active_until) + (row.mp_preapproval_status === "authorized" ? GRACE_MS : 0);
  return until > now ? plans.find(plan => plan.id === row.plan) ?? null : null;
}
