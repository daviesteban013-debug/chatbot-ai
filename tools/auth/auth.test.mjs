import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const asModule = code => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
async function load(path, replacements = {}) {
  let source = await readFile(new URL(path, import.meta.url), "utf8");
  for (const [name, url] of Object.entries(replacements)) source = source.replaceAll(JSON.stringify(name), JSON.stringify(url));
  return import(asModule(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText));
}
const { safeAuthDestination } = await load("../../lib/auth-redirect.ts");
const messages = await load("../../lib/auth-messages.ts");
test("auth destinations reject foreign origins, protocol-relative/backslash and malformed routes", () => {
  assert.equal(safeAuthDestination(null, "https://app.test").href, "https://app.test/dashboard/jarvis");
  assert.equal(safeAuthDestination("/dashboard/orders", "https://app.test").pathname, "/dashboard/orders");
  for (const next of ["https://evil.test", "//evil.test", "/\\evil.test", "javascript:alert(1)", "http://["]) assert.equal(safeAuthDestination(next, "https://app.test"), null);
});
test("email throttling, provider setup and expiry offer accurate recovery messages", () => {
  assert.match(messages.authErrorMessage("email rate limit exceeded"), /límite de correos/);
  assert.match(messages.authErrorMessage("Unsupported provider: provider is not enabled"), /Google todavía no/);
  assert.match(messages.authErrorMessage("Email address not authorized"), /no está disponible/);
  assert.match(messages.callbackErrorMessage("otp_expired"), /solicita otro correo/);
  assert.doesNotMatch(messages.callbackErrorMessage("otp_expired"), /registrarte/);
});

let user, adminCalls, writes, existing, queryError, memberError;
const server = asModule("export const createClient = async () => globalThis.__authClient;");
globalThis.__authClient = { auth: { getUser: async () => ({ data: { user }, error: null }) } };
globalThis.__authAdmin = () => {
  adminCalls++;
  return { from(table) {
    const query = {
      select() { return query; }, eq() { return query; }, limit() { return query; },
      maybeSingle: async () => ({ data: existing, error: queryError }),
      insert(value) {
        writes.push({ table, value });
        return table === "tenants" ? { select() { return { single: async () => ({ data: { id: "tenant-new" }, error: null }) }; } } : Promise.resolve({ error: memberError });
      },
      delete() { writes.push({ table, deleted: true }); return { eq: async () => ({ error: null }) }; },
    };
    return query;
  } };
};
const { provisionTenant } = await load("../../app/(auth)/signup/actions.ts", { "@/lib/supabase/server": server, "@/lib/supabase/admin": asModule("export const createAdminClient = () => globalThis.__authAdmin();") });
function reset() { user = null; adminCalls = 0; writes = []; existing = null; queryError = null; memberError = null; }
test("an anonymous or unconfirmed caller cannot reach service-role provisioning", async () => {
  reset();
  assert.deepEqual(await provisionTenant({ userId: "victim", email: "victim@example.test", businessName: "Attack" }), { ok: false });
  user = { id: "attacker", user_metadata: {} };
  assert.deepEqual(await provisionTenant(), { ok: false });
  assert.equal(adminCalls, 0); assert.deepEqual(writes, []);
});
test("confirmed owner gets their own business even if caller injects another user's ID", async () => {
  reset(); user = { id: "owner", email_confirmed_at: "2026-01-01", user_metadata: { business_name: " Mi negocio real ", role: "admin" } };
  assert.deepEqual(await provisionTenant({ userId: "victim", email: "victim@example.test", businessName: "Fake" }), { ok: true, tenantId: "tenant-new" });
  assert.equal(writes[0].value.name, "Mi negocio real");
  assert.equal(writes[1].value.user_id, "owner"); assert.equal(writes[1].value.role, "owner");
});
test("existing membership is reused; query failures do not create another business", async () => {
  reset(); user = { id: "owner", email_confirmed_at: "2026-01-01" }; existing = { tenant_id: "existing" };
  assert.deepEqual(await provisionTenant(), { ok: true, tenantId: "existing" }); assert.deepEqual(writes, []);
  existing = null; queryError = new Error("offline");
  assert.deepEqual(await provisionTenant(), { ok: false }); assert.deepEqual(writes, []);
});
test("Google accounts use a safe business name; failed membership cleans only the new orphan", async () => {
  reset(); user = { id: "google-user", email_confirmed_at: "2026-01-01", user_metadata: { business_name: {} } }; memberError = new Error("offline");
  assert.deepEqual(await provisionTenant(), { ok: false });
  assert.equal(writes[0].value.name, "Mi negocio"); assert.equal(writes[1].value.user_id, "google-user");
  assert.deepEqual(writes[2], { table: "tenants", deleted: true });
});

let verified, tokenError, provisionOk;
globalThis.__confirmClient = { auth: { verifyOtp: async params => { verified.push(params); return { error: tokenError }; } } };
globalThis.__provisionOk = () => ({ ok: provisionOk });
const { confirmEmail } = await load("../../app/(auth)/auth/confirm/actions.ts", {
  "@/lib/supabase/server": asModule("export const createClient = async () => globalThis.__confirmClient;"),
  "../../signup/actions": asModule("export const provisionTenant = async () => globalThis.__provisionOk();"),
  "@/lib/auth-messages": asModule(ts.transpileModule(await readFile(new URL("../../lib/auth-messages.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText),
  "next/navigation": asModule("export const redirect = path => { throw new Error('REDIRECT:' + path); };"),
});
test("confirmation requires a valid hashed token; expired links are recoverable", async () => {
  verified = []; tokenError = null; provisionOk = true;
  const form = new FormData(); form.set("token_hash", "bad");
  assert.match((await confirmEmail({ error: null }, form)).error, /no es válido/); assert.equal(verified.length, 0);
  form.set("token_hash", "a".repeat(64)); tokenError = { code: "otp_expired" };
  assert.match((await confirmEmail({ error: null }, form)).error, /solicita otro/);
});
test("verified confirmation redirects with a session; provisioning failures can retry without another signup", async () => {
  verified = []; tokenError = null; provisionOk = true;
  const form = new FormData(); form.set("token_hash", "a".repeat(64));
  await assert.rejects(confirmEmail({ error: null }, form), /REDIRECT:\/dashboard\/jarvis/);
  assert.deepEqual(verified[0], { token_hash: "a".repeat(64), type: "email" });
  provisionOk = false;
  await assert.rejects(confirmEmail({ error: null }, form), /REDIRECT:\/auth\/finish/);
});
