import {
  LayoutDashboard,
  MessageSquare,
  MessageCircle,
  ShoppingBag,
  Package,
  UserPlus,
  CheckCircle,
  Bot,
  CreditCard,
  ListTodo,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  /** Without an icon, the item uses NEXO's own mark. */
  icon?: LucideIcon;
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

/**
 * Rutas del panel de control agrupadas por trabajo. El sidebar
 * (`components/dashboard/sidebar.tsx`) marca la ruta activa con `usePathname`.
 */
export const navGroups: NavGroup[] = [
  { label: null, items: [
    { label: "NEXO", href: "/dashboard/jarvis" },
    { label: "Resumen", href: "/dashboard", icon: LayoutDashboard },
  ] },
  { label: "Ventas", items: [
    { label: "Pedidos", href: "/dashboard/orders", icon: ShoppingBag },
    { label: "Aprobaciones", href: "/dashboard/approval", icon: CheckCircle },
    { label: "Catálogo", href: "/dashboard/catalog", icon: Package },
  ] },
  { label: "Atención", items: [
    { label: "Conversaciones", href: "/dashboard/conversations", icon: MessageSquare },
    { label: "Handoffs", href: "/dashboard/handoffs", icon: UserPlus },
  ] },
  { label: "Operación", items: [
    { label: "Memoria y tareas", href: "/dashboard/workspace", icon: ListTodo },
    { label: "WhatsApp", href: "/dashboard/whatsapp", icon: MessageCircle },
  ] },
  { label: "Ajustes", items: [
    { label: "Agente y autonomía", href: "/dashboard/agent", icon: Bot },
    { label: "Planes y pagos", href: "/dashboard/billing", icon: CreditCard },
  ] },
];

export const navItems: NavItem[] = navGroups.flatMap(group => group.items);
