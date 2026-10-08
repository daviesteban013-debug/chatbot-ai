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
  for (const text of ["¡Jarvis, enciéndete!", "Jarvis, actívate por favor", "Encender Jarvis", "¡NEXO, enciéndete!", "Activar Nexo", "Nexo, actívate por favor"]) assert.equal(jarvisCommand(text), "wake");
  assert.equal(jarvisCommand("NEXO, apágate"), "sleep");
  assert.equal(jarvisCommand("NEXO, abre el CRM"), "crm");
  assert.equal(jarvisCommand("Jarvis, apágate"), "sleep");
  assert.equal(jarvisCommand("Jarvis, abre el CRM"), "crm");
  for (const text of ["Dime cómo decir Jarvis enciéndete", "Dime cómo decir Nexo enciéndete", "No abras el CRM", "recuerda que apágate es mi comando", "encender las luces"]) assert.equal(jarvisCommand(text), null);
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
    assert.match(errors.at(-1), error === "not-allowed" ? /Permite el micrófono/ : error === "network" ? /no pudo conectarse/ : /no puede captar/);
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

const waitReconnect = () => new Promise(resolve => setTimeout(resolve, 400));

test("continuous conversation pauses per accepted turn, ignores late speech and resumes for the next instruction", async () => {
  const recognition = fakeRecognition(), accepted = [];
  const listener = createJarvisListener(recognition, { listening() {}, error() {}, transcript: text => { accepted.push(text); return true; } });
  listener.start(false, true);
  assert.equal(recognition.continuous, true);
  recognition.result("primer pedido");
  recognition.result("voz de Jarvis");
  recognition.onend();
  await waitReconnect();
  assert.equal(recognition.starts, 1);
  assert.deepEqual(accepted, ["primer pedido"]);
  listener.setPaused(false);
  await waitReconnect();
  assert.equal(recognition.starts, 2);
  recognition.result("segundo pedido");
  assert.deepEqual(accepted, ["primer pedido", "segundo pedido"]);
  listener.dispose();
});

test("continuous silence reconnects, but explicit stop cancels its pending restart", async () => {
  const recognition = fakeRecognition();
  const listener = createJarvisListener(recognition, { listening() {}, error() {}, transcript: () => false });
  listener.start(false, true);
  recognition.onerror({ error: "no-speech" }); recognition.onend();
  await waitReconnect();
  assert.equal(recognition.starts, 2);
  recognition.onend(); listener.stop(); listener.setPaused(false);
  await waitReconnect();
  assert.equal(recognition.starts, 2);
  listener.dispose();
});

test("voice/hidden-tab suspension prevents recognition and survives a late aborted event after resuming", async () => {
  const recognition = fakeRecognition(), errors = [], transcripts = [];
  const listener = createJarvisListener(recognition, { listening() {}, error: error => errors.push(error), transcript: text => { transcripts.push(text); return true; } });
  listener.start(false, true);
  listener.setPaused(true);
  listener.setPaused(false); // Audio ended before the prior recognizer's abort event arrived.
  recognition.result("eco tardío");
  recognition.onerror({ error: "aborted" }); recognition.onend();
  await waitReconnect();
  assert.equal(recognition.starts, 2);
  assert.deepEqual(transcripts, []);
  assert.deepEqual(errors, [null]);
  listener.setPaused(true); recognition.onend();
  await waitReconnect();
  assert.equal(recognition.starts, 2);
  listener.dispose();
});

test("arming during playback does not capture until the response finishes", async () => {
  const recognition = fakeRecognition();
  const listener = createJarvisListener(recognition, { listening() {}, error() {}, transcript: () => true });
  listener.setPaused(true); listener.start(false, true);
  assert.equal(recognition.starts, 0);
  listener.setPaused(false); await waitReconnect();
  assert.equal(recognition.starts, 1);
  listener.dispose();
});

test("continuous permission failure remains stopped even when playback/visibility changes", async () => {
  const recognition = fakeRecognition();
  const listener = createJarvisListener(recognition, { listening() {}, error() {}, transcript: () => true });
  listener.start(false, true);
  recognition.onerror({ error: "not-allowed" }); recognition.onend();
  listener.setPaused(true); listener.setPaused(false); await waitReconnect();
  assert.equal(recognition.starts, 1);
  listener.dispose();
});

test("repeated rapid disconnections and disposal cannot create an infinite reconnect loop", async () => {
  const recognition = fakeRecognition(), errors = [];
  const listener = createJarvisListener(recognition, { listening() {}, error: message => errors.push(message), transcript: () => false });
  listener.start(false, true);
  for (let i = 0; i < 3; i++) { recognition.onend(); await waitReconnect(); }
  assert.equal(recognition.starts, 3);
  assert.match(errors.at(-1), /detuvo la escucha/);
  listener.setPaused(false); listener.dispose(); listener.start(false, true);
  await waitReconnect();
  assert.equal(recognition.starts, 3);
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
const provision = moduleUrl("export const provisionTenant = async () => ({ ok: true });");
const redirects = moduleUrl(ts.transpileModule(await readFile(new URL("../../lib/auth-redirect.ts", import.meta.url), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
const desktopAuth = await readFile(new URL("../../lib/desktop-auth.ts", import.meta.url), "utf8");
const desktopAuthUrl = moduleUrl(ts.transpileModule(desktopAuth, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
const { GET } = await load("../../app/auth/callback/route.ts", { "next/server": nextUrl, "@/lib/supabase/server": server, "@/app/(auth)/signup/actions": provision, "@/lib/auth-redirect": redirects, "@/lib/desktop-auth": desktopAuthUrl });
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
