import type { Metadata } from "next";
import { CalendarDays, ShoppingBag } from "lucide-react";
import { appointments, orders } from "@/lib/mock-data";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { AppointmentsTab } from "./_components/appointments-tab";
import { OrdersTab } from "./_components/orders-tab";

export const metadata: Metadata = {
  title: "CRM — Panel del Dueño",
};

export default function CrmPage() {
  const pendingAppointments = appointments.filter(
    (appointment) => appointment.status === "pending"
  ).length;
  const pendingOrders = orders.filter(
    (order) => order.status === "pending"
  ).length;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      {/* Encabezado */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
            CRM
          </h1>
          <p className="mt-1 text-sm sm:text-base text-slate-500">
            Citas y pedidos gestionados por tu asistente
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="warning">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            {pendingAppointments}{" "}
            {pendingAppointments === 1
              ? "cita pendiente"
              : "citas pendientes"}
          </Badge>
          <Badge variant="warning">
            <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
            {pendingOrders}{" "}
            {pendingOrders === 1 ? "pedido pendiente" : "pedidos pendientes"}
          </Badge>
        </div>
      </header>

      {/* Pestañas Citas / Pedidos */}
      <Tabs
        defaultActiveId="citas"
        items={[
          {
            id: "citas",
            label: `Citas (${appointments.length})`,
            content: <AppointmentsTab appointments={appointments} />,
          },
          {
            id: "pedidos",
            label: `Pedidos (${orders.length})`,
            content: <OrdersTab orders={orders} />,
          },
        ]}
      />
    </div>
  );
}
