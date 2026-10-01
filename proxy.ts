import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy de Next.js 16 (reemplaza al antiguo `middleware.ts`).
 * Corre sobre el runtime `nodejs`.
 *
 * Responsabilidades:
 *  1. Refrescar la sesión de Supabase en cada request (escribe las cookies
 *     rotadas en la respuesta) usando `createServerClient` de @supabase/ssr.
 *  2. Proteger `/dashboard/**`: sin sesión -> redirige a `/login`.
 *  3. Evitar que un usuario autenticado vea `/login` o `/signup` -> `/dashboard`.
 *  4. Dejar pasar `/auth/**` (callback de OAuth / magic link) solo refrescando.
 */
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // 1) Reflejar las cookies en la request para que el `getUser()` de
          //    abajo lea el token recién rotado.
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // 2) Reconstruir la respuesta y adjuntar las cookies (con sus
          //    opciones) para que el navegador persista la sesión.
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANTE: no envolver en try/catch. `getUser()` refresca el token y
  // dispara `setAll` arriba; es la fuente de verdad de la sesión.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Rutas de autenticación (callback): solo refrescar la sesión y continuar.
  if (pathname.startsWith("/auth")) {
    return supabaseResponse;
  }

  // Usuario autenticado no debe ver las pantallas de acceso.
  if (user && (pathname === "/login" || pathname === "/signup")) {
    return redirectWithCookies(new URL("/dashboard", request.url), supabaseResponse);
  }

  // Proteger el panel: sin sesión se redirige al login.
  if (!user && pathname.startsWith("/dashboard")) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.search = "";
    return redirectWithCookies(loginUrl, supabaseResponse);
  }

  return supabaseResponse;
}

/**
 * Crea una respuesta de redirección arrastrando las cookies de sesión que
 * Supabase haya rotado durante este request (evita perder el refresco).
 */
function redirectWithCookies(url: URL, source: NextResponse): NextResponse {
  const response = NextResponse.redirect(url);
  source.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/signup", "/auth/:path*"],
};
