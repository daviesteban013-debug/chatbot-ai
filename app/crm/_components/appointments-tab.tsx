import { Phone } from "lucide-react";
import type { Appointment } from "@/lib/types";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const MONTHS_ES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

/** "2026-09-29" -> "29 sep 2026" (parseo manual para evitar desfases de zona horaria) */
function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return `${String(day).padStart(2, "0")} ${MONTHS_ES[month - 1]} ${year}`;
}

/** "15:00" -> "3:00 PM" */
function formatTime12h(time: string): string {
  const [hoursStr, minutesStr] = time.split(":");
  const hours = Number(hoursStr);
  if (Number.isNaN(hours)) return time;
  const period = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hours12}:${minutesStr ?? "00"} ${period}`;
}

const STATUS_CONFIG: Record<
  Appointment["status"],
  { label: string; variant: "success" | "warning" | "danger" }
> = {
  confirmed: { label: "Confirmada", variant: "success" },
  pending: { label: "Pendiente", variant: "warning" },
  canceled: { label: "Cancelada", variant: "danger" },
};

/** Próximas primero (fecha/hora ascendente); las canceladas al final. Orden explícito y estable. */
function sortAppointments(items: Appointment[]): Appointment[] {
  return [...items].sort((a, b) => {
    const aCanceled = a.status === "canceled" ? 1 : 0;
    const bCanceled = b.status === "canceled" ? 1 : 0;
    if (aCanceled !== bCanceled) return aCanceled - bCanceled;
    const byWhen = `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`);
    if (byWhen !== 0) return byWhen;
    return a.id.localeCompare(b.id);
  });
}

export function AppointmentsTab({
  appointments,
}: {
  appointments: Appointment[];
}) {
  const sorted = sortAppointments(appointments);

  return (
    <div className="space-y-4">
      {/* Tabla — solo desktop */}
      <Card className="hidden md:block overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/60 hover:bg-slate-50/60">
              <TableHead>Cliente</TableHead>
              <TableHead>Servicio</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Hora</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Contacto</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((appointment) => {
              const status = STATUS_CONFIG[appointment.status];
              return (
                <TableRow key={appointment.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar name={appointment.clientName} />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 truncate">
                          {appointment.clientName}
                        </p>
                        <p className="text-xs text-slate-500 md:hidden">
                          {appointment.clientPhone}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-64">
                    <span className="line-clamp-2">{appointment.service}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(appointment.date)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatTime12h(appointment.time)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <a
                      href={`tel:${appointment.clientPhone.replace(/\s+/g, "")}`}
                      className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors"
                    >
                      <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                      {appointment.clientPhone}
                    </a>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Cards apiladas — solo móvil */}
      <div className="md:hidden space-y-3">
        {sorted.map((appointment) => {
          const status = STATUS_CONFIG[appointment.status];
          return (
            <Card
              key={appointment.id}
              className={cn(
                "p-4",
                appointment.status === "canceled" && "opacity-70"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={appointment.clientName} />
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">
                      {appointment.clientName}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {appointment.clientPhone}
                    </p>
                  </div>
                </div>
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>
              <p className="mt-3 text-sm text-slate-700">
                {appointment.service}
              </p>
              <div className="mt-3 flex items-center gap-2 text-sm">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
                  {formatDate(appointment.date)}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
                  {formatTime12h(appointment.time)}
                </span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
