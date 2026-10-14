"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Lock,
  MessageSquare,
  Phone,
  Send,
  UserPlus,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Panel, PanelHeader } from "@/components/dashboard/panel";
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
  canOperate: boolean;
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

/** Fila etiqueta/valor del panel de detalle. */
const detailRow = "flex items-center justify-between gap-4 px-4 py-2.5 sm:px-5";

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
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      {/* Panel de conversación */}
      <Panel className="flex h-[75vh] min-h-[32rem] flex-col overflow-hidden">
        <PanelHeader
          title="Conversación"
          actions={
            <span className="text-xs tabular-nums text-muted">
              {messages.length} {messages.length === 1 ? "mensaje" : "mensajes"}
            </span>
          }
        />

        <div
          ref={scrollRef}
          className="flex-1 space-y-2 overflow-y-auto bg-subtle/50 p-4 sm:p-5"
        >
          {messages.length > 0 ? (
            messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <MessageSquare className="mx-auto mb-2 size-5 text-muted" strokeWidth={1.75} />
                <p className="text-[13px] text-muted">Sin mensajes registrados</p>
              </div>
            </div>
          )}
        </div>

        {error ? (
          <div className="flex items-center gap-2 border-t border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-800 sm:px-5">
            <AlertTriangle className="size-3.5 shrink-0" />
            {error}
          </div>
        ) : null}

        {/* Zona de acciones / entrada de mensaje */}
        <footer className="border-t border-line bg-surface px-4 py-3 sm:px-5">
          {!props.canOperate ? <p className="flex items-center gap-2 text-[13px] text-muted"><Lock className="size-3.5 shrink-0" />Acceso de solo lectura. Puedes consultar la conversación; responder y gestionar el handoff requiere un rol operativo.</p> : status === "open" ? (
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[13px] text-muted">
                Este handoff está abierto. Tómalo para responder al cliente.
              </p>
              <Button
                type="button"
                size="sm"
                onClick={handleTake}
                disabled={isPending}
              >
                <UserPlus className="size-4" />
                {isPending ? "Tomando…" : "Tomar handoff"}
              </Button>
            </div>
          ) : status === "taken" && isMine ? (
            <div className="space-y-2.5">
              <div className="flex items-end gap-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  placeholder="Escribe tu respuesta al cliente…"
                  className="flex-1 resize-none text-[13px]"
                  disabled={isPending}
                />
                <Button
                  type="button"
                  onClick={handleSend}
                  disabled={isPending || !draft.trim()}
                  className="shrink-0"
                >
                  <Send className="size-4" />
                  Enviar
                </Button>
              </div>

              {confirmingResolve ? (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
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
                    >
                      <CheckCircle2 className="size-4" />
                      Sí, resolver
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[11px] text-muted">Enter envía · Shift+Enter agrega una línea</p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirmingResolve(true)}
                    disabled={isPending}
                  >
                    <CheckCircle2 className="size-4 text-emerald-600" />
                    Resolver y liberar
                  </Button>
                </div>
              )}
            </div>
          ) : status === "taken" ? (
            <div className="flex items-center gap-2 text-[13px] text-muted">
              <Lock className="size-3.5 shrink-0" />
              Tomado por{" "}
              <span className="font-medium text-ink">
                {takenByName ?? "otro operador"}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-[13px] text-muted">
              <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />
              Handoff resuelto. La conversación volvió al agente.
            </div>
          )}
        </footer>
      </Panel>

      {/* Panel de información del handoff */}
      <aside className="space-y-5">
        <Panel>
          <PanelHeader title="Detalle del handoff" />

          <dl className="divide-y divide-line text-[13px]">
            <div className="px-4 py-3 sm:px-5">
              <dt className="text-xs text-muted">Resumen del agente</dt>
              <dd className="mt-1 leading-6 text-ink-soft">{summary}</dd>
            </div>

            <div className={detailRow}>
              <dt className="text-muted">Motivo</dt>
              <dd>
                <Badge variant={reasonVariant[reason]}>
                  {handoffReasonLabel[reason]}
                </Badge>
              </dd>
            </div>

            <div className={detailRow}>
              <dt className="text-muted">Prioridad</dt>
              <dd>
                <Badge variant={handoffPriorityVariant[priority]}>
                  {handoffPriorityLabel[priority]}
                </Badge>
              </dd>
            </div>

            <div className={detailRow}>
              <dt className="text-muted">Estado</dt>
              <dd>
                <Badge variant={handoffStatusVariant[status]}>
                  {handoffStatusLabel[status]}
                </Badge>
              </dd>
            </div>

            <div className={cn(detailRow, "items-start")}>
              <dt className="text-muted">Creado</dt>
              <dd className="text-right">
                <span className="block font-medium text-ink">{formatDateTime(createdAt)}</span>
                <span className="block text-[11px] text-muted">{timeAgo(createdAt)}</span>
              </dd>
            </div>

            {resolvedAt ? (
              <div className={detailRow}>
                <dt className="text-muted">Resuelto</dt>
                <dd className="text-right font-medium text-ink">
                  {formatDateTime(resolvedAt)}
                </dd>
              </div>
            ) : null}

            {status === "taken" ? (
              <div className={detailRow}>
                <dt className="text-muted">Tomado por</dt>
                <dd className="min-w-0 truncate text-right font-medium text-ink">
                  {isMine ? "Tú" : (takenByName ?? "otro operador")}
                </dd>
              </div>
            ) : null}
          </dl>
        </Panel>

        <Panel>
          <PanelHeader title="Cliente" />
          <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <Avatar name={customerName} />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-ink">
                {customerName}
              </p>
              <p className="flex items-center gap-1 truncate text-xs tabular-nums text-muted">
                <Phone className="size-3" /> {customerPhone}
              </p>
            </div>
          </div>
          {customerCity ? (
            <div className={cn(detailRow, "border-t border-line text-[13px]")}>
              <span className="text-muted">Ciudad</span>
              <span className="font-medium text-ink">{customerCity}</span>
            </div>
          ) : null}
        </Panel>
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
          "max-w-[75%] rounded-lg px-3 py-2 text-[13px]",
          outbound
            ? "bg-ink text-white"
            : "border border-line bg-surface text-ink"
        )}
      >
        {message.type !== "text" && message.media_url ? (
          <p
            className={cn(
              "mb-1 text-[11px] uppercase tracking-wide",
              outbound ? "text-white/60" : "text-muted"
            )}
          >
            {message.type}
          </p>
        ) : null}
        {message.body?.trim() ? (
          <p className="whitespace-pre-wrap leading-relaxed">{message.body}</p>
        ) : message.transcript ? (
          <p className="whitespace-pre-wrap leading-relaxed italic opacity-90">
            {message.transcript}
          </p>
        ) : message.media_url ? null : (
          <p className="italic opacity-70">Mensaje sin contenido</p>
        )}
        <p
          className={cn(
            "mt-1 text-[10px] tabular-nums",
            outbound ? "text-white/60" : "text-muted"
          )}
        >
          {outbound ? (message.sender === "human" ? "Humano · " : "Agente · ") : ""}
          {formatTime(message.created_at)}
        </p>
      </div>
    </div>
  );
}
