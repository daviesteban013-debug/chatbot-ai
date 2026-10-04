export type PlanId = "esencial" | "crecimiento" | "equipo";

export interface Plan {
  id: PlanId;
  name: string;
  price: number; // COP / mes
  description: string;
  features: string[];
  featured: boolean;
}

export const plans: Plan[] = [
  { id: "esencial", name: "Esencial", price: 79000, description: "Para dar el primer paso sin complicarte.", features: ["500 conversaciones al mes", "1 número de WhatsApp", "Catálogo y preguntas frecuentes", "Registro de pedidos", "Soporte por correo"], featured: false },
  { id: "crecimiento", name: "Crecimiento", price: 149000, description: "Para negocios que no quieren dejar de vender.", features: ["2.000 conversaciones al mes", "1 número de WhatsApp", "Todo lo de Esencial", "Agenda y cotizaciones", "Transferencia a tu equipo", "Panel de actividad y soporte prioritario"], featured: true },
  { id: "equipo", name: "Equipo", price: 299000, description: "Para una operación con más manos y más chats.", features: ["5.000 conversaciones al mes", "Hasta 3 números de WhatsApp", "Todo lo de Crecimiento", "Hasta 5 miembros del equipo", "Acompañamiento de configuración", "Revisión de reglas del negocio"], featured: false },
];

export const ANNUAL_DISCOUNT = 0.2;

/** Total a cobrar en COP (entero). Mensual = 1 mes; anual = 12 meses con descuento. */
export function planTotal(plan: Plan, annual: boolean): number {
  return Math.round(annual ? plan.price * 12 * (1 - ANNUAL_DISCOUNT) : plan.price);
}

export const money = (amount: number) => `$${amount.toLocaleString("es-CO")}`;
