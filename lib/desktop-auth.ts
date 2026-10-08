/** Forward only the short-lived PKCE code; the desktop holds its own verifier. */
export function desktopAuthResponse(code: string | null): Response {
  if (!code || !/^[\w-]{16,256}$/.test(code)) return Response.json({ error: "Código de acceso no válido." }, { status: 400 });
  const link = `nexo-desktop://auth?code=${encodeURIComponent(code)}`;
  const html = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Volver a NEXO</title><body><h1>Tu cuenta está lista</h1><p>Vuelve a la aplicación que inició el acceso para terminar de iniciar sesión.</p><p><a href="${link}">Abrir NEXO en mi computadora</a></p><p>Este acceso caduca en cinco minutos. Puedes cerrar esta pestaña después de volver.</p></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'", "X-Content-Type-Options": "nosniff" } });
}
