import { CalendarDays, CreditCard, Landmark } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { business } from "@/lib/mock-data";
import { formatDate, formatCurrency } from "@/lib/utils";
import { PlanSwitcher } from "./_components/plan-switcher";
import { ManageStripeButton } from "./_components/manage-stripe-button";

export const metadata = {
  title: "Suscripción | Panel del Dueño",
};

type SubscriptionStatus = typeof business.subscriptionStatus;

const statusMeta: Record<
  SubscriptionStatus,
  { label: string; variant: NonNullable<BadgeProps["variant"]> }
> = {
  active: { label: "Activa", variant: "success" },
  trialing: { label: "En prueba", variant: "info" },
  past_due: { label: "Pago pendiente", variant: "danger" },
  canceled: { label: "Cancelada", variant: "neutral" },
};

const planNames: Record<typeof business.plan, string> = {
  free: "Free",
  pro: "Pro",
  business: "Business",
};

export default function SubscriptionPage() {
  const status = statusMeta[business.subscriptionStatus];
  const nextCharge = formatDate(business.currentPeriodEnd);

  return (
    <div className="flex flex-col gap-6">
      {/* Encabezado */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
            Suscripción
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Gestiona tu plan, tu facturación y el acceso a Stripe.
          </p>
        </div>
        <ManageStripeButton />
      </header>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Plan actual */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Plan actual</CardTitle>
            <CardDescription>
              Suscripción de {business.name} · titular {business.ownerName}.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col justify-center gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-slate-900 text-white">
                <Landmark className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xl font-semibold tracking-tight text-slate-900">
                    {planNames[business.plan]}
                  </p>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </div>
                <p className="mt-0.5 text-sm text-slate-500">
                  Facturación mensual
                </p>
              </div>
            </div>
            <p className="text-3xl font-semibold tracking-tight text-slate-900">
              {formatCurrency(business.monthlyPrice)}
              <span className="ml-1 text-sm font-normal text-slate-500">
                / mes
              </span>
            </p>
          </CardContent>
        </Card>

        {/* Detalles de facturación */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Detalles de facturación</CardTitle>
            <CardDescription>
              Próximo cobro y método de pago asociado a tu cuenta.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4">
            <ul className="flex flex-col divide-y divide-slate-100">
              <li className="flex items-center justify-between gap-3 py-3 first:pt-0">
                <span className="inline-flex items-center gap-2 text-sm text-slate-500">
                  <CalendarDays className="h-4 w-4" aria-hidden="true" />
                  Próximo cobro
                </span>
                <span className="text-right text-sm font-medium text-slate-900">
                  {nextCharge}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3 py-3">
                <span className="inline-flex items-center gap-2 text-sm text-slate-500">
                  <CreditCard className="h-4 w-4" aria-hidden="true" />
                  Método de pago
                </span>
                <span className="text-right text-sm font-medium text-slate-900">
                  Visa terminación 4242
                </span>
              </li>
              <li className="flex items-center justify-between gap-3 py-3 last:pb-0">
                <span className="inline-flex items-center gap-2 text-sm text-slate-500">
                  <Landmark className="h-4 w-4" aria-hidden="true" />
                  Estado
                </span>
                <Badge variant={status.variant}>{status.label}</Badge>
              </li>
            </ul>
            <p className="mt-auto text-xs text-slate-500">
              El cargo de {formatCurrency(business.monthlyPrice)} se realizará
              automáticamente el {nextCharge}.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Cambiar de plan */}
      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">
            Cambiar de plan
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Elige el plan que mejor se adapte al volumen de conversaciones de
            tu negocio. Los cambios se aplican de inmediato.
          </p>
        </div>
        <PlanSwitcher currentPlan={business.plan} />
      </section>
    </div>
  );
}
