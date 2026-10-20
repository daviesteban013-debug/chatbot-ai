import { NextResponse } from "next/server";
import { verifyMercadoPagoSignature } from "@/lib/mercadopago/verify";
import { MercadoPagoError } from "@/lib/mercadopago/client";
import { applyAuthorizedPayment, applyPayment, syncPreapproval } from "@/lib/mercadopago/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BODY = 16 * 1024;
const ID = /^[\w-]{1,64}$/;

/**
 * Notificaciones de Mercado Pago (pagos y suscripciones). Valida `x-signature`,
 * re-consulta el recurso en la API y lo aplica. Responde 500 si no pudo registrarlo
 * para que Mercado Pago reintente; los recursos ajenos a Zorax se ignoran con 200.
 */
export async function POST(request: Request) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Webhook no configurado." }, { status: 503 });
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) return NextResponse.json({ error: "Solicitud demasiado grande." }, { status: 413 });
  const text = await request.text();
  if (text.length > MAX_BODY) return NextResponse.json({ error: "Solicitud demasiado grande." }, { status: 413 });

  const url = new URL(request.url);
  const dataId = url.searchParams.get("data.id");
  if (!verifyMercadoPagoSignature({ signature: request.headers.get("x-signature"), requestId: request.headers.get("x-request-id"), dataId, secret }))
    return NextResponse.json({ error: "Firma inválida." }, { status: 401 });

  let body: { type?: unknown; data?: { id?: unknown } } = {};
  try { body = text ? JSON.parse(text) : {}; } catch { return NextResponse.json({ error: "JSON inválido." }, { status: 400 }); }
  const type = String(url.searchParams.get("type") ?? body.type ?? "");
  // The signed id is the one from the URL; never trust a different id in the body.
  const id = dataId ?? null;
  if (!id || !ID.test(id)) return NextResponse.json({ received: true, ignored: true });

  try {
    if (type === "payment") await applyPayment(id);
    else if (type === "subscription_preapproval") await syncPreapproval(id);
    else if (type === "subscription_authorized_payment") await applyAuthorizedPayment(id);
    else return NextResponse.json({ received: true, ignored: true });
    return NextResponse.json({ received: true });
  } catch (error) {
    // Unknown resources (e.g. the panel's simulator) are not retried forever.
    if (error instanceof MercadoPagoError && error.status === 404) return NextResponse.json({ received: true, ignored: true });
    console.error("[mercadopago] No se pudo procesar la notificación:", type);
    return NextResponse.json({ error: "No se pudo procesar." }, { status: 500 });
  }
}
