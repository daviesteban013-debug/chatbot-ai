import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}
const { default: manifest } = await load("../../app/manifest.ts");
const { createInstallRequest, isAppleMobile } = await load("../../lib/pwa-install.ts");

test("install manifest has valid actual icons and opens authenticated Jarvis in a standalone window", async () => {
  const m = manifest();
  assert.equal(m.start_url, "/dashboard/jarvis");
  assert.equal(m.scope, "/");
  assert.equal(m.id, "/");
  assert.equal(m.display, "standalone");
  assert.equal(m.prefer_related_applications, false);
  assert.ok(m.name && m.short_name);
  for (const icon of m.icons) {
    const png = await readFile(new URL(`../../public${icon.src}`, import.meta.url));
    assert.equal(png.toString("hex", 0, 8), "89504e470d0a1a0a");
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
  assert.ok(m.icons.some(i => i.sizes === "192x192"));
  assert.ok(m.icons.some(i => i.sizes === "512x512" && i.purpose === "maskable"));
  const apple = await readFile(new URL("../../public/icons/jarvis-apple-180.png", import.meta.url));
  assert.equal(apple.readUInt32BE(16), 180);
});

test("install runs from a user action, consumes the event once, and retries only with a fresh browser event", async () => {
  const request = createInstallRequest();
  let prompts = 0, prevented = 0;
  const event = outcome => ({ preventDefault() { prevented++; }, async prompt() { prompts++; }, userChoice: Promise.resolve({ outcome }) });
  assert.equal(await request.request(), "unavailable");
  request.capture(event("dismissed"));
  assert.equal(prompts, 0);
  assert.equal(await request.request(), "dismissed");
  assert.equal(await request.request(), "unavailable");
  request.capture(event("accepted"));
  assert.equal(await request.request(), "accepted");
  assert.equal(prompts, 2);
  assert.equal(prevented, 2);
  request.capture(event("accepted")); request.clear();
  assert.equal(await request.request(), "unavailable");
});
test("unsupported/failed prompts fall back honestly; concurrent clicks do not request two installations", async () => {
  const request = createInstallRequest();
  request.capture({ preventDefault() {}, prompt: async () => { throw new Error("unsupported"); } });
  assert.equal(await request.request(), "unavailable");
  let resolve;
  let prompts = 0;
  request.capture({ preventDefault() {}, async prompt() { prompts++; }, userChoice: new Promise(r => { resolve = r; }) });
  const first = request.request();
  assert.equal(await request.request(), "unavailable");
  resolve({ outcome: "accepted" });
  assert.equal(await first, "accepted");
  assert.equal(prompts, 1);
});
test("iPhone and iPad receive the Share-menu instructions, including iPads using the desktop agent", () => {
  assert.equal(isAppleMobile("iPhone Safari", 5), true);
  assert.equal(isAppleMobile("Macintosh Safari", 5), true);
  assert.equal(isAppleMobile("Macintosh Safari", 0), false);
  assert.equal(isAppleMobile("Android Chrome", 5), false);
});

const workerSource = await readFile(new URL("../../public/sw.js", import.meta.url), "utf8");
function worker() {
  const handlers = {}, writes = [], deleted = [];
  const offline = new Response("Offline public screen", { headers: { "Content-Type": "text/html" } });
  let failFetch = false;
  const self = { location: { origin: "https://app.example" }, addEventListener: (name, fn) => { handlers[name] = fn; }, skipWaiting: async () => {}, clients: { claim: async () => {} } };
  const caches = {
    open: async () => ({ addAll: async files => { writes.push(...files); } }),
    keys: async () => ["jarvis-public-v0", "jarvis-public-v1", "jarvis-public-v2", "another-app-cache"],
    delete: async key => { deleted.push(key); return true; },
    match: async path => path === "/offline.html" ? offline : new Response("Public icon"),
  };
  const response = new Response("Network-only account page", { status: 200, headers: { "Set-Cookie": "session=private" } });
  vm.runInNewContext(workerSource, { self, caches, URL, Response, fetch: async () => { if (failFetch) throw new Error("offline"); return response; } });
  const fetchEvent = (path, method = "GET", mode = "cors") => {
    let result;
    handlers.fetch({ request: { url: new URL(path, self.location.origin).href, method, mode }, respondWith: promise => { result = promise; } });
    return result;
  };
  return { handlers, writes, deleted, response, offline, fetchEvent, offlineMode: () => { failFetch = true; } };
}
test("service worker precaches only public files and only deletes its own outdated cache", async () => {
  const w = worker();
  let installed;
  w.handlers.install({ waitUntil: promise => { installed = promise; } }); await installed;
  assert.ok(w.writes.includes("/offline.html"));
  for (const path of w.writes) {
    assert.ok(path === "/offline.html" || path.startsWith("/icons/"));
    await readFile(new URL(`../../public${path}`, import.meta.url));
  }
  let activated;
  w.handlers.activate({ waitUntil: promise => { activated = promise; } }); await activated;
  assert.deepEqual(w.deleted, ["jarvis-public-v0", "jarvis-public-v1"]);
});
test("private navigation remains network-only, never replaying account responses or session cookies offline", async () => {
  const w = worker();
  assert.equal(await w.fetchEvent("/dashboard/jarvis", "GET", "navigate"), w.response);
  assert.equal(await w.fetchEvent("/auth/callback?code=private", "GET", "navigate"), w.response);
  assert.deepEqual(w.writes, []);
  w.offlineMode();
  assert.equal(await w.fetchEvent("/dashboard/jarvis", "GET", "navigate"), w.offline);
  assert.equal(w.offline.headers.get("Set-Cookie"), null);
  assert.deepEqual(w.writes, []);
});
test("API calls, server actions, RSC, authenticated assets and external traffic bypass the worker", () => {
  const w = worker();
  for (const [path,method,mode] of [
    ["/api/chat", "POST", "cors"], ["/api/chat?sessionId=user", "GET", "cors"],
    ["/dashboard", "POST", "cors"], ["/dashboard/jarvis?_rsc=private", "GET", "cors"],
    ["/auth/callback?code=private", "GET", "cors"], ["/_next/static/chunks/one.js", "GET", "cors"],
    ["https://auth.example/user", "GET", "navigate"], ["/icons/jarvis-192.png?private=1", "GET", "cors"],
  ]) assert.equal(w.fetchEvent(path,method,mode), undefined);
  assert.deepEqual(w.writes, []);
});
