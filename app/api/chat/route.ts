import { NextRequest, NextResponse } from "next/server";
import { createAgentExecutor } from "@/lib/agent/executor";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/chat?sessionId=xyz
 * Recupera el historial de mensajes de la sesión para inicializar la UI.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { data: messages, error } = await admin
      .from("jarvis_messages")
      .select("id, role, content, status, created_at, metadata")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) {
      // Si la tabla aún no se ha creado en Supabase, responder con array vacío sin romper la UI
      if (error.code === "PGRST205") {
        return NextResponse.json({ messages: [] });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      messages: (messages || []).map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        status: m.status,
        createdAt: m.created_at,
        metadata: m.metadata,
      })),
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

/**
 * POST /api/chat
 * Recibe { sessionId, userMessage, tenantId? } y transmite la respuesta del agente
 * en tiempo real utilizando Server-Sent Events (SSE).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, userMessage, tenantId: bodyTenantId } = body;

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        { error: "Se requiere un sessionId válido" },
        { status: 400 }
      );
    }

    if (!userMessage || typeof userMessage !== "string" || !userMessage.trim()) {
      return NextResponse.json(
        { error: "El mensaje no puede estar vacío" },
        { status: 400 }
      );
    }

    // Resolver usuario autenticado si existe sesión activa
    let userId: string | null = null;
    let resolvedTenantId: string | null = bodyTenantId ?? null;

    try {
      const supabaseServer = await createClient();
      const {
        data: { user },
      } = await supabaseServer.auth.getUser();

      if (user) {
        userId = user.id;

        // Si no viene tenantId en el body, resolver el tenant del usuario
        if (!resolvedTenantId) {
          const { data: member } = await supabaseServer
            .from("tenant_members")
            .select("tenant_id")
            .eq("user_id", user.id)
            .limit(1)
            .maybeSingle();

          if (member?.tenant_id) {
            resolvedTenantId = member.tenant_id;
          }
        }
      }
    } catch {
      // Si falla la autenticación de cookies, se continúa como visitante web
    }

    // Iniciar el generador del agente
    const agentStream = createAgentExecutor({
      sessionId,
      userMessage: userMessage.trim(),
      tenantId: resolvedTenantId,
      userId,
    });

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of agentStream) {
            const dataString = `data: ${JSON.stringify(chunk)}\n\n`;
            controller.enqueue(encoder.encode(dataString));
          }
          controller.close();
        } catch (streamError) {
          const errorMsg =
            streamError instanceof Error
              ? streamError.message
              : String(streamError);
          const errorPayload = `data: ${JSON.stringify({
            status: "error",
            error: errorMsg,
            sessionId,
          })}\n\n`;
          controller.enqueue(encoder.encode(errorPayload));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[api/chat] Error procesando request:", errorMsg);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
