import Link from "next/link";
import { redirect } from "next/navigation";
import { UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { Panel, Segmented, StatusDot } from "@/components/dashboard/panel";
import { TakeHandoffButton } from "./take-handoff-button";
import { DesktopNudge } from "@/components/dashboard/desktop-nudge";
import {
  handoffPriorityLabel,
  handoffReasonLabel,
  handoffStatusLabel,
  handoffStatusVariant,
  singleJoin,
} from "@/lib/labels";
import { timeAgo } from "@/lib/utils";
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

/** Punto de color según la prioridad del handoff. */
const priorityTone: Record<HandoffPriority, "bad" | "info" | "neutral"> = {
  high: "bad",
  normal: "info",
  low: "neutral",
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
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        title="Handoffs"
        description="Conversaciones que el agente escaló a un humano."
      />

      <div className="mb-4">
        <Segmented
          label="Filtrar handoffs por estado"
          value={activeFilter}
          options={filters.map((filter) => ({
            value: filter.id,
            label: filter.label,
            href:
              filter.id === "open"
                ? "/dashboard/handoffs"
                : `/dashboard/handoffs?status=${filter.id}`,
          }))}
        />
      </div>

      <DesktopNudge waiting={activeFilter === "open" ? rows.length : 0} />

      {rows.length > 0 ? (
        <Panel className="overflow-hidden">
          <Table className="text-[13px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4 sm:pl-5">Cliente</TableHead>
                <TableHead className="hidden md:table-cell">Motivo</TableHead>
                <TableHead className="hidden lg:table-cell">Resumen</TableHead>
                <TableHead className="hidden sm:table-cell">Prioridad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="hidden md:table-cell">Creado</TableHead>
                <TableHead className="pr-4 text-right sm:pr-5">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
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
                  <TableRow key={handoff.id}>
                    <TableCell className="max-w-[16rem] py-2.5 pl-4 sm:pl-5">
                      <Link
                        href={`/dashboard/handoffs/${handoff.id}`}
                        className="block truncate font-medium text-ink hover:underline"
                      >
                        {customer?.name ?? "Cliente sin nombre"}
                      </Link>
                      <p className="truncate text-[11px] tabular-nums text-muted">
                        {customer?.phone ?? "—"}
                        <span className="md:hidden">
                          {" · "}
                          {handoffReasonLabel[reason]} · {timeAgo(handoff.created_at)}
                        </span>
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted lg:hidden">
                        {handoff.summary}
                      </p>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap md:table-cell">
                      {handoffReasonLabel[reason]}
                    </TableCell>
                    <TableCell className="hidden max-w-md lg:table-cell">
                      <p className="line-clamp-2 leading-5 text-muted">
                        {handoff.summary}
                      </p>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap sm:table-cell">
                      <StatusDot tone={priorityTone[priority]}>
                        {handoffPriorityLabel[priority]}
                      </StatusDot>
                    </TableCell>
                    <TableCell>
                      <Badge variant={handoffStatusVariant[handoffStatus]}>
                        {handoffStatusLabel[handoffStatus]}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-xs text-muted md:table-cell">
                      {timeAgo(handoff.created_at)}
                    </TableCell>
                    <TableCell className="pr-4 sm:pr-5">
                      <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                        <Link
                          href={`/dashboard/handoffs/${handoff.id}`}
                          className="hidden text-xs font-medium text-muted transition hover:text-ink sm:inline"
                        >
                          Ver conversación
                        </Link>
                        {handoffStatus === "open" ? (
                          <TakeHandoffButton handoffId={handoff.id} />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Panel>
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
