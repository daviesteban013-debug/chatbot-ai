import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const url = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const profile = url(compile(await readFile(new URL("../../lib/jarvis-personalization.ts", import.meta.url), "utf8")));
const source = (await readFile(new URL("../../lib/speech-turn.ts", import.meta.url), "utf8")).replace('"./jarvis-personalization"', JSON.stringify(profile));
const { createSpeechTurn, SPEECH_DETAILS_NOTICE } = await import(url(compile(source)));
const { readAgentStream } = await import(url(compile(await readFile(new URL("../../lib/agent-stream.ts", import.meta.url), "utf8"))));
const tick = () => new Promise(resolve => setImmediate(resolve));
function playback() {
  const spoken = [], finishes = [], states = [];
  const turn = createSpeechTurn({ speak(text) { spoken.push(text); return new Promise(resolve => finishes.push(resolve)); }, stop() { finishes.shift()?.(false); }, busy(value) { states.push(value); } });
  return { turn, spoken, states, finish: () => finishes.shift()?.(true), fail: () => finishes.shift()?.(false) };
}

test("speaks the first complete sentence before generation ends and queues the next without overlap", async () => {
  const p = playback(); p.turn.begin();
  p.turn.push("Tienes tres pedi"); assert.deepEqual(p.spoken, []);
  p.turn.push("dos. Dos esperan pago. ");
  assert.deepEqual(p.spoken, ["Tienes tres pedidos."]);
  p.finish(); await tick(); assert.deepEqual(p.spoken, ["Tienes tres pedidos.", "Dos esperan pago."]);
  p.turn.finish("Tienes tres pedidos. Dos esperan pago.");
  p.finish(); await tick(); assert.equal(p.states.at(-1), false);
});

test("long answers retain only two spoken sentences and one details cue, without replay at completion", async () => {
  const p = playback(); p.turn.begin();
  const text = "Hay tres pedidos. Dos esperan pago. Uno está pendiente.\n\n- Pedido 1\n- Pedido 2";
  p.turn.push(text); p.turn.finish(text); p.turn.finish(text);
  p.finish(); await tick(); p.finish(); await tick(); p.finish(); await tick();
  assert.deepEqual(p.spoken, ["Hay tres pedidos.", "Dos esperan pago.", SPEECH_DETAILS_NOTICE]);
  assert.equal(p.states.at(-1), false);
});

test("decimal values and abbreviations spanning deltas remain intact; memory replies need no deltas", async () => {
  const p = playback(); p.turn.begin(); p.turn.push("Sr."); p.turn.push(" Juan, cuesta $3.");
  assert.deepEqual(p.spoken, []);
  p.turn.push("500,50. "); assert.deepEqual(p.spoken, ["Sr. Juan, cuesta $3.500,50."]);
  p.turn.finish("Sr. Juan, cuesta $3.500,50."); p.finish(); await tick();
  p.turn.begin(); p.turn.finish("Guardé tu preferencia");
  assert.equal(p.spoken.at(-1), "Guardé tu preferencia"); p.finish(); await tick();
});

test("code, table and numbered-list bodies are left on screen even if they span chunks", async () => {
  for (const text of ["```js\nalert('secret');\n```", "| Producto | Precio |\n| Pan | $1 |", "1. Primer paso.\n2. Segundo paso."]) {
    const p = playback(); p.turn.begin(); p.turn.push(text); p.turn.finish(text); p.finish(); await tick();
    assert.deepEqual(p.spoken, [SPEECH_DETAILS_NOTICE]);
  }
});

test("stop discards waiting phrases and late completion; the next turn survives an old completion", async () => {
  const p = playback(); p.turn.begin(); p.turn.push("Primera. Segunda. ");
  p.turn.stop(); p.turn.push("Tercera. "); p.turn.finish("Primera. Segunda. Tercera.");
  p.turn.begin(); p.turn.push("Nueva respuesta. "); p.turn.finish("Nueva respuesta.");
  await tick(); assert.deepEqual(p.spoken, ["Primera.", "Nueva respuesta."]);
  assert.equal(p.states.at(-1), true); p.finish(); await tick(); assert.equal(p.states.at(-1), false);
});

test("a playback failure drops the remaining voice instead of starting more provider requests", async () => {
  const p = playback(); p.turn.begin(); p.turn.push("Primera. Segunda. "); p.fail(); await tick();
  p.turn.finish("Primera. Segunda. Tercera.");
  assert.deepEqual(p.spoken, ["Primera."]); assert.equal(p.states.at(-1), false);
});

test("SSE handles split UTF-8, CRLF and final completion without newline and releases its reader", async () => {
  const wire = new TextEncoder().encode('data: {"status":"streaming","delta":"Sí 🤖"}\r\n\r\ndata: {"status":"completed","content":"Sí 🤖"}');
  const body = new ReadableStream({ start(controller) { for (const byte of wire) controller.enqueue(Uint8Array.of(byte)); controller.close(); } });
  const events = [];
  for await (const event of readAgentStream(body, new AbortController().signal)) events.push(event);
  assert.deepEqual(events, [{ status: "streaming", delta: "Sí 🤖" }, { status: "completed", content: "Sí 🤖" }]);
  assert.equal(body.locked, false);
});

test("SSE cancellation and malformed frames close the stream and release the reader", async () => {
  for (const malformed of [false, true]) {
    let canceled = false;
    const abort = new AbortController();
    const body = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(malformed ? "data: {bad}\n" : 'data: {"status":"streaming","delta":"Hola"}\n')); }, cancel() { canceled = true; } });
    const run = async () => { for await (const event of readAgentStream(body, abort.signal)) { assert.equal(event.delta, "Hola"); abort.abort(); } };
    await assert.rejects(run()); assert.equal(canceled, true); assert.equal(body.locked, false);
  }
});
