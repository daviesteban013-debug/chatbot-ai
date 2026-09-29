"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency } from "@/lib/utils";

export type PlanId = "free" | "pro" | "business";

interface PlanSwitcherProps {
  currentPlan: PlanId;
}

const plans: {
  id: PlanId;
  name: string;
  price: number;
  tagline: string;
  benefits: string[];
}[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    tagline: "Para empezar a automatizar tu WhatsApp.",
    benefits: [
      "1 asistente de IA en WhatsApp",
      "Hasta 100 conversaciones al mes",
      "Configuración predeterminada por nicho",
      "Soporte por correo electrónico",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 29,
    tagline: "Para negocios con reservas y pedidos frecuentes.",
    benefits: [
      "Todo lo del plan Free",
      "Conversaciones ilimitadas",
      "Reglas de negocio y catálogo personalizados",
      "Panel de actividad y métricas",
    ],
  },
  {
    id: "business",
    name: "Business",
    price: 79,
    tagline: "Para equipos que necesitan control total.",
    benefits: [
      "Todo lo del plan Pro",
      "Hasta 5 números de WhatsApp",
      "CRM completo de clientes",
      "Soporte prioritario",
    ],
  },
];

const planOrder: PlanId[] = ["free", "pro", "business"];

export function PlanSwitcher({ currentPlan }: PlanSwitcherProps) {
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  function handleChangePlan() {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastVisible(true);
    toastTimerRef.current = setTimeout(() => setToastVisible(false), 2500);
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const isUpgrade =
            planOrder.indexOf(plan.id) > planOrder.indexOf(currentPlan);
          return (
            <Card
              key={plan.id}
              className={cn(
                "flex flex-col",
                isCurrent && "border-slate-900 ring-1 ring-slate-900"
              )}
            >
              <CardContent className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-slate-900">
                      {plan.name}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {plan.tagline}
                    </p>
                  </div>
                  {isCurrent && <Badge variant="neutral">Plan actual</Badge>}
                </div>
                <p className="text-3xl font-semibold tracking-tight text-slate-900">
                  {formatCurrency(plan.price)}
                  <span className="ml-1 text-sm font-normal text-slate-500">
                    / mes
                  </span>
                </p>
                <ul className="flex flex-1 flex-col gap-2">
                  {plan.benefits.map((benefit) => (
                    <li
                      key={benefit}
                      className="flex items-start gap-2 text-sm text-slate-700"
                    >
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                        aria-hidden="true"
                      />
                      {benefit}
                    </li>
                  ))}
                </ul>
                <Button
                  variant={isCurrent ? "secondary" : isUpgrade ? "default" : "secondary"}
                  disabled={isCurrent}
                  onClick={handleChangePlan}
                  className="w-full"
                >
                  {isCurrent
                    ? "Tu plan actual"
                    : isUpgrade
                      ? "Mejorar"
                      : "Degradar"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Toast simulado de redirección a Stripe */}
      {toastVisible && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 sm:bottom-6"
        >
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium text-slate-900">
              Redirigiendo a Stripe...
            </p>
          </div>
        </div>
      )}
    </>
  );
}
