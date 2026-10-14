import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { signOut } from "./actions";

export const metadata = { title: "NEXO" };

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  // El proxy ya protege la ruta, pero el layout vuelve a verificar la sesión
  // para tener acceso al usuario y resolver su tenant.
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // Resuelve el tenant del usuario desde `tenant_members` (React `cache`
  // deduplica la consulta: las páginas hijas pueden reutilizar estos helpers).
  const tenantContext = await getCurrentTenant();

  if (!tenantContext) {
    return <DashboardShell fallback={<NoTenantScreen email={user.email ?? ""} />}>{children}</DashboardShell>;
  }

  return (
    <DashboardShell tenantName={tenantContext.tenant?.name}>{children}</DashboardShell>
  );
}

/**
 * Pantalla para usuarios autenticados que aún no pertenecen a ningún negocio
 * (p. ej. registro cuyo aprovisionamiento de tenant falló o está pendiente).
 */
function NoTenantScreen({ email }: { email: string }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md rounded-lg border border-line bg-surface p-8 text-center">
        <LifeBuoy className="mx-auto mb-4 size-6 text-muted" strokeWidth={1.75} />
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          Todavía no tienes un negocio configurado
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">
          Tu cuenta
          {email ? (
            <>
              {" "}
              <span className="font-medium text-ink-soft">{email}</span>
            </>
          ) : null}{" "}
          existe, pero no está asociada a ningún tenant. Cierra sesión e intenta
          registrarte de nuevo, o contacta a soporte.
        </p>
        <form action={signOut} className="mt-6">
          <Button
            type="submit"
            size="lg"
            className="w-full"
          >
            Cerrar sesión
          </Button>
        </form>
      </div>
    </div>
  );
}
