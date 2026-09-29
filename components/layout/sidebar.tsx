"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Coffee } from "lucide-react";
import { navItems } from "@/lib/nav";
import { business } from "@/lib/mock-data";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const planLabels: Record<typeof business.plan, string> = {
  free: "Plan gratuito",
  pro: "Plan Pro",
  business: "Plan Business",
};

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 bg-white border-r border-slate-200">
      <div className="flex items-center gap-3 px-5 h-16 border-b border-slate-200">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
          <Coffee className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">
            {business.name}
          </p>
          <p className="truncate text-xs text-slate-500">Panel del Dueño</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-slate-100 text-slate-900 font-medium"
                      : "text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-slate-200 p-4">
        <div className="flex items-center gap-3">
          <Avatar name={business.ownerName} className="h-9 w-9" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">
              {business.ownerName}
            </p>
            <p className="truncate text-xs text-slate-500">
              {planLabels[business.plan]}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
