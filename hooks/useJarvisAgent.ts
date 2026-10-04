"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useJarvisAvatar } from "@/context/JarvisAvatarContext";
import type { ChatMessage, AgentStreamPayload } from "@/types/jarvis";

export interface UseJarvisAgentOptions {
  initialSessionId?: string;
  tenantId?: string;
  onResponseComplete?: (message: ChatMessage) => void;
}

export interface UseJarvisAgentReturn {
  messages: ChatMessage[];
  sessionId: string;
  isLoading: boolean;
  error: string | null;
  input: string;
  setInput: (value: string) => void;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | string) => void;
  sendMessage: (customText?: string) => Promise<void>;
  clearChat: () => void;
  reloadHistory: () => Promise<void>;
}

export function useJarvisAgent(options: UseJarvisAgentOptions = {}): UseJarvisAgentReturn {
  const { initialSessionId, tenantId, onResponseComplete } = options;
  const { setState, setAudioLevel, triggerListening } = useJarvisAvatar();

  const [sessionId, setSessionId] = useState<string>(() => {
    if (initialSessionId) return initialSessionId;
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("jarvis_chat_session_id");
      if (stored) return stored;
    }
    const fresh = `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    if (typeof window !== "undefined") {
      localStorage.setItem("jarvis_chat_session_id", fresh);
    }
    return fresh;
  });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");

  const speechPulseIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Iniciar modulación de audio/onda al hablar
  const startSpeechPulse = useCallback(() => {
    if (speechPulseIntervalRef.current) return;
    speechPulseIntervalRef.current = setInterval(() => {
      // Modulación orgánica pseudo-armónica de amplitud de voz
      const wave = Math.sin(Date.now() * 0.015) * 0.4 + Math.sin(Date.now() * 0.035) * 0.3 + 0.3;
      setAudioLevel(Math.max(0.1, Math.min(1.0, wave)));
    }, 50);
  }, [setAudioLevel]);

  // Detener modulación al terminar de hablar
  const stopSpeechPulse = useCallback(() => {
    if (speechPulseIntervalRef.current) {
      clearInterval(speechPulseIntervalRef.current);
      speechPulseIntervalRef.current = null;
    }
    setAudioLevel(0);
  }, [setAudioLevel]);

  // Cargar historial de la sesión
  const reloadHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat?sessionId=${encodeURIComponent(sessionId)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.messages)) {
          setMessages(
            data.messages.map((m: { id?: string; role: string; content: string; createdAt?: string }) => ({
              id: m.id || Math.random().toString(),
              role: m.role as ChatMessage["role"],
              content: m.content,
              createdAt: m.createdAt || new Date().toISOString(),
              status: "completed",
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
            data.messages.map((m: { id?: string; role: string; content: string; createdAt?: string }) => ({
              id: m.id || Math.random().toString(),
              role: m.role as ChatMessage["role"],
              content: m.content,
              createdAt: m.createdAt || new Date().toISOString(),
              status: "completed",
            }))
          );
        }
      })
      .catch((err) => {
        console.warn("[useJarvisAgent] No se pudo cargar historial previo:", err);
      });

    return () => {
      active = false;
      stopSpeechPulse();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [sessionId, stopSpeechPulse]);

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
      const messageText = (customText ?? input).trim();
      if (!messageText || isLoading) return;

      setInput("");
      setError(null);
      setIsLoading(true);

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

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulatedText = "";
        let hasStartedSpeaking = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;

            const jsonStr = trimmed.replace(/^data:\s*/, "");
            try {
              const payload: AgentStreamPayload = JSON.parse(jsonStr);

              if (payload.status === "processing") {
                setState("PROCESSING");
              } else if (payload.status === "streaming" && payload.delta) {
                if (!hasStartedSpeaking) {
                  hasStartedSpeaking = true;
                  setState("SPEAKING");
                  startSpeechPulse();
                }

                accumulatedText += payload.delta;

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
                stopSpeechPulse();
                setState("IDLE");

                const finalContent = payload.content || accumulatedText;
                const finalMsg: ChatMessage = {
                  id: payload.messageId || assistantMessageId,
                  role: "assistant",
                  content: finalContent,
                  createdAt: new Date().toISOString(),
                  status: "completed",
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
                stopSpeechPulse();
                setState("ERROR");
                setError(payload.error || "Error desconocido");

                // Auto-recuperación a IDLE tras 3.5 segundos
                setTimeout(() => {
                  setState("IDLE");
                }, 3500);
              }
            } catch (parseError) {
              console.warn("[useJarvisAgent] Línea no parseable:", jsonStr, parseError);
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          console.log("[useJarvisAgent] Solicitud cancelada por el usuario");
          return;
        }

        const message = err instanceof Error ? err.message : String(err);
        console.error("[useJarvisAgent] Error:", message);
        setError(message);
        stopSpeechPulse();
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
        setIsLoading(false);
        stopSpeechPulse();
        abortControllerRef.current = null;
      }
    },
    [
      input,
      isLoading,
      sessionId,
      tenantId,
      setState,
      startSpeechPulse,
      stopSpeechPulse,
      onResponseComplete,
    ]
  );

  const clearChat = useCallback(() => {
    const newSession = `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    setSessionId(newSession);
    if (typeof window !== "undefined") {
      localStorage.setItem("jarvis_chat_session_id", newSession);
    }
    setMessages([]);
    setError(null);
    setState("IDLE");
  }, [setState]);

  return {
    messages,
    sessionId,
    isLoading,
    error,
    input,
    setInput,
    handleInputChange,
    sendMessage,
    clearChat,
    reloadHistory,
  };
}
