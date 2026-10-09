"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { readAgentStream } from "@/lib/agent-stream";
import { useJarvisAvatar } from "@/context/JarvisAvatarContext";
import type { ChatMessage } from "@/types/jarvis";
import type { JarvisPersonalization } from "@/lib/jarvis-personalization";
import type { FileSummary } from "@/lib/files/types";

export interface UseJarvisAgentOptions {
  initialSessionId?: string;
  tenantId?: string;
  onResponseComplete?: (message: ChatMessage) => void;
  onResponseStart?: () => void;
  onResponseDelta?: (delta: string) => void;
  onResponseError?: () => void;
  spokenResponse?: boolean;
  attachments?: FileSummary[];
  onFilesSubmitted?: () => void;
  onPersonalizationChange?: (profile: JarvisPersonalization) => void;
  sessionScope?: string;
}

export interface UseJarvisAgentReturn {
  messages: ChatMessage[];
  sessionId: string;
  isLoading: boolean;
  activity: string | null;
  error: string | null;
  input: string;
  setInput: (value: string) => void;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string) => void;
  sendMessage: (customText?: string) => Promise<void>;
  clearChat: () => void;
  cancelResponse: () => void;
  reloadHistory: () => Promise<void>;
}

export function useJarvisAgent(options: UseJarvisAgentOptions = {}): UseJarvisAgentReturn {
  const { initialSessionId, tenantId, onResponseComplete, onResponseStart, onResponseDelta, onResponseError, spokenResponse = false, onPersonalizationChange, attachments = [], onFilesSubmitted, sessionScope = "public" } = options;
  const sessionKey = `jarvis_chat_session_id:${sessionScope}`;
  const { setState, triggerListening } = useJarvisAvatar();

  const [sessionId, setSessionId] = useState<string>(() => {
    if (initialSessionId) return initialSessionId;
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(sessionKey);
      if (stored) return stored;
    }
    const fresh = `session_${crypto.randomUUID()}`;
    if (typeof window !== "undefined") {
      localStorage.setItem(sessionKey, fresh);
    }
    return fresh;
  });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");

  const abortControllerRef = useRef<AbortController | null>(null);

  // Cargar historial de la sesión
  const reloadHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat?sessionId=${encodeURIComponent(sessionId)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.messages)) {
          setMessages(
            data.messages.map((m: { id?: string; role: string; content: string; createdAt?: string; metadata?: Record<string, unknown> }) => ({
              id: m.id || Math.random().toString(),
              role: m.role as ChatMessage["role"],
              content: m.content,
              createdAt: m.createdAt || new Date().toISOString(),
              status: "completed",
              metadata: m.metadata,
            }))
          );
        }
      }
    } catch (err) {
      console.warn("[useJarvisAgent] No se pudo cargar historial previo:", err);
    }
  }, [sessionId]);

  useEffect(() => {
    let active = true;
    fetch(`/api/chat?sessionId=${encodeURIComponent(sessionId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data && Array.isArray(data.messages)) {
          setMessages(
            data.messages.map((m: { id?: string; role: string; content: string; createdAt?: string; metadata?: Record<string, unknown> }) => ({
              id: m.id || Math.random().toString(),
              role: m.role as ChatMessage["role"],
              content: m.content,
              createdAt: m.createdAt || new Date().toISOString(),
              status: "completed",
              metadata: m.metadata,
            }))
          );
        }
      })
      .catch((err) => {
        console.warn("[useJarvisAgent] No se pudo cargar historial previo:", err);
      });

    return () => {
      active = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [sessionId]);

  // Manejo de cambio en el input: reacciona en el avatar como LISTENING
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string) => {
      const value = typeof e === "string" ? e : e.target.value;
      setInput(value);
      if (value.trim().length > 0) {
        triggerListening();
      }
    },
    [triggerListening]
  );

  // Enviar mensaje al agente
  const sendMessage = useCallback(
    async (customText?: string) => {
      const messageText = (customText ?? input).trim() || (attachments.length ? "Analiza los archivos adjuntos." : "");
      if (!messageText || isLoading) return;

      setInput("");
      setError(null);
      setIsLoading(true);
      setActivity("Organizando tu solicitud");

      // Transición inmediata a PROCESSING
      setState("PROCESSING");

      // ID temporal para el mensaje de usuario
      const userMessageId = `user_${Date.now()}`;
      const userMessage: ChatMessage = {
        id: userMessageId,
        role: "user",
        content: messageText,
        createdAt: new Date().toISOString(),
        status: "completed",
        metadata: { attachments },
      };

      // ID temporal para la respuesta del asistente
      const assistantMessageId = `assistant_${Date.now()}`;
      const placeholderAssistant: ChatMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
        status: "processing",
      };

      setMessages((prev) => [...prev, userMessage, placeholderAssistant]);

      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      onResponseStart?.();

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sessionId,
            userMessage: messageText,
            tenantId,
            spokenResponse,
            attachmentIds: attachments.map(file => file.id),
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Error ${response.status}: Fallo en la comunicación`);
        }

        if (!response.body) {
          throw new Error("El cuerpo de la respuesta en streaming es nulo");
        }
        if (attachments.length) onFilesSubmitted?.();

        let accumulatedText = "";
        let terminal = false;
        for await (const payload of readAgentStream(response.body, abortController.signal)) {
              if (payload.personalization) onPersonalizationChange?.(payload.personalization);

              if (payload.status === "processing") {
                setState("PROCESSING");
                setActivity(payload.phase === "delegating" && payload.agentLabel
                  ? `Consultando al agente de ${payload.agentLabel}`
                  : payload.phase === "synthesizing" ? "Reuniendo los resultados" : "Organizando tu solicitud");
              } else if (payload.status === "streaming" && payload.delta) {
                accumulatedText += payload.delta;
                onResponseDelta?.(payload.delta);

                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId
                      ? {
                          ...msg,
                          content: accumulatedText,
                          status: "streaming",
                        }
                      : msg
                  )
                );
              } else if (payload.status === "completed") {
                terminal = true;
                if (!onResponseComplete) setState("IDLE");

                const finalContent = payload.content || accumulatedText;
                const finalMsg: ChatMessage = {
                  id: payload.messageId || assistantMessageId,
                  role: "assistant",
                  content: finalContent,
                  createdAt: new Date().toISOString(),
                  status: "completed",
                  metadata: { handoffs: payload.handoffs ?? [], orderProposals: payload.orderProposals ?? [] },
                };

                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMessageId ? finalMsg : msg
                  )
                );

                if (onResponseComplete) {
                  onResponseComplete(finalMsg);
                }
              } else if (payload.status === "error") {
                terminal = true;
                onResponseError?.();
                setState("ERROR");
                setError(payload.error || "Error desconocido");

                // Auto-recuperación a IDLE tras 3.5 segundos
                setTimeout(() => {
                  setState("IDLE");
                }, 3500);
              }
          if (terminal) break;
        }
        if (!terminal) throw new Error("La respuesta se interrumpió. Vuelve a intentarlo.");
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          onResponseError?.();
          console.log("[useJarvisAgent] Solicitud cancelada por el usuario");
          return;
        }

        const message = err instanceof Error ? err.message : String(err);
        console.error("[useJarvisAgent] Error:", message);
        setError(message);
        onResponseError?.();
        setState("ERROR");

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  content: `Lo siento, no pude conectar con el núcleo de Jarvis: ${message}`,
                  status: "error",
                }
              : msg
          )
        );

        setTimeout(() => {
          setState("IDLE");
        }, 3500);
      } finally {
        window.dispatchEvent(new Event("jarvis:credits"));
        setIsLoading(false);
        setActivity(null);
        abortControllerRef.current = null;
      }
    },
    [
      input,
      isLoading,
      sessionId,
      tenantId,
      setState,
      onResponseComplete,
      onResponseStart,
      onResponseDelta,
      onResponseError,
      spokenResponse,
      onPersonalizationChange,
      attachments,
      onFilesSubmitted,
    ]
  );

  const clearChat = useCallback(() => {
    abortControllerRef.current?.abort();
    onResponseError?.();
    const newSession = `session_${crypto.randomUUID()}`;
    setSessionId(newSession);
    if (typeof window !== "undefined") {
      localStorage.setItem(sessionKey, newSession);
    }
    setMessages([]);
    setError(null);
    setState("IDLE");
  }, [setState, sessionKey, onResponseError]);

  const cancelResponse = useCallback(() => {
    abortControllerRef.current?.abort();
    onResponseError?.();
    setState("IDLE");
    setMessages(previous => previous.flatMap(message =>
      message.status === "processing" && !message.content ? [] :
      message.status === "streaming" ? [{ ...message, status: "completed" as const }] : [message]
    ));
  }, [onResponseError, setState]);

  return {
    messages,
    sessionId,
    isLoading,
    activity,
    error,
    input,
    setInput,
    handleInputChange,
    sendMessage,
    clearChat,
    cancelResponse,
    reloadHistory,
  };
}
