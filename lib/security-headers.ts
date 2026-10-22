/**
 * Browser security headers for every response. Transport is already TLS on Vercel; these pin it
 * (HSTS with subdomains and preload), stop sniffing and framing by other sites, keep the Facebook
 * sign-up popup able to talk back to its opener, and give the browser a Content Security Policy
 * that names only the origins the pages really use: this app, its Supabase project and Meta.
 */
export interface SecurityHeaderOptions {
  /** NEXT_PUBLIC_SUPABASE_URL; without it the policy falls back to the Supabase host pattern. */
  supabaseUrl?: string;
  /** `next dev` needs eval for React refresh and a websocket for hot reload, and runs on plain http. */
  development?: boolean;
}

function supabaseOrigins(url: string | undefined): { https: string; wss: string } {
  try {
    const host = new URL(url ?? "").host;
    if (host) return { https: `https://${host}`, wss: `wss://${host}` };
  } catch { /* Fall through to the pattern. */ }
  return { https: "https://*.supabase.co", wss: "wss://*.supabase.co" };
}

export function contentSecurityPolicy({ supabaseUrl, development = false }: SecurityHeaderOptions = {}): string {
  const supabase = supabaseOrigins(supabaseUrl);
  const directives: Record<string, string[] | null> = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "frame-ancestors": ["'self'"],
    // Next.js inlines its bootstrap scripts, so inline stays allowed; the only third-party script is Meta's SDK.
    "script-src": ["'self'", "'unsafe-inline'", ...(development ? ["'unsafe-eval'"] : []), "https://connect.facebook.net"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", supabase.https, "https://*.fbcdn.net", "https://*.facebook.com"],
    "font-src": ["'self'", "data:"],
    // Zorax's voice arrives from our own API and plays from a blob.
    "media-src": ["'self'", "blob:", "data:"],
    "connect-src": ["'self'", supabase.https, supabase.wss, "https://www.facebook.com", "https://web.facebook.com", "https://graph.facebook.com", "https://connect.facebook.net",
      ...(development ? ["ws://localhost:*", "ws://127.0.0.1:*", "http://localhost:*"] : [])],
    "frame-src": ["'self'", "https://www.facebook.com", "https://web.facebook.com", "https://staticxx.facebook.com"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "upgrade-insecure-requests": development ? null : [],
    "report-uri": ["/api/csp-report"],
  };
  return Object.entries(directives)
    .filter((entry): entry is [string, string[]] => entry[1] !== null)
    .map(([name, values]) => (values.length ? `${name} ${values.join(" ")}` : name))
    .join("; ");
}

export function securityHeaders(options: SecurityHeaderOptions = {}): { key: string; value: string }[] {
  return [
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Microphone stays for Zorax's voice; nothing else on the device is reachable from a page.
    { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=(), display-capture=()" },
    // `same-origin` would cut the Meta sign-up popup off from the page that opened it.
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
  ];
}
