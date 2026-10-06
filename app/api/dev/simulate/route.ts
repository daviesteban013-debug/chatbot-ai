import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAgent } from "@/lib/agent/loop";
import { getCurrentTenant } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Endpoint de desarrollo para simular mensajes entrantes de WhatsApp y
 * ejecutar el bucle del agente vendedor de Fase 1 sin depender de Meta.
 */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  const account = await getCurrentTenant();
  if (!account || account.role === "viewer") return NextResponse.json({ error: "Acceso no autorizado" }, { status: 403 });
  try {
    const body = await req.json().catch(() => ({}));
    const message = body.message || "Hola Vale, ¿qué bolsos tienes disponibles en cuero y cuánto cuesta el envío a Bogotá?";
    const phone = body.phone || "+573001234567";
    const customerName = body.customerName || "David Cliente";
    if (typeof message !== "string" || !message.trim() || message.length > 8000)
      return NextResponse.json({ error: "Mensaje no válido" }, { status: 400 });

    const supabase = createAdminClient();

    // 1. Obtener tenant
    const { data: tenant, error: tErr } = await supabase
      .from("tenants")
      .select("id, name, slug")
      .eq("id", account.tenantId)
      .single();

    if (tErr || !tenant) {
      return NextResponse.json(
        { error: "Tenant no encontrado", details: tErr?.message },
        { status: 404 }
      );
    }

    // 2. Upsert customer
    const { data: customer, error: cErr } = await supabase
      .from("customers")
      .upsert(
        {
          tenant_id: tenant.id,
          phone,
          name: customerName,
        },
        { onConflict: "tenant_id,phone" }
      )
      .select("id, phone, name")
      .single();

    if (cErr || !customer) {
      return NextResponse.json(
        { error: "Error en customer", details: cErr?.message },
        { status: 500 }
      );
    }

    // 3. Buscar o crear conversación abierta
    let { data: conversation } = await supabase
      .from("conversations")
      .select("id, status")
      .eq("tenant_id", tenant.id)
      .eq("customer_id", customer.id)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!conversation) {
      const { data: newConv, error: convErr } = await supabase
        .from("conversations")
        .insert({
          tenant_id: tenant.id,
          customer_id: customer.id,
          status: "open",
        })
        .select("id, status")
        .single();

      if (convErr || !newConv) {
        return NextResponse.json(
          { error: "Error creando conversacion", details: convErr?.message },
          { status: 500 }
        );
      }
      conversation = newConv;
    }

    // 4. Insertar mensaje entrante del cliente
    const waMessageId = `sim_${Date.now()}`;
    const { data: msg, error: msgErr } = await supabase
      .from("messages")
      .insert({
        tenant_id: tenant.id,
        conversation_id: conversation.id,
        direction: "inbound",
        sender: "customer",
        type: "text",
        body: message,
        wa_message_id: waMessageId,
      })
      .select("id, body, created_at")
      .single();

    if (msgErr || !msg) {
      return NextResponse.json(
        { error: "Error guardando mensaje entrante", details: msgErr?.message },
        { status: 500 }
      );
    }

    // 5. Ejecutar el orquestador del agente vendedor
    const startMs = Date.now();
    await runAgent({
      tenantId: tenant.id,
      conversationId: conversation.id,
      customerId: customer.id,
      customerPhone: customer.phone,
      triggerMessageId: msg.id,
      waMessageId,
    });
    const totalMs = Date.now() - startMs;

    // 6. Consultar el resultado en mensajes y agent_runs
    const { data: replyMessages } = await supabase
      .from("messages")
      .select("id, direction, sender, body, type, created_at")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(4);

    const { data: runs } = await supabase
      .from("agent_runs")
      .select("id, mode, status, proposed_reply, final_reply, tool_calls, model, latency_ms, error")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: false })
      .limit(1);

    return NextResponse.json({
      success: true,
      tenant: tenant.name,
      customer: customer.name,
      conversationId: conversation.id,
      userMessage: message,
      agentRun: runs?.[0] || null,
      recentMessages: replyMessages || [],
      executionTimeMs: totalMs,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
