import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const code = ts.transpileModule(await readFile(new URL("../../lib/jarvis-claps.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { createDoubleClapDetector, measureClapFrame, createClapListener } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const silence = { rms: .004, peak: .01, crest: 2.5 };
const clap = { rms: .09, peak: .8, crest: 8.9 };
function detect(events, background = silence) {
  const detector = createDoubleClapDetector(), hits = [];
  for (let now = 0; now <= 3000; now += 20) {
    const signal = events.find(event => now >= event.start && now < event.start + event.duration)?.signal ?? background;
    if (detector.feed(signal, now)) hits.push(now);
  }
  return hits;
}
test("measures real time-domain samples and detects two sharp separated transients", () => {
  const samples = new Float32Array(1024);
  samples[0] = .8; samples[1] = -.6;
  const measurement = measureClapFrame(samples);
  assert.ok(measurement.peak > .79 && measurement.crest > 20);
  assert.deepEqual(detect([{ start: 800, duration: 40, signal: clap }, { start: 1200, duration: 40, signal: clap }]), [1240]);
});
test("ignores a single clap, echoes, slow pairs, calibration and sustained sound", () => {
  for (const starts of [[800], [800, 900], [800, 1900], [100, 400]]) {
    assert.deepEqual(detect(starts.map(start => ({ start, duration: 40, signal: clap }))), []);
  }
  assert.deepEqual(detect([{ start: 800, duration: 300, signal: clap }, { start: 1400, duration: 40, signal: clap }]), []);
  const voice = { rms: .06, peak: .12, crest: 2 };
  assert.deepEqual(detect([{ start: 800, duration: 100, signal: voice }, { start: 1200, duration: 100, signal: voice }]), []);
  assert.deepEqual(detect([], { rms: .07, peak: .25, crest: 3.5 }), []);
});
test("adapts to background noise and does not count a loud continuous sound as a clap", () => {
  const background = { rms: .025, peak: .05, crest: 2 };
  assert.deepEqual(detect([{ start: 800, duration: 40, signal: clap }, { start: 1200, duration: 40, signal: clap }], background), []);
  const louder = { rms: .15, peak: .9, crest: 6 };
  assert.deepEqual(detect([{ start: 800, duration: 40, signal: louder }, { start: 1200, duration: 40, signal: louder }], background), [1240]);
});

function harness(mediaOverride) {
  const state = { requests: 0, stopped: 0, closed: 0, disconnected: 0, connections: 0, frames: new Map(), now: 0, hit: 0, pending: [], listening: [], errors: [] };
  let nextFrame = 0;
  const track = { onended: null, stop() { state.stopped++; } };
  const stream = { getTracks: () => [track] };
  const analyser = { fftSize: 1024, disconnect() { state.disconnected++; }, getFloatTimeDomainData(samples) {
    samples.fill(.001);
    if ((state.now >= 800 && state.now < 840) || (state.now >= 1200 && state.now < 1240)) {
      for (let i = 0; i < 32; i++) samples[i] = i % 2 ? -.8 : .8;
    }
  } };
  const context = { state: "running", resume: async () => {}, close: async () => { state.closed++; },
    createAnalyser: () => analyser, createMediaStreamSource: () => ({ connect(to) { assert.equal(to, analyser); state.connections++; }, disconnect() { state.disconnected++; } }) };
  const listener = createClapListener({
    media: () => { state.requests++; return mediaOverride ? mediaOverride(stream) : Promise.resolve(stream); },
    audio: () => context, now: () => state.now,
    frame: callback => { state.frames.set(++nextFrame, callback); return nextFrame; },
    cancelFrame: id => state.frames.delete(id),
  }, { pending: value => state.pending.push(value), listening: value => state.listening.push(value), error: value => state.errors.push(value),
    clap() { assert.equal(state.stopped, 1); assert.equal(state.closed, 1); assert.equal(state.listening.at(-1), false); state.hit++; } });
  return { listener, state, track, context };
}
test("does not capture until armed; releases tracks and audio before waking exactly once", async () => {
  const { listener, state } = harness();
  assert.equal(state.requests, 0);
  await listener.start();
  assert.equal(state.listening.at(-1), true);
  for (state.now = 0; state.now < 1600; state.now += 20) {
    const frame = state.frames.entries().next().value;
    if (frame) { state.frames.delete(frame[0]); frame[1](); }
  }
  assert.equal(state.hit, 1);
  assert.equal(state.frames.size, 0);
  assert.equal(state.connections, 1);
  assert.equal(state.disconnected, 2);
  listener.dispose();
});
test("late permission after cancel/dispose cannot reactivate or leak a microphone", async () => {
  for (const action of ["stop", "dispose"]) {
    let grant;
    const { listener, state } = harness(stream => new Promise(resolve => { grant = () => resolve(stream); }));
    const starting = listener.start();
    listener[action](); grant(); await starting;
    assert.equal(state.stopped, 1); assert.equal(state.closed, 1); assert.equal(state.frames.size, 0); assert.equal(state.hit, 0);
    assert.ok(!state.listening.includes(true));
    listener.dispose();
  }
});
test("denied microphone and suspended audio clean up without retrying", async () => {
  const denied = harness(() => Promise.reject(Object.assign(new Error(), { name: "NotAllowedError" })));
  await denied.listener.start();
  assert.match(denied.state.errors.at(-1), /Permite el micrófono/);
  assert.equal(denied.state.requests, 1); assert.equal(denied.state.closed, 1);
  assert.equal(denied.state.pending.at(-1), false);
  const suspended = harness(); suspended.context.state = "suspended";
  await suspended.listener.start();
  assert.equal(suspended.state.stopped, 1); assert.equal(suspended.state.closed, 1);
  assert.equal(suspended.state.frames.size, 0);
});
test("device loss or explicit stop cancels analysis; stale frames cannot wake Jarvis", async () => {
  for (const deviceLoss of [false, true]) {
    const { listener, state, track } = harness();
    await listener.start();
    const stale = [...state.frames.values()][0];
    if (deviceLoss) track.onended(); else listener.stop();
    stale();
    assert.equal(state.stopped, 1); assert.equal(state.closed, 1); assert.equal(state.hit, 0);
    assert.equal(state.frames.size, 0);
  }
});
