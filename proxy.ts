import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy de Next.js 16 (reemplaza al antiguo `middleware.ts`).
 * Corre sobre el runtime `nodejs`.
 *
 * Responsabilidades:
 *  1. Refrescar la sesión de Supabase en cada request (escribe las cookies
 *     rotadas en la respuesta) usando `createServerClient` de @supabase/ssr.
 *  2. Proteger `/dashboard/**` y `/onboarding`: sin sesión -> redirige a `/login`.
 *  3. Evitar que un usuario autenticado vea `/login` o `/signup` -> `/dashboard`.
 *  4. Dejar pasar `/auth/**` (callback de OAuth / magic link) solo refrescando.
 *  5. Forzar el onboarding: si el agente del tenant aún no lo completa, enviar
 *     `/dashboard` -> `/onboarding` (y viceversa si ya terminó). Se apoya en la
 *     cookie `onboarding_done` para no consultar la BD en cada request.
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

  // Proteger el panel y el onboarding: sin sesión se redirige al login.
  // Excepción: permitir acceso a Jarvis si viene de un pago recién completado (?paid=1).
  const isJarvisPaid =
    pathname.startsWith("/dashboard/jarvis") &&
    request.nextUrl.searchParams.get("paid") === "1";

  if (
    !user &&
    !isJarvisPaid &&
    (pathname.startsWith("/dashboard") || pathname.startsWith("/onboarding"))
  ) {
    const loginUrl = new URL("/login", request.url);
    if (pathname.startsWith("/dashboard/jarvis")) {
      loginUrl.search = request.nextUrl.search;
    } else {
      loginUrl.search = "";
    }
    return redirectWithCookies(loginUrl, supabaseResponse);
  }

  // Control de onboarding (solo usuarios autenticados).
  if (user) {
    // La cookie `onboarding_done` guarda el id del usuario que YA completó el
    // flujo, para no consultar la BD en cada request. Si no coincide (otra
    // cuenta en el mismo navegador) se vuelve a verificar contra la BD.
    const onboarded = request.cookies.get("onboarding_done")?.value === user.id;

    // Ya completó el onboarding: no debe volver a verlo.
    if (onboarded && pathname.startsWith("/onboarding")) {
      return redirectWithCookies(
        new URL("/dashboard", request.url),
        supabaseResponse
      );
    }

    // Aún no completa y va al panel: una única consulta ligera (RLS la acota).
    // Nota: Si el usuario va a /dashboard/jarvis, permitimos que Jarvis lo guíe en lugar de forzar /onboarding.
    if (
      !onboarded &&
      pathname.startsWith("/dashboard") &&
      !pathname.startsWith("/dashboard/jarvis")
    ) {
      const { data: memberRow, error: memberError } = await supabase
        .from("tenant_members")
        .select("tenants(agents(onboarding_completed))")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      // "none": sin tenant (no bloquear el panel, evita bucles de redirección).
      // "pending": tiene tenant pero el agente aún no completa el onboarding.
      // "completed": agente con onboarding_completed = true.
      let status: "completed" | "pending" | "none" = "none";
      if (!memberError && memberRow) {
        const tenants = (memberRow as { tenants?: unknown }).tenants;
        const tenant = Array.isArray(tenants) ? tenants[0] : tenants;
        if (tenant) {
          const agents = (tenant as { agents?: unknown }).agents;
          const agent = Array.isArray(agents) ? agents[0] : agents;
          status =
            agent &&
            (agent as { onboarding_completed?: boolean }).onboarding_completed ===
              true
              ? "completed"
              : "pending";
        }
      }

      if (status === "completed") {
        // Fijar la cookie para saltar la consulta en próximos requests.
        supabaseResponse.cookies.set("onboarding_done", user.id, {
          path: "/",
          httpOnly: true,
          sameSite: "lax",
          secure: true,
          maxAge: 60 * 60 * 24 * 365,
        });
      } else if (status === "pending") {
        return redirectWithCookies(
          new URL("/onboarding", request.url),
          supabaseResponse
        );
      }
    }
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
  matcher: [
    "/dashboard/:path*",
    "/onboarding",
    "/onboarding/:path*",
    "/login",
    "/signup",
    "/auth/:path*",
  ],
};
