import {
  CalendarDays,
  ShoppingBag,
  MessageSquare,
  Mic,
  Coffee,
  ArrowUpRight,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Avatar } from "@/components/ui/avatar";
import {
  business,
  appointments,
  orders,
  chatHistory,
  activity,
} from "@/lib/mock-data";
import type { ActivityItem } from "@/lib/types";
import { cn, formatDate, formatCurrency } from "@/lib/utils";

type SubscriptionStatus = typeof business.subscriptionStatus;

const subscriptionBadge: Record<
  SubscriptionStatus,
  { label: string; variant: BadgeProps["variant"] }
> = {
  active: { label: "Activa", variant: "success" },
  trialing: { label: "Prueba", variant: "info" },
  past_due: { label: "Pago pendiente", variant: "danger" },
  canceled: { label: "Cancelada", variant: "neutral" },
};

const activityMeta: Record<
  ActivityItem["type"],
  { icon: typeof CalendarDays; label: string; variant: BadgeProps["variant"] }
> = {
  appointment: {
    icon: CalendarDays,
    label: "Reserva",
    variant: "info",
  },
  order: { icon: ShoppingBag, label: "Pedido", variant: "success" },
  message: { icon: MessageSquare, label: "Mensaje", variant: "neutral" },
};

/** Extrae la hora "HH:MM" de un string ISO local. */
function formatTime(iso: string): string {
  const match = /T(\d{2}:\d{2})/.exec(iso);
  return match ? match[1] : iso;
}

export default function DashboardPage() {
  const today = new Date().toISOString().slice(0, 10);

  const appointmentsToday = appointments.filter(
    (a) => a.date === today && a.status !== "canceled"
  ).length;
  const ordersToday = orders.filter((o) => o.createdAt.startsWith(today));
  const pendingOrders = ordersToday.filter((o) => o.status === "pending").length;
  const voiceNotes = chatHistory.filter((m) => m.isVoice).length;

  const recentMessages = chatHistory.slice(-5);
  const sub = subscriptionBadge[business.subscriptionStatus];

  const kpis = [
    {
      label: "Citas de hoy",
      value: appointmentsToday,
      icon: CalendarDays,
      iconWrap: "bg-blue-50 text-blue-600",
      hint: "+1 vs ayer",
    },
    {
      label: "Pedidos del día",
      value: ordersToday.length,
      icon: ShoppingBag,
      iconWrap: "bg-emerald-50 text-emerald-600",
      hint: `${pendingOrders} pendientes de confirmar`,
    },
    {
      label: "Mensajes procesados",
      value: chatHistory.length,
      icon: MessageSquare,
      iconWrap: "bg-slate-100 text-slate-700",
      hint: `${voiceNotes} notas de voz transcritas`,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado de bienvenida */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
            Hola, {business.ownerName}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Resumen de actividad de{" "}
            <span className="font-medium text-slate-700">{business.name}</span>{" "}
            · {business.niche}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Suscripción</span>
          <Badge variant={sub.variant}>{sub.label}</Badge>
        </div>
      </header>

      {/* Grid de KPIs */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <span
                    className={cn(
                      "inline-flex h-10 w-10 items-center justify-center rounded-lg",
                      kpi.iconWrap
                    )}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <ArrowUpRight
                    className="h-4 w-4 text-slate-300"
                    aria-hidden="true"
                  />
                </div>
                <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">
                  {kpi.value}
                </p>
                <p className="mt-0.5 text-sm font-medium text-slate-700">
                  {kpi.label}
                </p>
                <p className="mt-1 text-xs text-slate-500">{kpi.hint}</p>
              </CardContent>
            </Card>
          );
        })}
      </section>

      {/* Actividad + Mensajes */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Actividad Reciente */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Actividad reciente</CardTitle>
            <CardDescription>
              Acciones realizadas por tu asistente en las últimas horas.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Hora</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activity.map((item) => {
                  const meta = activityMeta[item.type];
                  const Icon = meta.icon;
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <span className="inline-flex items-center gap-2">
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                          </span>
                          <Badge variant={meta.variant}>{meta.label}</Badge>
                        </span>
                      </TableCell>
                      <TableCell className="text-slate-700">
                        {item.description}
                      </TableCell>
                      <TableCell className="text-right text-slate-500 whitespace-nowrap">
                        {formatTime(item.timestamp)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Mensajes recientes de WhatsApp */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Mensajes recientes de WhatsApp</CardTitle>
            <CardDescription>
              Conversaciones atendidas por tu asistente virtual.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <ul className="flex flex-col gap-3">
              {recentMessages.map((msg) => {
                const isOut = msg.direction === "outbound";
                return (
                  <li key={msg.id} className="flex items-start gap-3">
                    <Avatar
                      name={msg.clientName}
                      className={cn(
                        "h-9 w-9",
                        isOut && "bg-slate-900 text-white"
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {isOut ? "Asistente" : msg.clientName}
                        </p>
                        <span className="shrink-0 text-xs text-slate-400">
                          {formatTime(msg.timestamp)}
                        </span>
                      </div>
                      <div
                        className={cn(
                          "mt-1 rounded-lg border px-3 py-2 text-sm",
                          isOut
                            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                            : "border-slate-200 bg-slate-50 text-slate-700"
                        )}
                      >
                        {msg.isVoice && (
                          <span className="mb-1 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                            <Mic className="h-3.5 w-3.5" aria-hidden="true" />
                            Nota de voz
                          </span>
                        )}
                        <p className={cn(msg.isVoice && "italic")}>
                          {msg.text}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* Detalle rápido del negocio */}
      <section>
        <Card>
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-slate-900 text-white">
                <Coffee className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {business.name}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {business.niche} · Propietaria: {business.ownerName}
                </p>
              </div>
            </div>
            <div className="text-sm text-slate-500">
              Tu próximo cobro es el{" "}
              <span className="font-medium text-slate-700">
                {formatDate(business.currentPeriodEnd)}
              </span>{" "}
              por {formatCurrency(business.monthlyPrice)}.
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
