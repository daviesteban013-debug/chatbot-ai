import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { readWhatsAppSetup } from "@/lib/whatsapp/setup";
import { WhatsAppSetupView } from "./setup-view";

export default async function WhatsAppPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/login");
  let setup;
  try {
    setup = await readWhatsAppSetup(await createClient(), tenant.tenantId, tenant.role === "owner");
  } catch {
    return <div className="mx-auto max-w-3xl px-6 py-10"><h1 className="text-2xl font-semibold">WhatsApp</h1>
      <p role="alert" className="mt-4 text-slate-600">No pude cargar la conexión. Comprueba que la migración de WhatsApp esté aplicada e inténtalo de nuevo.</p></div>;
  }
  return <WhatsAppSetupView initial={setup}/>;
}
