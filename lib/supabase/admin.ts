import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Cliente con service role: SALTA las políticas RLS.
 * SOLO para código de servidor (webhook de WhatsApp, orquestación del agente,
 * tareas administrativas). Nunca importar desde un Client Component ni exponer
 * SUPABASE_SERVICE_ROLE_KEY al navegador.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
