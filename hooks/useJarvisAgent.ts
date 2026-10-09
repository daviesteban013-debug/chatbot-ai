"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { readAgentStream } from "@/lib/agent-stream";
import { useJarvisAvatar } from "@/context/JarvisAvatarContext";
import type { ChatMessage } from "@/types/jarvis";
import type { JarvisPersonalization } from "@/lib/jarvis-personalization";
import type { FileSummary } from "@/lib/files/types";
import { mergeOperatorActions, settleOperatorActions, type OperatorAction } from "@/lib/crm-operator";

type HistoryMessage = { id?: string; role: string; content: string; createdAt?: string; metadata?: Record<string, unknown> };
function restoreHistory(messages: HistoryMessage[]): ChatMessage[] {
  return messages.map(message => ({
    id: message.id || crypto.randomUUID(),
    role: message.role as ChatMessage["role"],
    content: message.content,
    createdAt: message.createdAt || new Date().toISOString(),
    status: "completed",
    metadata: {
      ...message.metadata,
      operatorActions: settleOperatorActions(message.metadata?.operatorActions, "completed"),
    },
  }));
}
function latestHistoryActions(messages: ChatMessage[]): OperatorAction[] {
  const latestAssistant = messages.findLast(message => message.role === "assistant");
  return settleOperatorActions(latestAssistant?.metadata?.operatorActions, "completed");
}

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
  operatorActions: OperatorAction[];
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
  const [operatorActions, setOperatorActions] = useState<OperatorAction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");

  const abortControllerRef = useRef<AbortController | null>(null);
  const turnRef = useRef(0);

  // Cargar historial de la sesión
  const reloadHistory = useCallback(async () => {
    const turn = turnRef.current;
    try {
      const res = await fetch(`/api/chat?sessionId=${encodeURIComponent(sessionId)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.messages) && turn === turnRef.current && !abortControllerRef.current) {
          const restored = restoreHistory(data.messages);
          setMessages(restored);
          setOperatorActions(latestHistoryActions(restored));
        }
      }
    } catch (err) {
      console.warn("[useJarvisAgent] No se pudo cargar historial previo:", err);
    }
  }, [sessionId]);

  useEffect(() => {
    let active = true;
    const turn = turnRef.current;
    fetch(`/api/chat?sessionId=${encodeURIComponent(sessionId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data && Array.isArray(data.messages) && turn === turnRef.current && !abortControllerRef.current) {
          const restored = restoreHistory(data.messages);
          setMessages(restored);
          setOperatorActions(latestHistoryActions(restored));
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
      if (!messageText || isLoading || abortControllerRef.current) return;

      setInput("");
      setError(null);
      setIsLoading(true);
      setActivity("Organizando tu solicitud");
      setOperatorActions([]);
      const turn = ++turnRef.current;
      let accumulatedText = "";
      let currentActions: OperatorAction[] = [];

      // Transición inmediata a PROCESSING
      setState("PROCESSING");

      // ID temporal para el mensaje de usuario
      const userMessageId = `user_${crypto.randomUUID()}`;
      const userMessage: ChatMessage = {
        id: userMessageId,
        role: "user",
        content: messageText,
        createdAt: new Date().toISOString(),
        status: "completed",
        metadata: { attachments },
      };

      // ID temporal para la respuesta del asistente
      const assistantMessageId = `assistant_${crypto.randomUUID()}`;
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
        if (turn !== turnRef.current || abortController.signal.aborted) return;

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Error ${response.status}: Fallo en la comunicación`);
        }

        if (!response.body) {
          throw new Error("El cuerpo de la respuesta en streaming es nulo");
        }
        if (attachments.length) onFilesSubmitted?.();

        let terminal = false;
        for await (const payload of readAgentStream(response.body, abortController.signal)) {
              if (turn !== turnRef.current || abortController.signal.aborted) return;
              if (payload.personalization) onPersonalizationChange?.(payload.personalization);
              if (payload.operatorActions || payload.operation) {
                currentActions = mergeOperatorActions(currentActions, payload.operatorActions);
                currentActions = mergeOperatorActions(currentActions, payload.operation ? [payload.operation] : []);
                setOperatorActions(currentActions);
                setMessages(previous => previous.map(message => message.id === assistantMessageId
                  ? { ...message, metadata: { ...message.metadata, operatorActions: currentActions } } : message));
              }

              if (payload.status === "processing") {
                setState("PROCESSING");
                setActivity(payload.phase === "operating" && payload.operation
                  ? currentActions.find(action => action.id === payload.operation?.id)?.label ?? "Trabajando en el CRM"
                  : payload.phase === "delegating" && payload.agentLabel
                  ? `Consultando al agente de ${payload.agentLabel}`
                  : payload.phase === "synthesizing" ? "Reuniendo los resultados" : "Organizando tu solicitud");
              } else if (payload.status === "streaming" && payload.delta) {
                accumulatedText += payload.delta;
                onResponseDelta?.(payload.delta);
                if (turn !== turnRef.current || abortController.signal.aborted) return;

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
                currentActions = settleOperatorActions(currentActions, "completed");
                setOperatorActions(currentActions);
                const finalMsg: ChatMessage = {
                  id: payload.messageId || assistantMessageId,
                  role: "assistant",
                  content: finalContent,
                  createdAt: new Date().toISOString(),
                  status: "completed",
                  metadata: { handoffs: payload.handoffs ?? [], orderProposals: payload.orderProposals ?? [], operatorActions: currentActions },
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
                currentActions = settleOperatorActions(currentActions, "error");
                setOperatorActions(currentActions);
                setMessages(previous => previous.map(message => message.id === assistantMessageId ? {
                  ...message,
                  content: payload.content || accumulatedText || "No pude completar la solicitud. Puedes revisar los pasos realizados.",
                  status: "error",
                  metadata: { ...message.metadata, handoffs: payload.handoffs ?? [], orderProposals: payload.orderProposals ?? [], operatorActions: currentActions },
                } : message));

                // Auto-recuperación a IDLE tras 3.5 segundos
                setTimeout(() => {
                  if (turn === turnRef.current) setState("IDLE");
                }, 3500);
              }
          if (terminal) break;
        }
        if (!terminal) throw new Error("La respuesta se interrumpió. Vuelve a intentarlo.");
      } catch (err: unknown) {
        if (turn !== turnRef.current) return;
        if (err instanceof Error && err.name === "AbortError") {
          onResponseError?.();
          currentActions = settleOperatorActions(currentActions, "cancelled");
          setOperatorActions(currentActions);
          setMessages(previous => previous.flatMap(message => message.id !== assistantMessageId ? [message]
            : !message.content && !currentActions.length ? [] : [{ ...message,
              content: accumulatedText || "Solicitud detenida. Estos son los pasos realizados.",
              status: "error" as const,
              metadata: { ...message.metadata, operatorActions: currentActions },
            }]));
          console.log("[useJarvisAgent] Solicitud cancelada por el usuario");
          return;
        }

        const message = err instanceof Error ? err.message : String(err);
        console.error("[useJarvisAgent] Error:", message);
        setError(message);
        onResponseError?.();
        setState("ERROR");
        currentActions = settleOperatorActions(currentActions, "error");
        setOperatorActions(currentActions);

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  content: accumulatedText || `No pude completar la solicitud: ${message}`,
                  status: "error",
                  metadata: { ...msg.metadata, operatorActions: currentActions },
                }
              : msg
          )
        );

        setTimeout(() => {
          if (turn === turnRef.current) setState("IDLE");
        }, 3500);
      } finally {
        window.dispatchEvent(new Event("jarvis:credits"));
        if (turn === turnRef.current) {
          setIsLoading(false);
          setActivity(null);
          abortControllerRef.current = null;
        }
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
    turnRef.current++;
    abortControllerRef.current = null;
    onResponseError?.();
    const newSession = `session_${crypto.randomUUID()}`;
    setSessionId(newSession);
    if (typeof window !== "undefined") {
      localStorage.setItem(sessionKey, newSession);
    }
    setMessages([]);
    setOperatorActions([]);
    setIsLoading(false);
    setActivity(null);
    setError(null);
    setState("IDLE");
  }, [setState, sessionKey, onResponseError]);

  const cancelResponse = useCallback(() => {
    if (!abortControllerRef.current) return;
    abortControllerRef.current?.abort();
    turnRef.current++;
    abortControllerRef.current = null;
    onResponseError?.();
    setState("IDLE");
    setIsLoading(false);
    setActivity(null);
    setOperatorActions(previous => settleOperatorActions(previous, "cancelled"));
    setMessages(previous => previous.flatMap(message =>
      message.status === "processing" && !message.content && !settleOperatorActions(message.metadata?.operatorActions, "cancelled").length ? [] :
      message.status === "streaming" || message.status === "processing" ? [{ ...message, status: "error" as const,
        metadata: { ...message.metadata, operatorActions: settleOperatorActions(message.metadata?.operatorActions, "cancelled") },
      }] : [message]
    ));
  }, [onResponseError, setState]);

  return {
    messages,
    sessionId,
    isLoading,
    activity,
    operatorActions,
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
