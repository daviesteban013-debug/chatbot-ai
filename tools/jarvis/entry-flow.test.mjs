import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
async function load(path, replacements = {}) {
  let source = await readFile(new URL(path, import.meta.url), "utf8");
  for (const [name, value] of Object.entries(replacements)) source = source.replaceAll(`"${name}"`, `"${value}"`);
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText
    .replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve("react/jsx-runtime")));
  return import(moduleUrl(compiled));
}
const { jarvisCommand } = await load("../../lib/jarvis-commands.ts");
const { createJarvisListener } = await load("../../lib/jarvis-listener.ts");

test("spoken and typed commands tolerate accents and punctuation, without matching ordinary requests", () => {
  for (const text of ["¡Jarvis, enciéndete!", "Jarvis, actívate por favor", "Encender Jarvis"]) assert.equal(jarvisCommand(text), "wake");
  assert.equal(jarvisCommand("Jarvis, apágate"), "sleep");
  assert.equal(jarvisCommand("Jarvis, abre el CRM"), "crm");
  for (const text of ["Dime cómo decir Jarvis enciéndete", "No abras el CRM", "recuerda que apágate es mi comando", "encender las luces"]) assert.equal(jarvisCommand(text), null);
});

function fakeRecognition() {
  return { starts: 0, aborts: 0, start() { this.starts++; this.onstart?.(); }, abort() { this.aborts++; },
    result(text, isFinal = true, resultIndex = 0, previous = []) { this.onresult?.({ resultIndex, results: [...previous, { isFinal, 0: { transcript: text } }] }); } };
}
test("wake listener is opt-in, ignores interim/unrelated speech, and stops when the wake command arrives", () => {
  const recognition = fakeRecognition();
  const accepted = [], recording = [];
  const listener = createJarvisListener(recognition, { listening: value => recording.push(value), error() {}, transcript(text, wakeOnly) {
    assert.equal(wakeOnly, true);
    if (jarvisCommand(text) !== "wake") return false;
    accepted.push(text); return true;
  } });
  assert.equal(recognition.starts, 0);
  listener.start(true);
  recognition.result("Jarvis, enciéndete", false);
  recognition.result("hablar con un cliente");
  assert.deepEqual(accepted, []);
  recognition.result("Jarvis, enciéndete", true, 1, [{ isFinal: true, 0: { transcript: "ruido anterior" } }]);
  assert.equal(accepted.length, 1);
  assert.equal(recording.at(-1), false);
  recognition.result("Jarvis, enciéndete");
  assert.equal(accepted.length, 1);
  listener.dispose();
});
test("permission and network failures release the mic without retrying; late results are ignored", async () => {
  for (const error of ["not-allowed", "network", "audio-capture"]) {
    const recognition = fakeRecognition();
    const errors = [], transcripts = [];
    const listener = createJarvisListener(recognition, { listening() {}, error: value => errors.push(value), transcript: text => { transcripts.push(text); return true; } });
    listener.start(true);
    recognition.onerror({ error });
    recognition.onend();
    recognition.result("Jarvis, enciéndete");
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.equal(recognition.starts, 1);
    assert.deepEqual(transcripts, []);
    assert.equal(typeof errors.at(-1), "string");
    listener.dispose();
    assert.equal(recognition.onresult, null);
  }
});
test("wake listening reconnects after silence but explicit stop cancels reconnect; conversation is one turn", async () => {
  const recognition = fakeRecognition();
  const listener = createJarvisListener(recognition, { listening() {}, error() {}, transcript: () => true });
  listener.start(true);
  recognition.onerror({ error: "no-speech" });
  recognition.onend();
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.equal(recognition.starts, 2);
  recognition.onend(); listener.stop();
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.equal(recognition.starts, 2);
  listener.dispose();
  const single = fakeRecognition();
  const oneTurn = createJarvisListener(single, { listening() {}, error() {}, transcript: () => true });
  oneTurn.start(false); single.result("muéstrame el catálogo"); single.onend();
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.equal(single.starts, 1);
  oneTurn.dispose();
});

let authState;
globalThis.__entryClient = () => ({ auth: {
  exchangeCodeForSession: async () => ({ error: authState.fail ? new Error("failed") : null }),
  getUser: async () => ({ data: { user: authState.user } }),
}, from() {
  const query = { select() { return query; }, eq() { return query; }, limit() { return query; }, maybeSingle: async () => ({ data: { tenants: { agents: { onboarding_completed: false } } }, error: null }) };
  return query;
} });
const nextUrl = moduleUrl(`
 const cookies = () => ({ getAll: () => [], set() {} });
 export const NextResponse = { redirect: url => ({ location: String(url), cookies: cookies() }), next: () => ({ cookies: cookies() }) };
`);
const server = moduleUrl("export const createClient = async () => globalThis.__entryClient();");
const { GET } = await load("../../app/auth/callback/route.ts", { "next/server": nextUrl, "@/lib/supabase/server": server });
const { proxy } = await load("../../proxy.ts", { "next/server": nextUrl, "@supabase/ssr": moduleUrl("export const createServerClient = () => globalThis.__entryClient();") });
test("email confirmation lands in Jarvis, honors internal destinations, and rejects external redirects", async () => {
  authState = {};
  assert.equal((await GET(new Request("https://app.example/auth/callback?code=ok"))).location, "https://app.example/dashboard/jarvis");
  assert.equal((await GET(new Request("https://app.example/auth/callback?code=ok&next=/dashboard/orders"))).location, "https://app.example/dashboard/orders");
  assert.match((await GET(new Request("https://app.example/auth/callback?code=ok&next=https://evil.example"))).location, /^https:\/\/app.example\/login/);
  authState.fail = true;
  assert.match((await GET(new Request("https://app.example/auth/callback?code=bad"))).location, /auth_callback_error/);
});
function request(path) { const url = `https://app.example${path}`; return { url, nextUrl: new URL(url), cookies: { get: () => undefined, getAll: () => [], set() {} } }; }
test("signed-in entry lands in Jarvis; guests stay protected and incomplete onboarding does not block CRM access", async () => {
  authState = { user: { id: "user-1" } };
  assert.equal((await proxy(request("/login"))).location, "https://app.example/dashboard/jarvis");
  assert.equal((await proxy(request("/signup"))).location, "https://app.example/dashboard/jarvis");
  assert.equal((await proxy(request("/dashboard/jarvis"))).location, undefined);
  assert.equal((await proxy(request("/dashboard"))).location, undefined);
  authState.user = null;
  assert.equal((await proxy(request("/dashboard/jarvis"))).location, "https://app.example/login");
  assert.equal((await proxy(request("/dashboard"))).location, "https://app.example/login");
});

const { DashboardShell } = await load("../../components/dashboard/dashboard-shell.tsx", {
  "next/navigation": moduleUrl("export const usePathname = () => globalThis.__entryPath;"),
  "./sidebar": moduleUrl(`import { createElement } from ${JSON.stringify(import.meta.resolve("react"))}; export const DashboardSidebar = () => createElement("aside", null, "CRM navigation");`),
});
test("Jarvis fills the screen without CRM navigation, including accounts awaiting business provisioning", () => {
  const props = { children: createElement("section", null, "Jarvis"), tenantName: "Business" };
  globalThis.__entryPath = "/dashboard/jarvis";
  assert.equal(renderToStaticMarkup(createElement(DashboardShell, props)), "<section>Jarvis</section>");
  assert.equal(renderToStaticMarkup(createElement(DashboardShell, { ...props, fallback: createElement("p", null, "Business missing") })), "<section>Jarvis</section>");
  globalThis.__entryPath = "/dashboard";
  assert.match(renderToStaticMarkup(createElement(DashboardShell, props)), /<aside>CRM navigation<\/aside>/);
  assert.equal(renderToStaticMarkup(createElement(DashboardShell, { ...props, fallback: createElement("p", null, "Business missing") })), "<p>Business missing</p>");
});
