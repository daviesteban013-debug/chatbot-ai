import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { readWhatsAppSetup } from "@/lib/whatsapp/setup";
import { PageHeader } from "@/components/dashboard/page-header";
import { WhatsAppSetupView } from "./setup-view";

export default async function WhatsAppPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/login");
  let setup;
  try {
    setup = await readWhatsAppSetup(await createClient(), tenant.tenantId, tenant.role === "owner");
  } catch {
    return <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><PageHeader title="WhatsApp" />
      <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800">No pude cargar la conexión. Comprueba que la migración de WhatsApp esté aplicada e inténtalo de nuevo.</p></div>;
  }
  return <WhatsAppSetupView initial={setup}/>;
}
