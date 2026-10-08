import {
  LayoutDashboard,
  MessageSquare,
  ShoppingBag,
  Package,
  UserPlus,
  CheckCircle,
  Bot,
  Sparkles,
  CreditCard,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

/**
 * Rutas del panel de control. El sidebar (`components/dashboard/sidebar.tsx`)
 * consume este arreglo y marca la ruta activa con `usePathname`.
 */
export const navItems: NavItem[] = [
  { label: "NEXO · Centro de mando", href: "/dashboard/jarvis", icon: Sparkles },
  { label: "Resumen", href: "/dashboard", icon: LayoutDashboard },
  { label: "Conversaciones", href: "/dashboard/conversations", icon: MessageSquare },
  { label: "Pedidos", href: "/dashboard/orders", icon: ShoppingBag },
  { label: "Catálogo", href: "/dashboard/catalog", icon: Package },
  { label: "Handoffs", href: "/dashboard/handoffs", icon: UserPlus },
  { label: "Aprobaciones", href: "/dashboard/approval", icon: CheckCircle },
  { label: "Agente", href: "/dashboard/agent", icon: Bot },
  { label: "Planes y pagos", href: "/dashboard/billing", icon: CreditCard },
];
