"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, LogOut, Settings2 } from "lucide-react";
import { signOut } from "@/app/dashboard/actions";
import { navItems } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function DashboardSidebar({ tenantName }: { tenantName?: string }) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="sticky top-0 z-30 flex max-h-svh flex-col border-b border-slate-200 bg-slate-950 text-white lg:h-svh lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r lg:border-white/5">
      <div className="flex h-16 items-center justify-between px-5 lg:h-20">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-yellow-400 text-slate-950 shadow-lg shadow-yellow-400/15">
            <Bot className="size-5" strokeWidth={2.4} />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold tracking-tight">Nexo</span>
            {tenantName ? (
              <span className="block max-w-[9rem] truncate text-[11px] text-slate-500">
                {tenantName}
              </span>
            ) : null}
          </span>
        </Link>
        <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
          Online
        </span>
      </div>

      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-y-auto lg:px-4 lg:py-4">
        {navItems.map(({ label, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
              isActive(href)
                ? "bg-white/10 font-medium text-white"
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            )}
          >
            <Icon className="size-4.5" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto hidden p-4 lg:block">
        <Link
          href="/dashboard/agent"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white"
        >
          <Settings2 className="size-4.5" /> Configuración
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            <LogOut className="size-4.5" /> Cerrar sesión
          </button>
        </form>
      </div>
    </aside>
  );
}
