import { NextRequest, NextResponse } from "next/server";
import { createAgentExecutor } from "@/lib/agent/executor";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { explicitMemory, MAX_MEMORIES, sanitizePersonalization } from "@/lib/jarvis-personalization";
import { FileAccessError, loadChatFiles } from "@/lib/files/server";
import { MAX_ATTACHMENTS, validFileId } from "@/lib/files/types";

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

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ messages: [] });
    const { data: ownedSession, error: ownerError } = await supabase.from("jarvis_sessions")
      .select("session_id").eq("session_id", sessionId).eq("user_id", user.id).maybeSingle();
    if (ownerError) return NextResponse.json({ error: "No se pudo verificar el historial" }, { status: 503 });
    if (!ownedSession) return NextResponse.json({ messages: [] });
    // RLS checks session ownership; a supplied session ID grants no access.
    const { data: messages, error } = await supabase
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
    const attachmentIds = body.attachmentIds ?? [];
    if (!Array.isArray(attachmentIds) || attachmentIds.length > MAX_ATTACHMENTS || attachmentIds.some(id => !validFileId(id)) || new Set(attachmentIds).size !== attachmentIds.length)
      return NextResponse.json({ error: "Selecciona hasta tres adjuntos válidos." }, { status: 400 });

    if (!sessionId || typeof sessionId !== "string" || sessionId.length > 160 || !/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
      return NextResponse.json(
        { error: "Se requiere un sessionId válido" },
        { status: 400 }
      );
    }

    if (!userMessage || typeof userMessage !== "string" || !userMessage.trim() || userMessage.length > 8000) {
      return NextResponse.json(
        { error: "El mensaje no puede estar vacío" },
        { status: 400 }
      );
    }

    const supabaseServer = await createClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    const userId = user?.id ?? null;
    if (attachmentIds.length && (!user || user.is_anonymous)) return NextResponse.json({ error: "Inicia sesión para usar adjuntos." }, { status: 401 });
    let resolvedTenantId: string | null = null;
    if (user) {
      let memberQuery = supabaseServer.from("tenant_members").select("tenant_id").eq("user_id", user.id);
      if (bodyTenantId) {
        if (typeof bodyTenantId !== "string") return NextResponse.json({ error: "Negocio no válido" }, { status: 400 });
        memberQuery = memberQuery.eq("tenant_id", bodyTenantId);
      }
      const { data: member, error: memberError } = await memberQuery.limit(1).maybeSingle();
      if (memberError) return NextResponse.json({ error: "No se pudo verificar tu negocio" }, { status: 503 });
      if (bodyTenantId && !member) return NextResponse.json({ error: "No tienes acceso a este negocio" }, { status: 403 });
      resolvedTenantId = member?.tenant_id ?? null;
    } else if (bodyTenantId) {
      return NextResponse.json({ error: "Inicia sesión para acceder a tu negocio" }, { status: 401 });
    }

    const admin = createAdminClient();
    // Insert once: never overwrite an existing session's owner, even in concurrent requests.
    const { error: createError } = await admin.from("jarvis_sessions").upsert({
      session_id: sessionId, user_id: userId, tenant_id: resolvedTenantId,
      title: userMessage.trim().slice(0, 48), status: "active",
    }, { onConflict: "session_id", ignoreDuplicates: true });
    if (createError) return NextResponse.json({ error: "No se pudo iniciar la conversación" }, { status: 503 });
    const { data: session, error: sessionError } = await admin.from("jarvis_sessions")
      .select("user_id, tenant_id").eq("session_id", sessionId).single();
    if (sessionError || !session) return NextResponse.json({ error: "No se pudo verificar la conversación" }, { status: 503 });
    if (session.user_id !== userId || session.tenant_id !== resolvedTenantId)
      return NextResponse.json({ error: "Esta conversación pertenece a otra sesión. Inicia una nueva." }, { status: 403 });
    let files;
    try { files = user && !user.is_anonymous ? await loadChatFiles(user.id, sessionId, attachmentIds) : []; }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudieron leer los adjuntos." }, { status: error instanceof FileAccessError ? error.status : 503 }); }

    let personalization = sanitizePersonalization(user?.user_metadata?.jarvis_personalization);
    let memoryReply: string | undefined;
    const memory = explicitMemory(userMessage);
    if (memory) {
      if (!user) memoryReply = "Inicia sesión para que pueda recordar tus preferencias entre conversaciones.";
      else if (memory.length > 240) memoryReply = "Usa una preferencia de hasta 240 caracteres para guardarla.";
      else if (personalization.memories.includes(memory)) memoryReply = "Esa preferencia ya está guardada en tu personalización.";
      else if (personalization.memories.length >= MAX_MEMORIES) memoryReply = "Tu memoria está llena. Borra un recuerdo en Personalización antes de añadir otro.";
      else {
        const next = sanitizePersonalization({ ...personalization, memories: [...personalization.memories, memory] });
        const { error: memoryError } = await supabaseServer.auth.updateUser({ data: { jarvis_personalization: next } });
        if (memoryError) memoryReply = "No pude guardar esa preferencia. Inténtalo de nuevo.";
        else { personalization = next; memoryReply = `Recordaré esta preferencia: «${memory}». Puedes editarla o borrarla en Personalización.`; }
      }
    }

    const streamAbort = new AbortController();
    const signal = request.signal ? AbortSignal.any([request.signal, streamAbort.signal]) : streamAbort.signal;
    // Iniciar el generador del agente
    const agentStream = createAgentExecutor({
      sessionId,
      userMessage: userMessage.trim(),
      tenantId: resolvedTenantId,
      userId,
      personalization,
      spokenResponse: body.spokenResponse === true,
      memoryReply,
      signal,
      files,
      attachmentIds,
    });

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of agentStream) {
            if (signal.aborted) break;
            const dataString = `data: ${JSON.stringify(chunk)}\n\n`;
            controller.enqueue(encoder.encode(dataString));
          }
          if (!signal.aborted) controller.close();
        } catch (streamError) {
          if (signal.aborted) return;
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
      cancel() { streamAbort.abort(); },
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
