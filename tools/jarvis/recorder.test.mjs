import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl } from '../stripe/load-module.mjs';
const { createRecorderListener } = await import(await moduleUrl('lib/voice/recorder-listener.ts'));
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
function harness(t, { pendingPermission = false, pendingUpload = false } = {}) {
  let now = 1000, rms = .001, tick, calls = 0, close = 0, resolvePermission, resolveUpload;
  const track = { enabled: true, stopped: 0, stop() { this.stopped++; } };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const original = new Map();
  const replace = (name, value) => { original.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { configurable: true, writable: true, value }); };
  replace('navigator', { mediaDevices: { getUserMedia: () => pendingPermission ? new Promise(resolve => { resolvePermission = resolve; }) : Promise.resolve(stream) } });
  replace('AudioContext', class { async resume() {} async close() { close++; } createMediaStreamSource() { return { connect() {} }; } createAnalyser() { return { fftSize: 1024, getFloatTimeDomainData(array) { array.fill(rms); } }; } });
  const recorders = [];
  replace('MediaRecorder', class {
    static isTypeSupported() { return true; }
    state = 'inactive';
    constructor() { recorders.push(this); }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob([new Uint8Array(500)], { type: 'audio/webm' }) }); void this.onstop?.(); }
  });
  replace('performance', { now: () => now });
  replace('setInterval', callback => { tick = callback; return 1; });
  replace('clearInterval', () => { tick = null; });
  replace('fetch', async (_url, options) => {
    calls++;
    assert.equal(options.body.get('language'), 'es-CO');
    if (pendingUpload) return new Promise(resolve => { resolveUpload = resolve; });
    return Response.json({ text: 'Abre pedidos.' });
  });
  t.after(() => { for (const [name, descriptor] of original) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } });
  const accepted = [], errors = [], listening = [];
  const listener = createRecorderListener('es-CO', { listening: value => listening.push(value), error: value => { if (value) errors.push(value); }, transcript: text => { accepted.push(text); return true; } });
  t.after(() => listener.dispose());
  return { listener, track, accepted, errors, listening, recorders, calls: () => calls, closed: () => close,
    permission: () => resolvePermission(stream), upload: () => resolveUpload(Response.json({ text: 'Late speech' })),
    sample(value, ms = 35) { now += ms; rms = value; tick?.(); },
    phrase() { for (let i = 0; i < 12; i++) this.sample(.12); for (let i = 0; i < 22; i++) this.sample(.001); },
  };
}
test('recorder sends spoken phrases, skips silence, keeps continuous mode and releases mic on stop', async t => {
  const h = harness(t); await h.listener.start(false, true);
  for (let i = 0; i < 40; i++) h.sample(.001);
  assert.equal(h.recorders.length, 0); assert.equal(h.calls(), 0);
  h.phrase(); await flush(); assert.deepEqual(h.accepted, ['Abre pedidos.']);
  h.listener.setPaused(true); assert.equal(h.track.enabled, false);
  h.phrase(); assert.equal(h.calls(), 1);
  h.listener.setPaused(false); h.phrase(); await flush(); assert.equal(h.calls(), 2);
  h.listener.stop(); assert.equal(h.track.stopped, 1); assert.equal(h.closed(), 1); assert.equal(h.listening.at(-1), false);
  assert.deepEqual(h.errors, []);
});
test('late microphone permission after cancel releases its track without recording', async t => {
  const h = harness(t, { pendingPermission: true }); const start = h.listener.start(false, true);
  h.listener.stop(); h.permission(); await start;
  assert.equal(h.track.stopped, 1); assert.equal(h.recorders.length, 0); assert.equal(h.calls(), 0);
});
test('pausing during speech discards capture; stopping a pending transcription ignores its late text', async t => {
  const h = harness(t, { pendingUpload: true }); await h.listener.start(false, true);
  for (let i = 0; i < 10; i++) h.sample(.12);
  h.listener.setPaused(true); await flush(); assert.equal(h.calls(), 0);
  h.listener.setPaused(false); h.phrase(); await flush(); assert.equal(h.calls(), 1);
  h.listener.stop(); h.upload(); await flush(); assert.deepEqual(h.accepted, []); assert.equal(h.track.stopped, 1);
});
