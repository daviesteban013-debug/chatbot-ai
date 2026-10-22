import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "../agent/load.mjs";

const { securityHeaders, contentSecurityPolicy } = await import(await load("../../lib/security-headers.ts"));
const { POST } = await import(await load("../../app/api/csp-report/route.ts"));

test("production headers pin encrypted transport, block sniffing and foreign framing, and name only the origins the pages use", () => {
  const headers = Object.fromEntries(securityHeaders({ supabaseUrl: "https://abc.supabase.co", development: false }).map(header => [header.key, header.value]));
  assert.equal(headers["Strict-Transport-Security"], "max-age=63072000; includeSubDomains; preload");
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["X-Frame-Options"], "SAMEORIGIN");
  assert.equal(headers["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.equal(headers["Cross-Origin-Opener-Policy"], "same-origin-allow-popups", "the Meta sign-up popup must keep its opener");
  assert.match(headers["Permissions-Policy"], /microphone=\(self\)/);
  assert.match(headers["Permissions-Policy"], /camera=\(\)/);
  const csp = headers["Content-Security-Policy"];
  assert.match(csp, /(^|; )default-src 'self'(;|$)/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'self'/);
  assert.match(csp, /script-src 'self' 'unsafe-inline' https:\/\/connect\.facebook\.net(;|$)/);
  assert.match(csp, /connect-src [^;]*https:\/\/abc\.supabase\.co [^;]*wss:\/\/abc\.supabase\.co/);
  assert.match(csp, /frame-src [^;]*https:\/\/www\.facebook\.com/);
  assert.match(csp, /media-src 'self' blob: data:/);
  assert.match(csp, /upgrade-insecure-requests/);
  assert.match(csp, /report-uri \/api\/csp-report/);
  assert.ok(!csp.includes("unsafe-eval"), "no eval in production");
  assert.ok(!csp.includes("*.supabase.co"), "the policy names this project, not every Supabase project");
  assert.ok(!csp.includes("form-action"), "form submissions may redirect to Supabase, Google or Mercado Pago");
});

test("development keeps hot reload and React refresh working and never upgrades plain http", () => {
  const csp = contentSecurityPolicy({ supabaseUrl: "https://abc.supabase.co", development: true });
  assert.match(csp, /'unsafe-eval'/);
  assert.match(csp, /ws:\/\/localhost:\*/);
  assert.ok(!csp.includes("upgrade-insecure-requests"));
});

test("a missing or malformed Supabase URL falls back to the host pattern instead of breaking the build", () => {
  assert.match(contentSecurityPolicy({ development: false }), /https:\/\/\*\.supabase\.co/);
  assert.match(contentSecurityPolicy({ supabaseUrl: "not a url", development: false }), /wss:\/\/\*\.supabase\.co/);
});

test("violation reports are accepted in both browser formats, logged compactly and never echoed", async () => {
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args.join(" "));
  const send = (type, body) => POST(new Request("https://zoraxpilot.com/api/csp-report", { method: "POST", headers: { "content-type": type }, body }));
  try {
    const legacy = await send("application/csp-report", JSON.stringify({ "csp-report": { "document-uri": "https://zoraxpilot.com/login", "violated-directive": "script-src", "blocked-uri": "https://evil.test/x.js", "script-sample": "secret".repeat(100) } }));
    assert.equal(legacy.status, 204);
    assert.equal(await legacy.text(), "");
    const modern = await send("application/reports+json", JSON.stringify([{ type: "csp-violation", body: { documentURL: "https://zoraxpilot.com/", effectiveDirective: "img-src", blockedURL: "https://evil.test/p.png" } }]));
    assert.equal(modern.status, 204);
    assert.equal(warnings.length, 2);
    assert.match(warnings[0], /"directive":"script-src"/);
    assert.match(warnings[0], /evil\.test\/x\.js/);
    assert.ok(warnings[0].length < 400, "samples are truncated");
    assert.match(warnings[1], /"directive":"img-src"/);
    assert.equal((await send("text/plain", "x")).status, 415);
    assert.equal((await send("application/json", "{")).status, 400);
    assert.equal((await send("application/json", JSON.stringify(Array.from({ length: 50 }, () => ({ body: { effectiveDirective: "x" } }))))).status, 204);
    assert.equal(warnings.length, 7, "at most five reports per request are logged");
  } finally { console.warn = original; }
});
