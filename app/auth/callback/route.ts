import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { provisionTenant } from "@/app/(auth)/signup/actions";
import { safeAuthDestination } from "@/lib/auth-redirect";
import { desktopAuthResponse } from "@/lib/desktop-auth";

/**
 * Callback de autenticación (OAuth / magic link / confirmación de correo).
 * Intercambia el `code` por una sesión y redirige al destino solicitado.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (searchParams.get("desktop") === "1" && code) return desktopAuthResponse(code);
  const next = searchParams.get("next") ?? "/dashboard/jarvis";
  const redirectTo = safeAuthDestination(next, origin);

  if (code && redirectTo) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        try {
          const result = await provisionTenant();
          if (!result.ok) return NextResponse.redirect(new URL("/auth/finish", origin));
        } catch { return NextResponse.redirect(new URL("/auth/finish", origin)); }
        return NextResponse.redirect(redirectTo);
      }
    } catch { /* Expired codes and connection failures return a recoverable login screen. */ }
  }

  return NextResponse.redirect(
    `${origin}/login?error=${searchParams.get("error_code") === "otp_expired" ? "otp_expired" : searchParams.get("error") === "access_denied" ? "access_denied" : "auth_callback_error"}`
  );
}
