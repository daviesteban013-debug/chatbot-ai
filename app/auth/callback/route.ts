import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Callback de autenticación (OAuth / magic link / confirmación de correo).
 * Intercambia el `code` por una sesión y redirige al destino solicitado.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard/jarvis";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // `next` es una ruta relativa interna; se resuelve contra el origen.
      const redirectTo = new URL(next, origin);
      if (redirectTo.origin === origin) {
        return NextResponse.redirect(redirectTo);
      }
    }
  }

  return NextResponse.redirect(
    `${origin}/login?error=auth_callback_error`
  );
}
