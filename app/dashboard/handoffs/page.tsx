import Link from "next/link";
import { redirect } from "next/navigation";
import { UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  handoffPriorityLabel,
  handoffPriorityVariant,
  handoffReasonLabel,
  handoffStatusLabel,
  handoffStatusVariant,
} from "@/lib/labels";
import { cn, formatDateTime } from "@/lib/utils";
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

export default async function HandoffsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const activeFilter =
    filters.find((f) => f.id === status)?.id ?? "open";

  const tenantContext = await getCurrentTenant();
  if (!tenantContext) redirect("/login");

  const supabase = await createClient();
  const tenantId = tenantContext.tenantId;

  let query = supabase
    .from("handoffs")
    .select("id, reason, summary, priority, status, created_at")
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
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/40">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Motivo</TableHead>
                <TableHead>Resumen</TableHead>
                <TableHead>Prioridad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="pr-5">Creado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((handoff) => (
                <TableRow key={handoff.id}>
                  <TableCell className="pl-5 font-medium text-slate-900">
                    {handoffReasonLabel[handoff.reason as HandoffReason]}
                  </TableCell>
                  <TableCell className="max-w-md text-slate-600">
                    <span className="line-clamp-2">{handoff.summary}</span>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        handoffPriorityVariant[handoff.priority as HandoffPriority]
                      }
                    >
                      {handoffPriorityLabel[handoff.priority as HandoffPriority]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={handoffStatusVariant[handoff.status as HandoffStatus]}
                    >
                      {handoffStatusLabel[handoff.status as HandoffStatus]}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-5 text-slate-500">
                    {formatDateTime(handoff.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
