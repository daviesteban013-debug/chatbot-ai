"use client";

import Link from "next/link";
import { useState, type MouseEvent } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, Download, LogOut } from "lucide-react";
import { signOut } from "@/app/dashboard/actions";
import { navGroups } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { AppInstallOptions, InstallJarvisButton } from "@/components/pwa/app-provider";
import { DesktopDownloadLink } from "@/components/pwa/desktop-download-link";
import { NexoMark } from "@/components/brand/nexo-mark";
import { TaskAlerts } from "./task-alerts";

export function DashboardSidebar({ tenantName }: { tenantName?: string }) {
  const pathname = usePathname();
  const [desktopError, setDesktopError] = useState<string | null>(null);
  function openNexo(event: MouseEvent<HTMLAnchorElement>) {
    if (window.nexoDesktop?.surface !== "crm") return;
    event.preventDefault();
    setDesktopError(null);
    void window.nexoDesktop.setExpanded(true).catch(() => setDesktopError("No se pudo abrir Zorax. Intenta desde el icono de la bandeja."));
  }

  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="sticky top-0 z-30 flex max-h-svh flex-col border-b border-line bg-surface text-ink lg:h-svh lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r">
      <div className="flex h-14 items-center gap-2.5 px-4 lg:h-16 lg:px-5">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5">
          <NexoMark className="size-7 shrink-0" />
          <span className="min-w-0 leading-tight">
            <span className="block text-sm font-semibold tracking-tight">Zorax</span>
            {tenantName ? <span className="block max-w-[10rem] truncate text-[11px] text-muted">{tenantName}</span> : null}
          </span>
        </Link>
        <div className="ml-auto lg:hidden"><AppInstallOptions><InstallJarvisButton tone="light" compact /></AppInstallOptions></div>
      </div>

      <div className="px-3 empty:hidden lg:px-4"><TaskAlerts /></div>
      <nav aria-label="Panel" className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none] lg:[scrollbar-width:thin] lg:flex-col lg:gap-0 lg:overflow-y-auto lg:px-3 lg:py-2">
        {navGroups.map((group, index) => (
          <div key={group.label ?? index} className="flex shrink-0 gap-1 lg:mb-3 lg:flex-col lg:gap-0.5">
            {group.label ? <p className="hidden px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted lg:block">{group.label}</p> : null}
            {group.items.map(({ label, href, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={href === "/dashboard/jarvis" ? openNexo : undefined}
                aria-current={isActive(href) ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition",
                  isActive(href) ? "bg-subtle font-medium text-ink" : "text-ink-soft hover:bg-subtle/70 hover:text-ink"
                )}
              >
                {Icon ? <Icon className={cn("size-4", isActive(href) ? "text-ink" : "text-muted")} strokeWidth={1.9} /> : <NexoMark className="size-4" />}
                {label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      {desktopError && <p role="alert" className="px-5 pb-3 text-xs text-rose-700">{desktopError}</p>}

      <div className="mt-auto hidden border-t border-line p-3 lg:block">
        <AppInstallOptions>
          <details className="group mb-1">
            <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-ink-soft transition hover:bg-subtle hover:text-ink">
              <Download className="size-4 text-muted" strokeWidth={1.9} /> Descargar app
              <ChevronDown className="ml-auto size-3.5 text-muted transition group-open:rotate-180" />
            </summary>
            <div className="mt-1 grid gap-0.5 pl-4">
              <DesktopDownloadLink tone="light" compact className="w-full" />
              <DesktopDownloadLink tone="light" compact platform="mac" className="w-full" />
              <InstallJarvisButton tone="light" className="w-full" />
            </div>
          </details>
        </AppInstallOptions>
        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-ink-soft transition hover:bg-subtle hover:text-ink"
          >
            <LogOut className="size-4 text-muted" strokeWidth={1.9} /> Cerrar sesión
          </button>
        </form>
      </div>
    </aside>
  );
}
