"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DashboardSidebar } from "./sidebar";

export function DashboardShell({ children, tenantName, fallback }: {
  children: ReactNode;
  tenantName?: string;
  fallback?: ReactNode;
}) {
  const pathname = usePathname();
  if (pathname === "/dashboard/jarvis" || pathname.startsWith("/dashboard/jarvis/")) return <>{children}</>;
  if (fallback) return <>{fallback}</>;
  return (
    <div className="min-h-svh bg-slate-50 text-slate-950 lg:flex">
      <DashboardSidebar tenantName={tenantName} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
