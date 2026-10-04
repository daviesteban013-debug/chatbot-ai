"use client";

import { useRef, useEffect } from "react";
import {
  Send,
  Sparkles,
  RotateCcw,
  Bot,
  User,
  Zap,
  Volume2,
} from "lucide-react";
import { useJarvisAgent } from "@/hooks/useJarvisAgent";
import { useJarvisAvatar } from "@/context/JarvisAvatarContext";

export function JarvisLiveChat({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  const {
    messages,
    isLoading,
    error,
    input,
    handleInputChange,
    sendMessage,
    clearChat,
  } = useJarvisAgent();

  const { state, statusLabel } = useJarvisAvatar();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll al final del chat cuando llegan nuevos chunks o mensajes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage();
  };

  const suggestionPrompts = [
    "¿Qué puedes hacer por mi negocio?",
    "¿Cómo respondes a un cliente indeciso?",
    "Simula tomar un pedido de catálogo",
  ];

  return (
    <div
      className={`flex flex-col rounded-3xl border border-white/10 bg-zinc-950/80 p-4 shadow-2xl backdrop-blur-xl ${className}`}
    >
      {/* Header del Chat */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="relative flex size-8 items-center justify-center rounded-xl bg-yellow-400/10 text-yellow-300 border border-yellow-400/20">
            <Bot className="size-4" />
            <span
              className={`absolute -bottom-0.5 -right-0.5 size-2 rounded-full ${
                state === "SPEAKING"
                  ? "bg-emerald-400 animate-ping"
                  : state === "PROCESSING"
                  ? "bg-sky-400 animate-pulse"
                  : state === "ERROR"
                  ? "bg-red-400"
                  : "bg-emerald-400"
              }`}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-100">
                Jarvis Neural Core
              </span>
              <span className="rounded-full bg-yellow-400/10 px-1.5 py-0.2 text-[9px] font-mono font-medium text-yellow-300 border border-yellow-400/20">
                LIVE
              </span>
            </div>
            <p className="text-[10px] font-mono text-zinc-400">{statusLabel}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={clearChat}
          title="Reiniciar conversación"
          className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-200"
        >
          <RotateCcw className="size-3.5" />
        </button>
      </div>

      {/* Historial de Mensajes */}
      <div
        ref={scrollRef}
        className={`my-3 space-y-3 overflow-y-auto pr-1 text-xs scrollbar-thin scrollbar-thumb-zinc-800 ${
          compact ? "max-h-[220px]" : "max-h-[320px] min-h-[200px]"
        }`}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center text-zinc-500">
            <Sparkles className="mb-2 size-6 text-yellow-400/40 animate-pulse" />
            <p className="text-xs font-medium text-zinc-400">
              Interacción en tiempo real con el Núcleo 3D
            </p>
            <p className="mt-1 max-w-[240px] text-[11px] text-zinc-500">
              Escribe un mensaje o prueba una de las sugerencias rápidas abajo.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === "user";
            return (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}
              >
                {!isUser && (
                  <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-yellow-400/20 text-yellow-300">
                    <Bot className="size-3" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 leading-relaxed ${
                    isUser
                      ? "rounded-br-sm bg-gradient-to-r from-yellow-400 to-amber-400 text-zinc-950 font-medium shadow-md shadow-yellow-400/10"
                      : "rounded-bl-sm border border-white/10 bg-zinc-900/90 text-zinc-200"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {msg.status === "streaming" && (
                    <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-yellow-400" />
                  )}
                </div>

                {isUser && (
                  <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300">
                    <User className="size-3" />
                  </div>
                )}
              </div>
            );
          })
        )}

        {state === "PROCESSING" && (
          <div className="flex items-center gap-2 text-zinc-400 text-[11px] font-mono py-1">
            <Zap className="size-3 text-sky-400 animate-spin" />
            <span>Jarvis procesando respuesta en streaming...</span>
          </div>
        )}

        {state === "SPEAKING" && (
          <div className="flex items-center gap-2 text-emerald-400 text-[11px] font-mono py-1">
            <Volume2 className="size-3 animate-pulse" />
            <span>Transmitiendo respuesta al avatar 3D...</span>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-2.5 text-[11px] text-red-200">
            {error}
          </div>
        )}
      </div>

      {/* Chips de sugerencias rápidas */}
      {messages.length === 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {suggestionPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => sendMessage(prompt)}
              disabled={isLoading}
              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-zinc-300 transition hover:border-yellow-400/30 hover:bg-yellow-400/10 hover:text-yellow-200 disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Formulario de Entrada */}
      <form onSubmit={handleSubmit} className="relative flex items-center gap-2">
        <input
          value={input}
          onChange={handleInputChange}
          placeholder={
            state === "PROCESSING"
              ? "Procesando..."
              : state === "SPEAKING"
              ? "Jarvis respondiendo..."
              : "Habla con Jarvis..."
          }
          disabled={isLoading}
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-zinc-900/90 px-3.5 py-2.5 text-xs text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-yellow-400/40 focus:ring-1 focus:ring-yellow-400/30 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-yellow-400 text-zinc-950 transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
          title="Enviar mensaje"
        >
          <Send className="size-3.5" />
        </button>
      </form>
    </div>
  );
}
