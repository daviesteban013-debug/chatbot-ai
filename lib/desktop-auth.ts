/**
 * The page the browser shows after signing in for the desktop app. It forwards only the
 * short-lived PKCE code to the app (which holds its own verifier) and explains the one
 * remaining step. Self-contained: no scripts, no external assets, never cached.
 */
const MARK = `<svg viewBox="0 0 32 32" width="44" height="44" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#18181b"/><path d="M9.5 22.5V9.5l13 13V9.5" fill="none" stroke="#fafafa" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="22.5" cy="9.5" r="2.6" fill="#facc15"/></svg>`;

const STYLE = `
*{box-sizing:border-box}
html,body{margin:0;min-height:100%}
body{display:flex;align-items:center;justify-content:center;padding:32px 20px;background:#09090b radial-gradient(120% 60% at 50% -10%,#facc1512,transparent 60%);color:#fafafa;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
.card{width:100%;max-width:440px;padding:32px 30px 26px;border:1px solid #ffffff14;border-radius:18px;background:#111113f2;box-shadow:0 24px 80px #0006}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:26px;font-weight:700;letter-spacing:.06em;font-size:15px}
.brand svg{flex-shrink:0;border-radius:9px;box-shadow:0 0 0 1px #ffffff14}
.eyebrow{display:block;font-size:10px;font-weight:650;letter-spacing:2.6px;color:#a1a1aa}
h1{margin:8px 0 10px;font-size:28px;line-height:1.2;letter-spacing:-1px;font-weight:600}
p{margin:0;font-size:14px;line-height:1.7;color:#a1a1aa}
.button{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;min-height:48px;margin:24px 0 20px;padding:12px 16px;border-radius:10px;background:#facc15;color:#161300;font-weight:600;font-size:14px;text-decoration:none;transition:background .15s}
.button:hover{background:#fde047}
.button:focus-visible{outline:2px solid #facc15;outline-offset:4px}
ol{margin:0;padding:0;list-style:none;display:grid;gap:10px}
li{display:flex;gap:12px;align-items:flex-start;font-size:13px;line-height:1.6;color:#d4d4d8}
li b{flex-shrink:0;display:grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#facc1518;border:1px solid #facc1540;color:#facc15;font-size:11px;font-weight:600;margin-top:1px}
.note{margin-top:22px;padding-top:16px;border-top:1px solid #ffffff10;font-size:12px;color:#8e9099}
.note a{color:#fde047;text-decoration:underline;text-underline-offset:3px}
@media(max-width:480px){.card{padding:26px 22px 22px}h1{font-size:25px}}
@media(prefers-reduced-motion:reduce){.button{transition:none}}`;

export function desktopAuthResponse(code: string | null): Response {
  if (!code || !/^[\w-]{16,256}$/.test(code)) return Response.json({ error: "Código de acceso no válido." }, { status: 400 });
  const link = `nexo-desktop://auth?code=${encodeURIComponent(code)}`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="1;url=${link}"><title>Volver a NEXO</title><style>${STYLE}</style></head><body>
<main class="card">
  <div class="brand">${MARK}NEXO</div>
  <span class="eyebrow">ACCESO DESDE TU COMPUTADORA</span>
  <h1>Tu cuenta está lista.</h1>
  <p>Solo falta volver a la app de NEXO para terminar de entrar. Debería abrirse sola; si no, usa el botón.</p>
  <a class="button" href="${link}">Abrir NEXO en mi computadora</a>
  <ol>
    <li><b>1</b><span>Si el navegador pregunta si quieres abrir NEXO, acepta.</span></li>
    <li><b>2</b><span>NEXO termina de iniciar sesión y abre tu CRM.</span></li>
    <li><b>3</b><span>Puedes cerrar esta pestaña.</span></li>
  </ol>
  <p class="note">Este acceso caduca en cinco minutos. Si venció, vuelve a la app y entra de nuevo. ¿Aún no tienes la app? <a href="/">Descárgala para Windows o Mac</a>.</p>
</main>
</body></html>`;
  return new Response(html, { headers: {
    "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    "X-Content-Type-Options": "nosniff",
  } });
}
