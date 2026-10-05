/**
 * Bucle de ejecución del Agente de IA (Jarvis) con streaming en tiempo real.
 * Conecta el modelo LLM, herramientas, configuración del asistente y persistencia en Supabase.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { chatCompletionStream, calculateCost, type LLMMessage } from "@/lib/llm";
import { AGENT_TOOLS, executeToolCall, type ToolContext } from "./tools";
import { jarvisDefaults, sanitizeJarvisConfig, type JarvisConfig } from "@/lib/jarvis";
import type { AgentStreamPayload } from "@/types/jarvis";
import { personalizationPrompt, sanitizePersonalization, type JarvisPersonalization } from "@/lib/jarvis-personalization";

export interface AgentExecutorParams {
  sessionId: string;
  userMessage: string;
  tenantId?: string | null;
  userId?: string | null;
  personalization?: JarvisPersonalization;
  memoryReply?: string;
}

const HISTORY_LIMIT = 20;

/**
 * Crea un ejecutor en streaming para el agente Jarvis.
 * Yields eventos SSE estructurados para el cliente web y persiste la conversación en Supabase.
 */
export async function* createAgentExecutor(
  params: AgentExecutorParams
): AsyncGenerator<AgentStreamPayload, void, unknown> {
  const { sessionId, userMessage, tenantId, userId, memoryReply } = params;
  const personalization = sanitizePersonalization(params.personalization);
  const startTime = Date.now();
  const supabase = createAdminClient();

  try {
    // 1. Notificar inicio de procesamiento
    yield {
      status: "processing",
      phase: "thinking",
      sessionId,
    };

    // The route has created and authorized this session before streaming starts.

    // 3. Persistir el mensaje del usuario en jarvis_messages
    try {
      await supabase.from("jarvis_messages").insert({
        session_id: sessionId,
        role: "user",
        content: userMessage,
        status: "completed",
      });
    } catch (msgErr) {
      console.warn("[AgentExecutor] Advertencia persistiendo mensaje de usuario:", msgErr);
    }

    if (memoryReply !== undefined) {
      const { data: saved } = await supabase.from("jarvis_messages").insert({
        session_id: sessionId, role: "assistant", content: memoryReply, status: "completed",
      }).select("id").single();
      yield { status: "completed", content: memoryReply, sessionId, messageId: saved?.id, personalization: userId ? personalization : undefined };
      return;
    }

    // 4. Cargar configuración de Jarvis (personalizada o por defecto)
    let jarvisConfig: JarvisConfig = jarvisDefaults;
    if (tenantId) {
      try {
        const { data: cfgRow } = await supabase
          .from("jarvis_configs")
          .select("config")
          .eq("tenant_id", tenantId)
          .maybeSingle();

        if (cfgRow?.config) {
          jarvisConfig = sanitizeJarvisConfig(cfgRow.config);
        }
      } catch (cfgErr) {
        console.warn("[AgentExecutor] Fallback a config por defecto:", cfgErr);
      }
    }

    // 5. Cargar historial reciente de la sesión para mantener contexto
    let historyMessages: LLMMessage[] = [];
    try {
      const { data: dbHistory } = await supabase
        .from("jarvis_messages")
        .select("role, content, created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(HISTORY_LIMIT);

      if (dbHistory && dbHistory.length > 0) {
        historyMessages = dbHistory
          .reverse()
          .map((m) => ({
            role: m.role as "user" | "assistant" | "system",
            content: m.content,
          }));
      }
    } catch (histErr) {
      console.warn("[AgentExecutor] Advertencia cargando historial:", histErr);
    }

    // 6. Construir System Prompt con la identidad de Jarvis
    const systemPrompt = buildJarvisPrompt(jarvisConfig) + (userId ? `\n\n${personalizationPrompt(personalization)}` : "");
    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
      ...historyMessages.filter((m) => m.content !== userMessage), // evitar duplicar el actual
      { role: "user", content: userMessage },
    ];

    // 7. Ejecutar streaming con el LLM
    let assistantReply = "";
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let usedModel = process.env.LLM_MODEL || "gpt-4o-mini";

    // Si hay un tenant configurado, habilitamos las tools del catálogo
    const tools = tenantId ? AGENT_TOOLS : undefined;

    const stream = chatCompletionStream(messages, tools, {
      model: usedModel,
      temperature: 0.3,
    });

    let pendingToolCalls: Array<{
      id: string;
      function: { name: string; arguments: string };
    }> = [];

    for await (const event of stream) {
      if (event.type === "delta") {
        assistantReply += event.content;
        yield {
          status: "streaming",
          delta: event.content,
          sessionId,
        };
      } else if (event.type === "tool_calls") {
        pendingToolCalls = event.toolCalls;
      } else if (event.type === "done") {
        usedModel = event.model;
        totalTokensIn = event.tokensIn;
        totalTokensOut = event.tokensOut;
      }
    }

    // 8. Si el modelo solicitó ejecución de tools (ej. búsqueda de catálogo)
    if (pendingToolCalls.length > 0 && tenantId) {
      yield {
        status: "processing",
        phase: "tool_call",
        tool: pendingToolCalls.map((t) => t.function.name).join(", "),
        sessionId,
      };

      const toolCtx: ToolContext = {
        supabase,
        tenantId,
        conversationId: sessionId,
        customerId: userId ?? "web-guest",
        simulate: false,
      };

      // Ejecutar tools y agregarlas al historial
      messages.push({
        role: "assistant",
        content: assistantReply || null,
        tool_calls: pendingToolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: tc.function,
        })),
      });

      for (const tc of pendingToolCalls) {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(tc.function.arguments);
        } catch {
          parsedArgs = {};
        }

        const toolRes = await executeToolCall(tc.function.name, parsedArgs, toolCtx);
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(toolRes),
        });
      }

      // Sintetizar respuesta final tras las tools
      yield {
        status: "processing",
        phase: "synthesizing",
        sessionId,
      };

      const secondStream = chatCompletionStream(messages, undefined, {
        model: usedModel,
        temperature: 0.3,
      });

      for await (const event of secondStream) {
        if (event.type === "delta") {
          assistantReply += event.content;
          yield {
            status: "streaming",
            delta: event.content,
            sessionId,
          };
        } else if (event.type === "done") {
          totalTokensIn += event.tokensIn;
          totalTokensOut += event.tokensOut;
        }
      }
    }

    const latencyMs = Date.now() - startTime;
    const costUsd = calculateCost(totalTokensIn, totalTokensOut);

    // 9. Persistir la respuesta completa del asistente en Supabase
    let savedMsgId: string | undefined;
    try {
      const { data: savedMsg } = await supabase
        .from("jarvis_messages")
        .insert({
          session_id: sessionId,
          role: "assistant",
          content: assistantReply || "(Sin respuesta generada)",
          tokens_in: totalTokensIn,
          tokens_out: totalTokensOut,
          latency_ms: latencyMs,
          status: "completed",
          metadata: {
            model: usedModel,
            costUsd,
          },
        })
        .select("id")
        .single();

      savedMsgId = savedMsg?.id;
    } catch (saveErr) {
      console.warn("[AgentExecutor] Advertencia guardando respuesta de asistente:", saveErr);
    }

    // 10. Yield evento final completado
    yield {
      status: "completed",
      content: assistantReply,
      sessionId,
      messageId: savedMsgId,
      latencyMs,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[AgentExecutor] Error en bucle del agente:", errorMsg);

    // Intentar registrar error en BD
    try {
      await supabase.from("jarvis_messages").insert({
        session_id: sessionId,
        role: "assistant",
        content: `Lo siento, ha ocurrido un error al procesar tu solicitud: ${errorMsg}`,
        tokens_in: 0,
        tokens_out: 0,
        latency_ms: Date.now() - startTime,
        status: "error",
      });
    } catch {
      // Ignorar si falla la persistencia del error
    }

    yield {
      status: "error",
      error: errorMsg,
      sessionId,
    };
  }
}

/**
 * Construye el prompt de sistema adaptado a la configuración de Jarvis.
 */
function buildJarvisPrompt(config: JarvisConfig): string {
  const toneDescriptions: Record<string, string> = {
    cercano: "amable, empático, cálido, usando emojis con buen gusto y un trato familiar.",
    profesional: "elegante, cordial, formal y enfocado en la eficiencia ejecutiva.",
    divertido: "entusiasta, ingenioso, carismático y dinámico.",
    directo: "breve, conciso, al grano y sin rodeos innecesarios.",
  };

  const toneText = toneDescriptions[config.tone] || toneDescriptions.cercano;

  return `Eres ${config.name || "Jarvis"}, el asistente inteligente de alta tecnología para ${config.business || "el usuario"}.
Tu interfaz física y visual es un avatar holográfico cibernético 3D tipo Jarvis con núcleo cuántico luminoso.

TU PERSONALIDAD Y TONO:
- Tu tono es ${config.tone}: ${toneText}
- Eres proactivo, inteligente y transmites una experiencia futurista y resolutiva.
- Respondes en español siempre.

CAPACIDADES DEL SISTEMA:
${config.abilities.map((a) => `- ${a}`).join("\n")}
- Descuento máximo permitido para negociar: ${config.maxDiscount}%.

REGLAS DE OPERACIÓN DEL NEGOCIO:
${config.rules || "Atención rápida y eficiente. Dar soporte integral a consultas y dudas."}

DIRECTRICES CLAVE:
1. Respeta tu tono de voz asignado en cada mensaje.
2. Si el usuario te pregunta quién eres o qué eres, explícale que eres su núcleo Jarvis inteligente.
3. Si el usuario tiene dudas o quiere probar capacidades, asístelo con ejemplos y respuestas claras.
4. Mantén tus respuestas conversacionales, fluidas y visualmente organizadas si usas listas.`;
}
