import assert from "node:assert/strict";
import test, { after, beforeEach } from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
async function load(file, replacements = {}) {
  let source = await readFile(new URL(file, import.meta.url), "utf8");
  for (const [name, url] of Object.entries(replacements)) source = source.replaceAll(`"${name}"`, `"${url}"`);
  return moduleUrl(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
}
const profileUrl = await load("../../lib/jarvis-personalization.ts");
const { sanitizePersonalization } = await import(profileUrl);
const voiceUrl = await load("../../lib/jarvis-voice.ts", { "./jarvis-personalization": profileUrl });
const { voiceEngine, elevenLabsSettings } = await import(voiceUrl);
const configUrl = await load("../../lib/voice/elevenlabs.ts", { "server-only": moduleUrl("export {};") });
const { voiceAvailability } = await import(configUrl);
const budgetUrl = await load("../../lib/voice/speech-budget.ts");
const { createSpeechBudget } = await import(budgetUrl);
const { createNeuralPlayback } = await import(await load("../../lib/neural-playback.ts"));
const { POST } = await import(await load("../../app/api/jarvis/voice/route.ts", {
  "@/lib/supabase/server": moduleUrl("export const createClient = async () => ({ auth: { getUser: async () => globalThis.__voiceUser } });"),
  "@/lib/jarvis-personalization": profileUrl, "@/lib/jarvis-voice": voiceUrl,
  "@/lib/voice/elevenlabs": configUrl, "@/lib/voice/speech-budget": budgetUrl,
}));

const originalFetch = globalThis.fetch;
const originalAudio = globalThis.Audio;
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
const originalEnv = Object.fromEntries(["ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "ELEVENLABS_MODEL"].map(key => [key, process.env[key]]));
let sequence = 0, calls, players, revoked;
const request = (body = { text: "Hola" }, init = {}) => new Request("https://jarvis.example/api/jarvis/voice", { method: "POST", headers: { "Content-Type": "application/json", "Origin": "https://jarvis.example", ...init.headers }, body: JSON.stringify(body), ...init });
const mp3 = () => new Response(new Uint8Array([73, 68, 51]), { headers: { "Content-Type": "audio/mpeg" } });
function playback() {
  const events = { activities: [], pending: [], ready: [], errors: [] };
  const player = createNeuralPlayback({ activity: value => events.activities.push(value), pending: value => events.pending.push(value), ready: value => events.ready.push(value), error: value => events.errors.push(value) });
  return { ...player, events };
}
beforeEach(() => {
  calls = []; players = []; revoked = [];
  globalThis.__voiceUser = { data: { user: { id: `voice-user-${++sequence}` } }, error: null };
  process.env.ELEVENLABS_API_KEY = "test-private-key";
  process.env.ELEVENLABS_VOICE_ID = "voice_id_123";
  delete process.env.ELEVENLABS_MODEL;
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return mp3(); };
  URL.createObjectURL = () => `blob:test-${players.length}`;
  URL.revokeObjectURL = url => revoked.push(url);
  globalThis.Audio = class {
    constructor(url) { this.url = url; this.paused = false; this.playCalls = 0; players.push(this); }
    async play() { this.playCalls++; this.onplaying?.(); }
    pause() { this.paused = true; }
    removeAttribute() {}
    load() {}
  };
});
after(() => {
  globalThis.fetch = originalFetch; globalThis.Audio = originalAudio;
  URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;
  for (const [key, value] of Object.entries(originalEnv)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  delete globalThis.__voiceUser;
});

test("older profiles keep voice preferences and default to auto; neural settings are bounded", () => {
  const p = sanitizePersonalization({ voice: { uri: "stored", rate: 1.4, pitch: 1.1, stability: -3, similarity: 10, engine: "injected" } });
  assert.equal(p.voice.engine, "auto"); assert.equal(p.voice.uri, "stored"); assert.equal(p.voice.pitch, 1.1);
  assert.equal(voiceEngine(p, { elevenLabs: false }), "browser");
  assert.equal(voiceEngine(p, { elevenLabs: true }), "elevenlabs");
  p.voice.engine = "browser"; assert.equal(voiceEngine(p, { elevenLabs: true }), "browser");
  const settings = elevenLabsSettings(p, "directo", "Hola");
  assert.equal(settings.speed, 1.2); assert.equal(settings.stability, 0); assert.equal(settings.similarity_boost, 1);
  p.voice.rate = 1; p.voice.stability = 0.5;
  assert.ok(elevenLabsSettings(p, "profesional", "Primero, $50").speed < 1);
  assert.equal(elevenLabsSettings(p, "profesional", "Hola").stability, 0.6);
  p.voice.adaptive = false;
  assert.deepEqual(elevenLabsSettings(p, "profesional", "Primero, $50"), { speed: 1, stability: 0.5, similarity_boost: 1 });
});

test("budget bounds concurrency, cooldown and character consumption and recovers after expiry", () => {
  const reserve = createSpeechBudget();
  const release = reserve("user", 4000, 10000);
  assert.ok(release); assert.equal(reserve("user", 1, 13000), null);
  release(); assert.equal(reserve("user", 1, 11000), null);
  reserve("user", 16000, 13000)();
  assert.equal(reserve("user", 1, 16000), null);
  assert.ok(reserve("user", 1, 620000));
});

test("foreign origins, missing sessions and anonymous accounts cannot spend provider credits", async () => {
  assert.equal((await POST(request({}, { headers: { Origin: "https://other.example" } }))).status, 403);
  globalThis.__voiceUser.data.user = null;
  assert.equal((await POST(request())).status, 401);
  globalThis.__voiceUser.data.user = { id: "anon", is_anonymous: true };
  assert.equal((await POST(request())).status, 401);
  globalThis.__voiceUser = { data: { user: { id: "forged" } }, error: new Error("auth failed") };
  assert.equal((await POST(request())).status, 401);
  assert.equal(calls.length, 0);
});

test("missing key, invalid voice IDs or unsupported models remain unavailable without exposing configuration", async () => {
  delete process.env.ELEVENLABS_API_KEY;
  assert.deepEqual(voiceAvailability(), { elevenLabs: false });
  assert.equal((await POST(request())).status, 503);
  process.env.ELEVENLABS_API_KEY = "test-private-key";
  process.env.ELEVENLABS_VOICE_ID = "../../other-url";
  assert.deepEqual(voiceAvailability(), { elevenLabs: false });
  process.env.ELEVENLABS_VOICE_ID = "valid";
  process.env.ELEVENLABS_MODEL = "unsupported";
  assert.equal((await POST(request())).status, 503); assert.equal(calls.length, 0);
});

test("invalid JSON, oversized streams, whitespace and excessive text are rejected before upstream calls", async () => {
  for (const body of [null, {}, { text: 4 }, { text: "  " }, { text: "x".repeat(4001) }]) assert.equal((await POST(request(body))).status, 400);
  const bad = new Request("https://jarvis.example/api/jarvis/voice", { method: "POST", body: "{" });
  assert.equal((await POST(bad)).status, 400);
  assert.equal((await POST(request({ text: "Hola", padding: "x".repeat(40000) }))).status, 400);
  assert.equal(calls.length, 0);
});

test("authenticated TTS streams private MP3 and uses only server credentials, voice and model", async () => {
  const response = await POST(request({ text: "**Hola** 🤖", voiceId: "attacker", model: "attacker", apiKey: "attacker", voice: { rate: 100, stability: -4, similarity: 40, adaptive: false } }));
  assert.equal(response.status, 200); assert.equal(response.headers.get("content-type"), "audio/mpeg");
  assert.match(response.headers.get("cache-control"), /private, no-store/);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([73, 68, 51]));
  const call = calls[0];
  assert.equal(call.url, "https://api.elevenlabs.io/v1/text-to-speech/voice_id_123/stream?output_format=mp3_44100_128");
  assert.equal(call.options.headers["xi-api-key"], "test-private-key");
  assert.equal(call.options.cache, "no-store");
  const body = JSON.parse(call.options.body);
  assert.equal(body.text, "Hola"); assert.equal(body.model_id, "eleven_multilingual_v2");
  assert.equal(body.language_code, undefined);
  assert.deepEqual(body.voice_settings, { speed: 1.2, stability: 0, similarity_boost: 1 });
});

test("Flash requests enforce Spanish and never retry or disclose private provider failures", async () => {
  process.env.ELEVENLABS_MODEL = "eleven_flash_v2_5";
  const response = await POST(request()); await response.arrayBuffer();
  assert.equal(JSON.parse(calls[0].options.body).language_code, "es");
  for (const status of [401, 402, 403, 429, 500]) {
    globalThis.__voiceUser.data.user.id = `error-${status}`;
    globalThis.fetch = async () => { calls.push({ status }); return new Response("PRIVATE_PROVIDER_PAYLOAD test-private-key", { status }); };
    const failure = await POST(request());
    assert.equal(failure.status, [402, 429].includes(status) ? status : 502);
    if (status === 402) assert.match(await failure.clone().text(), /plan de pago/);
    assert.doesNotMatch(await failure.text(), /PRIVATE_PROVIDER_PAYLOAD|test-private-key/);
  }
  assert.equal(calls.length, 6);
});

test("request and stream failures release the active reservation and report controlled errors", async () => {
  globalThis.fetch = async () => { throw new Error("PRIVATE_NETWORK_DETAIL"); };
  const failed = await POST(request()); assert.equal(failed.status, 502);
  assert.doesNotMatch(await failed.text(), /PRIVATE_NETWORK_DETAIL/);
  globalThis.__voiceUser.data.user.id = "cancel-user";
  let canceled = false;
  globalThis.fetch = async () => new Response(new ReadableStream({ cancel() { canceled = true; } }), { headers: { "Content-Type": "audio/mpeg" } });
  const streamed = await POST(request());
  await streamed.body.cancel(); assert.equal(canceled, true);
});

test("stopping a pending generation aborts fetch and a late response cannot start playback", async () => {
  let resolve;
  globalThis.fetch = (url, options) => { calls.push({ url, options }); return new Promise(r => { resolve = r; }); };
  const player = playback();
  const promise = player.speak({ text: "Hola" });
  player.stop(); assert.equal(calls[0].options.signal.aborted, true);
  resolve(mp3()); await promise;
  assert.equal(players.length, 0); assert.deepEqual(player.events.errors, []);
});

test("playback completion and stop release object URLs and detach late audio events", async () => {
  const player = playback();
  await player.speak({ text: "Hola" });
  assert.equal(players[0].playCalls, 1); assert.equal(player.events.activities.at(-1), true);
  const late = players[0].onplaying;
  player.stop(); late();
  assert.equal(player.events.activities.at(-1), false); assert.equal(players[0].onended, null);
  assert.equal(players[0].paused, true); assert.equal(revoked.length, 1);
  await player.speak({ text: "Otra" }); players[1].onended();
  assert.equal(revoked.length, 2); assert.equal(player.events.activities.at(-1), false);
});

test("autoplay blocks retain the audio for a user click without a second provider request", async () => {
  globalThis.Audio.prototype.play = async function () { this.playCalls++; if (this.playCalls === 1) throw new DOMException("blocked", "NotAllowedError"); this.onplaying?.(); };
  const player = playback();
  await player.speak({ text: "Hola" });
  assert.equal(player.events.ready.at(-1), true); assert.equal(revoked.length, 0);
  await player.play();
  assert.equal(player.events.ready.at(-1), false); assert.equal(player.events.activities.at(-1), true);
  assert.equal(calls.length, 1); player.stop();
});

test("a newer utterance supersedes a slow older generation", async () => {
  let resolveFirst;
  globalThis.fetch = (url, options) => { calls.push({ url, options }); return calls.length === 1 ? new Promise(resolve => { resolveFirst = resolve; }) : Promise.resolve(mp3()); };
  const player = playback();
  const first = player.speak({ text: "Primera" });
  await player.speak({ text: "Segunda" });
  resolveFirst(mp3()); await first;
  assert.equal(players.length, 1); assert.equal(calls[0].options.signal.aborted, true);
  player.stop();
});
