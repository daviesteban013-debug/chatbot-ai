import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Phone, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { TakeHandoffButton } from "./take-handoff-button";
import {
  handoffPriorityLabel,
  handoffPriorityVariant,
  handoffReasonLabel,
  handoffStatusLabel,
  handoffStatusVariant,
  singleJoin,
  type BadgeVariant,
} from "@/lib/labels";
import { cn, timeAgo } from "@/lib/utils";
import type {
  HandoffPriority,
  HandoffReason,
  HandoffStatus,
} from "@/lib/database.types";

const filters = [
  { id: "open", label: "Abiertos" },
  { id: "taken", label: "Tomados" },
  { id: "resolved", label: "Resueltos" },
  { id: "all", label: "Todos" },
] as const;

/** Borde izquierdo de la tarjeta según la prioridad del handoff. */
const priorityBorder: Record<HandoffPriority, string> = {
  high: "border-l-rose-500",
  normal: "border-l-amber-400",
  low: "border-l-blue-400",
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

type CustomerShape = { name: string | null; phone: string } | null;

export default async function HandoffsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const activeFilter = filters.find((f) => f.id === status)?.id ?? "open";

  const tenantContext = await getCurrentTenant();
  if (!tenantContext) redirect("/login");

  const supabase = await createClient();
  const tenantId = tenantContext.tenantId;

  let query = supabase
    .from("handoffs")
    .select(
      "id, reason, summary, priority, status, taken_by, created_at, conversations(id, customers(name, phone))"
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (activeFilter !== "all") {
    query = query.eq("status", activeFilter as HandoffStatus);
  }

  const { data: handoffs } = await query;
  const rows = handoffs ?? [];

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        title="Handoffs"
        description="Conversaciones que el agente escaló a un humano."
      />

      <div className="mb-5 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm shadow-slate-200/40">
        {filters.map((filter) => (
          <Link
            key={filter.id}
            href={
              filter.id === "open"
                ? "/dashboard/handoffs"
                : `/dashboard/handoffs?status=${filter.id}`
            }
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition",
              activeFilter === filter.id
                ? "bg-slate-950 text-white"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            )}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      {rows.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((handoff) => {
            const reason = handoff.reason as HandoffReason;
            const priority = handoff.priority as HandoffPriority;
            const handoffStatus = handoff.status as HandoffStatus;

            const conversation = singleJoin(
              handoff.conversations as
                | { id: string; customers: CustomerShape | CustomerShape[] }
                | Array<{ id: string; customers: CustomerShape | CustomerShape[] }>
                | null
            );
            const customer = conversation
              ? singleJoin(conversation.customers as CustomerShape)
              : null;

            return (
              <article
                key={handoff.id}
                className={cn(
                  "flex flex-col rounded-2xl border border-slate-200/80 border-l-4 bg-white p-5 shadow-sm shadow-slate-200/40 transition hover:shadow-md",
                  priorityBorder[priority]
                )}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {customer?.name ?? "Cliente sin nombre"}
                    </p>
                    <p className="flex items-center gap-1 truncate text-xs text-slate-500">
                      <Phone className="size-3" /> {customer?.phone ?? "—"}
                    </p>
                  </div>
                  <Badge variant={handoffStatusVariant[handoffStatus]}>
                    {handoffStatusLabel[handoffStatus]}
                  </Badge>
                </div>

                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge variant={reasonVariant[reason]}>
                    {handoffReasonLabel[reason]}
                  </Badge>
                  <Badge variant={handoffPriorityVariant[priority]}>
                    {handoffPriorityLabel[priority]}
                  </Badge>
                </div>

                <p className="mb-4 line-clamp-3 flex-1 text-sm leading-6 text-slate-600">
                  {handoff.summary}
                </p>

                <p className="mb-4 text-xs text-slate-400">
                  {timeAgo(handoff.created_at)}
                </p>

                <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-4">
                  <Link
                    href={`/dashboard/handoffs/${handoff.id}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 transition hover:text-slate-950"
                  >
                    Ver conversación <ArrowRight className="size-3.5" />
                  </Link>
                  {handoffStatus === "open" ? (
                    <TakeHandoffButton handoffId={handoff.id} />
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={UserPlus}
          title="No hay handoffs"
          description="Ninguna conversación requiere intervención humana por ahora."
        />
      )}
    </div>
  );
}
