/**
 * Webhook canónico de WhatsApp Cloud API (Meta).
 *
 * GET  → Handshake de verificación del endpoint (devuelve el `hub.challenge`).
 * POST → Recepción de mensajes entrantes. Valida la firma `X-Hub-Signature-256`,
 *        responde 200 de inmediato y procesa en background con `after()` de
 *        Next.js 16 (fuera del ciclo de vida del request).
 */

import { NextRequest, NextResponse, after } from "next/server";
import { verifyWebhookSignature, verifyWebhookToken } from "@/lib/whatsapp/verify";
import { handleWebhookPayload } from "@/lib/whatsapp/webhook-handler";
import type { WhatsAppWebhookPayload } from "@/lib/whatsapp/types";

// El webhook siempre debe ejecutarse por request (nunca cacheado/estático).
export const dynamic = "force-dynamic";

// Margen para el procesamiento en background (agente vendedor) tras el 200.
export const maxDuration = 60;

// ---------- GET: verificación del endpoint ----------

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!verifyToken) {
    console.error("[webhook] WHATSAPP_VERIFY_TOKEN no configurado.");
    return new NextResponse("Server misconfigured", { status: 500 });
  }

  if (verifyWebhookToken(mode ?? undefined, token ?? undefined, verifyToken) === null) {
    console.log("[webhook] Verificación del endpoint exitosa.");
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn("[webhook] Verificación fallida: token inválido.");
  return new NextResponse("Forbidden", { status: 403 });
}

// ---------- POST: mensajes entrantes ----------

export async function POST(request: NextRequest) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    console.error("[webhook] WHATSAPP_APP_SECRET no configurado.");
    return new NextResponse("Server misconfigured", { status: 500 });
  }

  // Leer el body crudo para validar la firma HMAC (debe ser byte-por-byte).
  const rawBody = await request.text();

  // Validar firma X-Hub-Signature-256.
  const signature = request.headers.get("x-hub-signature-256");
  if (!signature || !verifyWebhookSignature(rawBody, signature, appSecret)) {
    console.error("[webhook] Firma inválida, rechazando request.");
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Parsear el payload.
  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WhatsAppWebhookPayload;
  } catch {
    console.error("[webhook] Payload JSON inválido.");
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  // Responder 200 a Meta de inmediato y procesar en background.
  after(async () => {
    await handleWebhookPayload(payload);
  });

  return new NextResponse("OK", { status: 200 });
}
