import {
  LayoutDashboard,
  Bot,
  CalendarDays,
  CreditCard,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Mi Asistente", href: "/assistant", icon: Bot },
  { label: "CRM", href: "/crm", icon: CalendarDays },
  { label: "Suscripción", href: "/subscription", icon: CreditCard },
];
