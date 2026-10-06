"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Lock,
  MessageSquare,
  Phone,
  Send,
  UserPlus,
  UserCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  handoffPriorityLabel,
  handoffPriorityVariant,
  handoffReasonLabel,
  handoffStatusLabel,
  handoffStatusVariant,
  type BadgeVariant,
} from "@/lib/labels";
import { cn, formatDateTime, formatTime, timeAgo } from "@/lib/utils";
import type {
  HandoffPriority,
  HandoffReason,
  HandoffStatus,
  MessageDirection,
  MessageSender,
  MessageType,
} from "@/lib/database.types";
import {
  resolveHandoff,
  sendHumanReply,
  takeHandoff,
} from "../actions";

export type ThreadMessage = {
  id: string;
  direction: MessageDirection;
  sender: MessageSender;
  type: MessageType;
  body: string | null;
  media_url: string | null;
  transcript: string | null;
  created_at: string;
};

type Props = {
  handoffId: string;
  status: HandoffStatus;
  reason: HandoffReason;
  summary: string;
  priority: HandoffPriority;
  createdAt: string;
  resolvedAt: string | null;
  isMine: boolean;
  takenByName: string | null;
  customerName: string;
  customerPhone: string;
  customerCity: string | null;
  messages: ThreadMessage[];
};

/** Color del badge por motivo del handoff. */
const reasonVariant: Record<HandoffReason, BadgeVariant> = {
  reclamo: "danger",
  negociacion: "warning",
  incertidumbre: "info",
  fuera_de_catalogo: "neutral",
  solicitud_cliente: "info",
  pedido_alto_valor: "warning",
  otro: "neutral",
};

export function HandoffClient(props: Props) {
  const {
    handoffId,
    status,
    reason,
    summary,
    priority,
    createdAt,
    resolvedAt,
    isMine,
    takenByName,
    customerName,
    customerPhone,
    customerCity,
  } = props;

  const router = useRouter();
  const [messages, setMessages] = useState<ThreadMessage[]>(props.messages);
  const [prevServerMessages, setPrevServerMessages] = useState(props.messages);
  // Sincroniza con los datos frescos del servidor tras un refresh
  // (patrón "ajustar estado durante el render" para evitar setState en efecto).
  if (props.messages !== prevServerMessages) {
    setPrevServerMessages(props.messages);
    setMessages(props.messages);
  }
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmingResolve, setConfirmingResolve] = useState(false);
  const [isPending, startTransition] = useTransition();

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll al final del hilo cuando cambian los mensajes.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  function handleTake() {
    setError(null);
    startTransition(async () => {
      const result = await takeHandoff(handoffId);
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  function handleSend() {
    const text = draft.trim();
    if (!text || isPending) return;
    setError(null);

    // Optimistic append.
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        direction: "outbound",
        sender: "human",
        type: "text",
        body: text,
        media_url: null,
        transcript: null,
        created_at: new Date().toISOString(),
      },
    ]);
    setDraft("");

    startTransition(async () => {
      const result = await sendHumanReply(handoffId, text);
      if (!result.ok) {
        setError(result.error);
        // Revierte el mensaje optimista si falló el envío.
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setDraft(text);
      } else {
        router.refresh();
      }
    });
  }

  function handleResolve() {
    setError(null);
    startTransition(async () => {
      const result = await resolveHandoff(handoffId);
      if (!result.ok) setError(result.error);
      setConfirmingResolve(false);
      router.refresh();
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      {/* Panel de conversación */}
      <section className="flex min-h-[70vh] flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-slate-950">
              {customerName}
            </h1>
            <p className="flex items-center gap-1 truncate text-xs text-slate-500">
              <Phone className="size-3" /> {customerPhone}
            </p>
          </div>
          <Badge variant={handoffStatusVariant[status]}>
            {handoffStatusLabel[status]}
          </Badge>
        </header>

        <div
          ref={scrollRef}
          className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-5"
        >
          {messages.length > 0 ? (
            messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <MessageSquare className="mx-auto mb-2 size-6 text-slate-300" />
                <p className="text-sm text-slate-400">Sin mensajes registrados</p>
              </div>
            </div>
          )}
        </div>

        {error ? (
          <div className="flex items-center gap-2 border-t border-rose-100 bg-rose-50 px-5 py-2.5 text-xs text-rose-700">
            <AlertTriangle className="size-3.5 shrink-0" />
            {error}
          </div>
        ) : null}

        {/* Zona de acciones / entrada de mensaje */}
        <footer className="border-t border-slate-100 bg-white px-5 py-4">
          {status === "open" ? (
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                Este handoff está abierto. Tómalo para responder al cliente.
              </p>
              <Button
                type="button"
                onClick={handleTake}
                disabled={isPending}
                className="bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-600"
              >
                <UserPlus className="size-4" />
                {isPending ? "Tomando…" : "Tomar handoff"}
              </Button>
            </div>
          ) : status === "taken" && isMine ? (
            <div className="space-y-3">
              <div className="flex items-end gap-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  placeholder="Escribe tu respuesta al cliente…"
                  className="flex-1 resize-none"
                  disabled={isPending}
                />
                <Button
                  type="button"
                  onClick={handleSend}
                  disabled={isPending || !draft.trim()}
                  className="shrink-0 bg-slate-950 text-white hover:bg-slate-800"
                >
                  <Send className="size-4" />
                  Enviar
                </Button>
              </div>

              {confirmingResolve ? (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <span className="text-xs font-medium text-amber-800">
                    ¿Resolver este handoff y devolverlo al agente?
                  </span>
                  <div className="ml-auto flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setConfirmingResolve(false)}
                      disabled={isPending}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleResolve}
                      disabled={isPending}
                      className="bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-600"
                    >
                      <CheckCircle2 className="size-4" />
                      Sí, resolver
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirmingResolve(true)}
                  disabled={isPending}
                  className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                >
                  <CheckCircle2 className="size-4" />
                  Resolver y liberar
                </Button>
              )}
            </div>
          ) : status === "taken" ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Lock className="size-4 shrink-0 text-slate-400" />
              Tomado por{" "}
              <span className="font-medium text-slate-800">
                {takenByName ?? "otro operador"}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
              Handoff resuelto. La conversación volvió al agente.
            </div>
          )}
        </footer>
      </section>

      {/* Panel de información del handoff */}
      <aside className="space-y-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">
            Detalle del handoff
          </h2>

          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Motivo
              </dt>
              <dd className="mt-1">
                <Badge variant={reasonVariant[reason]}>
                  {handoffReasonLabel[reason]}
                </Badge>
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Resumen del agente
              </dt>
              <dd className="mt-1 leading-6 text-slate-700">{summary}</dd>
            </div>

            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Prioridad
              </dt>
              <dd className="mt-1">
                <Badge variant={handoffPriorityVariant[priority]}>
                  {handoffPriorityLabel[priority]}
                </Badge>
              </dd>
            </div>

            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Estado
              </dt>
              <dd className="mt-1">
                <Badge variant={handoffStatusVariant[status]}>
                  {handoffStatusLabel[status]}
                </Badge>
              </dd>
            </div>

            <div className="flex items-start gap-2 border-t border-slate-100 pt-4">
              <Clock className="mt-0.5 size-4 shrink-0 text-slate-400" />
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Creado
                </dt>
                <dd className="mt-0.5 text-slate-700">
                  {formatDateTime(createdAt)}
                  <span className="ml-1 text-slate-400">· {timeAgo(createdAt)}</span>
                </dd>
              </div>
            </div>

            {resolvedAt ? (
              <div className="flex items-start gap-2">
                <UserCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Resuelto
                  </dt>
                  <dd className="mt-0.5 text-slate-700">
                    {formatDateTime(resolvedAt)}
                  </dd>
                </div>
              </div>
            ) : null}

            {status === "taken" ? (
              <div className="flex items-start gap-2">
                <UserCheck className="mt-0.5 size-4 shrink-0 text-slate-400" />
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Tomado por
                  </dt>
                  <dd className="mt-0.5 text-slate-700">
                    {isMine ? "Tú" : (takenByName ?? "otro operador")}
                  </dd>
                </div>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/40">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Cliente</h2>
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-slate-950 text-sm font-semibold text-white">
              {customerName.replace(/\s/g, "").slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {customerName}
              </p>
              <p className="flex items-center gap-1 truncate text-xs text-slate-500">
                <Phone className="size-3" /> {customerPhone}
              </p>
            </div>
          </div>
          {customerCity ? (
            <p className="mt-3 text-xs text-slate-500">Ciudad: {customerCity}</p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

/** Burbuja de mensaje, mismo estilo que el detalle de conversaciones. */
function MessageBubble({ message }: { message: ThreadMessage }) {
  const outbound = message.direction === "outbound";
  return (
    <div className={cn("flex", outbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-sm",
          outbound
            ? "rounded-br-sm bg-slate-950 text-white"
            : "rounded-bl-sm border border-slate-200 bg-white text-slate-800"
        )}
      >
        {message.type !== "text" && message.media_url ? (
          <p
            className={cn(
              "mb-1 text-[11px] uppercase tracking-wide",
              outbound ? "text-slate-400" : "text-slate-400"
            )}
          >
            {message.type}
          </p>
        ) : null}
        {message.body?.trim() ? (
          <p className="whitespace-pre-wrap leading-6">{message.body}</p>
        ) : message.transcript ? (
          <p className="whitespace-pre-wrap leading-6 italic opacity-90">
            {message.transcript}
          </p>
        ) : message.media_url ? null : (
          <p className="italic opacity-70">Mensaje sin contenido</p>
        )}
        <p
          className={cn(
            "mt-1 text-[10px]",
            outbound ? "text-slate-400" : "text-slate-400"
          )}
        >
          {outbound ? (message.sender === "human" ? "Humano · " : "Agente · ") : ""}
          {formatTime(message.created_at)}
        </p>
      </div>
    </div>
  );
}
