import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { getCurrentTenant, getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { signOut } from "./actions";

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
    return <NoTenantScreen email={user.email ?? ""} />;
  }

  return (
    <div className="min-h-svh bg-slate-50 text-slate-950 lg:flex">
      <DashboardSidebar tenantName={tenantContext.tenant?.name} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}

/**
 * Pantalla para usuarios autenticados que aún no pertenecen a ningún negocio
 * (p. ej. registro cuyo aprovisionamiento de tenant falló o está pendiente).
 */
function NoTenantScreen({ email }: { email: string }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
          <LifeBuoy className="size-6" />
        </span>
        <h1 className="text-xl font-semibold tracking-tight text-slate-950">
          Todavía no tienes un negocio configurado
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
          Tu cuenta
          {email ? (
            <>
              {" "}
              <span className="font-medium text-slate-700">{email}</span>
            </>
          ) : null}{" "}
          existe, pero no está asociada a ningún tenant. Cierra sesión e intenta
          registrarte de nuevo, o contacta a soporte.
        </p>
        <form action={signOut} className="mt-6">
          <Button
            type="submit"
            size="lg"
            className="w-full bg-slate-950 text-white hover:bg-slate-800"
          >
            Cerrar sesión
          </Button>
        </form>
      </div>
    </div>
  );
}
