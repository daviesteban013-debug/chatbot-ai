import { createAdminClient } from "@/lib/supabase/admin";
import { planTotal, type Plan } from "@/lib/plans";
import { billingOrigin } from "@/lib/billing/origin";
import type { Json } from "@/lib/database.types";
import { mercadoPago, mercadoPagoMode } from "./client";

export type CheckoutKind = "subscription" | "one_time";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MP_ID = /^[\w-]{1,64}$/;

type Preference = { id: string; init_point: string };
type Preapproval = { id: string; status: string; init_point?: string; external_reference?: string | null };
type Payment = {
  id: number | string; status: string; transaction_amount: number; currency_id: string;
  external_reference?: string | null; live_mode?: boolean; date_approved?: string | null;
  payment_type_id?: string; payment_method_id?: string; status_detail?: string;
};
type AuthorizedPayment = { id: number | string; preapproval_id?: string; external_reference?: string | null; payment?: { id?: number | string } | null };

export class BillingError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

/** Only Mercado Pago's own HTTPS checkout pages may receive the buyer. */
export function trustedCheckoutUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const host = url.hostname;
    const trusted = url.protocol === "https:" && (host === "mercadopago.com.co" || host.endsWith(".mercadopago.com.co")
      || host === "mercadopago.com" || host.endsWith(".mercadopago.com"));
    return trusted ? url.href : null;
  } catch { return null; }
}

export async function createCheckout(input: { tenantId: string; userId: string; email: string; plan: Plan; annual: boolean; kind: CheckoutKind }):
  Promise<{ ok: true; url: string } | { ok: false; reason: string; activeUntil?: string }> {
  const mode = mercadoPagoMode();
  const amount = planTotal(input.plan, input.annual);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("nexo_claim_mp_checkout", {
    p_tenant: input.tenantId, p_user: input.userId, p_mode: mode, p_kind: input.kind,
    p_plan: input.plan.id, p_annual: input.annual, p_amount: amount,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) throw new BillingError(503, "No se pudo reservar el pago.");
  const claim = data as { ok: boolean; id?: string; url?: string; reused?: boolean; reason?: string; activeUntil?: string; expiresAt?: string };
  if (!claim.ok) return { ok: false, reason: String(claim.reason), activeUntil: claim.activeUntil };
  const reused = trustedCheckoutUrl(claim.url);
  if (claim.reused && reused) return { ok: true, url: reused };
  if (!claim.id || !UUID.test(claim.id)) throw new BillingError(503, "No se pudo reservar el pago.");

  const origin = billingOrigin();
  const title = `Zorax · Plan ${input.plan.name} (${input.annual ? "anual" : "mensual"})`;
  let ref: string, url: string | null;
  if (input.kind === "subscription") {
    const preapproval = await mercadoPago<Preapproval>("/preapproval", {
      method: "POST", idempotencyKey: `nexo-sub-${claim.id}`,
      body: {
        reason: title, external_reference: claim.id, payer_email: input.email, status: "pending",
        back_url: `${origin}/dashboard/billing?checkout=return`,
        auto_recurring: { frequency: input.annual ? 12 : 1, frequency_type: "months", transaction_amount: amount, currency_id: "COP" },
      },
    });
    ref = preapproval.id; url = trustedCheckoutUrl(preapproval.init_point);
  } else {
    const preference = await mercadoPago<Preference>("/checkout/preferences", {
      method: "POST", idempotencyKey: `nexo-pref-${claim.id}`,
      body: {
        items: [{ id: input.plan.id, title, description: input.annual ? "Acceso por 12 meses" : "Acceso por 1 mes", quantity: 1, unit_price: amount, currency_id: "COP" }],
        external_reference: claim.id, payer: { email: input.email },
        back_urls: {
          success: `${origin}/dashboard/billing?checkout=return`,
          pending: `${origin}/dashboard/billing?checkout=return`,
          failure: `${origin}/dashboard/billing?checkout=canceled`,
        },
        auto_return: "approved", statement_descriptor: "Zorax",
        expires: true, expiration_date_to: claim.expiresAt, date_of_expiration: claim.expiresAt,
      },
    });
    ref = preference.id; url = trustedCheckoutUrl(preference.init_point);
  }
  if (!url || !MP_ID.test(ref)) throw new BillingError(502, "Mercado Pago no devolvió un enlace de pago válido.");
  const { error: saveError } = await admin.from("billing_checkouts").update({ mp_ref: ref, checkout_url: url }).eq("id", claim.id);
  if (saveError) throw new BillingError(503, "No se pudo guardar el pago.");
  return { ok: true, url };
}

/** Resolves the Zorax checkout from the external reference, or from the subscription id. */
async function checkoutFor(reference: string | null | undefined, preapprovalId?: string) {
  const admin = createAdminClient();
  let query = admin.from("billing_checkouts").select("id,tenant_id,kind");
  if (reference && UUID.test(reference)) query = query.eq("id", reference);
  else if (preapprovalId && MP_ID.test(preapprovalId)) query = query.eq("mp_ref", preapprovalId);
  else return null;
  const { data, error } = await query.maybeSingle();
  if (error) throw new BillingError(503, "No se pudo consultar el pago.");
  return data;
}

async function applyFetchedPayment(payment: Payment, checkoutId: string) {
  const mode = mercadoPagoMode();
  if (typeof payment.live_mode === "boolean" && payment.live_mode !== (mode === "live")) return { ok: false, reason: "mode" };
  const raw = {
    status_detail: payment.status_detail ?? null, payment_type_id: payment.payment_type_id ?? null,
    payment_method_id: payment.payment_method_id ?? null, date_approved: payment.date_approved ?? null,
  } satisfies Json;
  const { data, error } = await createAdminClient().rpc("nexo_apply_mp_payment", {
    p_payment_id: String(payment.id), p_checkout: checkoutId, p_mode: mode, p_status: payment.status,
    p_amount: payment.transaction_amount, p_currency: payment.currency_id, p_raw: raw,
  });
  if (error) throw new BillingError(503, "No se pudo registrar el pago.");
  return data as { ok: boolean; applied?: boolean; reason?: string };
}

/** Always re-reads the payment from Mercado Pago; a notification or URL never grants a plan. */
export async function applyPayment(paymentId: string, expectedTenant?: string) {
  if (!MP_ID.test(paymentId)) throw new BillingError(400, "Pago inválido.");
  const payment = await mercadoPago<Payment>(`/v1/payments/${encodeURIComponent(paymentId)}`);
  const checkout = await checkoutFor(payment.external_reference);
  if (!checkout) return { ok: false, reason: "foreign" };
  if (expectedTenant && checkout.tenant_id !== expectedTenant) throw new BillingError(403, "Este pago no pertenece a tu negocio.");
  return applyFetchedPayment(payment, checkout.id);
}

/** A recurring subscription charge: resolve its subscription, then confirm the real payment. */
export async function applyAuthorizedPayment(authorizedPaymentId: string) {
  if (!MP_ID.test(authorizedPaymentId)) throw new BillingError(400, "Cobro inválido.");
  const charge = await mercadoPago<AuthorizedPayment>(`/authorized_payments/${encodeURIComponent(authorizedPaymentId)}`);
  const paymentId = charge.payment?.id;
  if (paymentId === undefined || paymentId === null) return { ok: true, applied: false };
  const checkout = await checkoutFor(charge.external_reference, charge.preapproval_id);
  if (!checkout) return { ok: false, reason: "foreign" };
  const payment = await mercadoPago<Payment>(`/v1/payments/${encodeURIComponent(String(paymentId))}`);
  return applyFetchedPayment(payment, checkout.id);
}

export async function syncPreapproval(preapprovalId: string, expectedTenant?: string) {
  if (!MP_ID.test(preapprovalId)) throw new BillingError(400, "Suscripción inválida.");
  const preapproval = await mercadoPago<Preapproval>(`/preapproval/${encodeURIComponent(preapprovalId)}`);
  const checkout = await checkoutFor(preapproval.external_reference, preapproval.id);
  if (!checkout || checkout.kind !== "subscription") return { ok: false, reason: "foreign" };
  if (expectedTenant && checkout.tenant_id !== expectedTenant) throw new BillingError(403, "Esta suscripción no pertenece a tu negocio.");
  const { data, error } = await createAdminClient().rpc("nexo_sync_mp_preapproval", {
    p_checkout: checkout.id, p_preapproval_id: preapproval.id, p_status: preapproval.status, p_mode: mercadoPagoMode(),
  });
  if (error) throw new BillingError(503, "No se pudo registrar la suscripción.");
  return data as { ok: boolean; applied?: boolean; reason?: string };
}

/** Stops future charges; the paid period stays available until it ends. */
export async function cancelSubscription(tenantId: string) {
  const { data: tenant, error } = await createAdminClient().from("tenants")
    .select("mp_preapproval_id,mp_preapproval_status").eq("id", tenantId).maybeSingle();
  if (error) throw new BillingError(503, "No se pudo consultar tu suscripción.");
  if (!tenant?.mp_preapproval_id || tenant.mp_preapproval_status !== "authorized") throw new BillingError(409, "No tienes una suscripción automática activa.");
  await mercadoPago(`/preapproval/${encodeURIComponent(tenant.mp_preapproval_id)}`, {
    method: "PUT", idempotencyKey: `nexo-cancel-${tenant.mp_preapproval_id}`, body: { status: "canceled" },
  });
  return syncPreapproval(tenant.mp_preapproval_id, tenantId);
}
