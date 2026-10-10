import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { moduleUrl } from '../stripe/load-module.mjs';
const { jarvisCommand, jarvisCommandPanel, commandPanels } = await import(await moduleUrl('lib/jarvis-commands.ts'));
const desktopPolicy = createRequire(import.meta.url)('../../desktop/policy.cjs');
const { createVoiceActivity } = await import(await moduleUrl('lib/voice/voice-activity.ts'));
const { desktopAuthResponse } = await import(await moduleUrl('lib/desktop-auth.ts'));
const { createTranscriptionHandler } = await import(await moduleUrl('lib/voice/transcription.ts'));
test('spoken commands route every actual CRM panel and do not execute chat or negation', () => {
  for (const [text, route] of [['NEXO, abre pedidos', '/dashboard/orders'], ['Abre el catálogo por favor', '/dashboard/catalog'], ['Muéstrame conversaciones', '/dashboard/conversations'], ['Abre handoffs', '/dashboard/handoffs'], ['Abre aprobaciones', '/dashboard/approval'], ['Ve a configuración', '/dashboard/agent'], ['Abre planes y pagos', '/dashboard/billing'], ['Abre resumen', '/dashboard'], ['Abre NEXO', '/dashboard/jarvis']]) assert.equal(jarvisCommandPanel(jarvisCommand(text))?.path, route);
  for (const text of ['No abras pedidos', '¿Cómo puedo abrir pagos?', 'Dice "abre pedidos"', 'abre https://evil.test', 'abre clientes', 'abre pedidos y borra todo']) assert.equal(jarvisCommandPanel(jarvisCommand(text)), null);
});
test('voice activity ignores silence, rejects short spikes and bounds a spoken phrase', () => {
  const gate = createVoiceActivity();
  for (let t = 35; t < 1000; t += 35) assert.equal(gate.sample(0.002, t), null);
  assert.equal(gate.sample(.15, 1000), 'start');
  assert.equal(gate.sample(.002, 2100), 'finish'); assert.equal(gate.valid(), false);
  gate.reset();
  assert.equal(gate.sample(.15, 3000), 'start');
  for (let t = 3035; t <= 3350; t += 35) gate.sample(.15, t);
  assert.equal(gate.sample(.001, 4000), null);
  assert.equal(gate.sample(.001, 4100), 'finish'); assert.equal(gate.valid(), true);
  gate.reset(); gate.sample(.2, 5000);
  assert.equal(gate.sample(.2, 17000), 'finish'); assert.equal(gate.duration(18000), 12000);
});

test('desktop accepts every current command panel, including memory, tasks and reminders', () => {
  for (const panel of Object.values(commandPanels)) assert.equal(desktopPolicy.panelUrl(panel.path), desktopPolicy.APP_ORIGIN + panel.path);
  for (const phrase of ['NEXO, abre memoria', 'abre tareas', 'abre recordatorios', 'abre memoria y tareas']) {
    const panel = jarvisCommandPanel(jarvisCommand(phrase));
    assert.equal(panel?.path, '/dashboard/workspace');
    assert.equal(desktopPolicy.panelUrl(panel.path), desktopPolicy.APP_ORIGIN + '/dashboard/workspace');
  }
});
test('desktop callback contains no session tokens, disallows injected codes and cannot be cached', async () => {
  const response = desktopAuthResponse('12345678-abcd-abcd-abcd-123456789012');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.match(await response.text(), /nexo-desktop:\/\/auth\?code=/);
  assert.equal(desktopAuthResponse('<script>alert(1)</script>').status, 400);
});
function request(overrides = {}) {
  const form = new FormData(); form.set('audio', new Blob([new Uint8Array(500)], { type: overrides.type || 'audio/webm' }), 'voice.webm'); form.set('duration', overrides.duration || '1300'); form.set('language', 'es-CO');
  return new Request('https://nexo.test/api/jarvis/transcribe', { method: 'POST', body: form, headers: overrides.headers || { origin: 'https://nexo.test' } });
}
function setup(overrides = {}) {
  let calls = 0, releases = 0;
  const handler = createTranscriptionHandler({ user: async () => ({ id: 'user1' }), key: () => 'private-test-key', reserve: () => () => { releases++; }, fetch: async (_url, options) => { calls++; assert.equal(options.body.get('model'), 'gpt-4o-mini-transcribe'); assert.equal(options.body.get('language'), 'es'); return Response.json({ text: 'Abre pedidos.' }); }, ...overrides });
  return { handler, calls: () => calls, releases: () => releases };
}
test('transcription authenticates and checks origin before any provider call', async () => {
  const signedOut = setup({ user: async () => null }); assert.equal((await signedOut.handler(request())).status, 401); assert.equal(signedOut.calls(), 0);
  const anonymous = setup({ user: async () => ({ id: 'anon', is_anonymous: true }) }); assert.equal((await anonymous.handler(request())).status, 401);
  const foreign = setup(); assert.equal((await foreign.handler(request({ headers: { origin: 'https://evil.test' } }))).status, 403); assert.equal(foreign.calls(), 0);
});
test('transcription rejects oversized uploads, unsupported media and exhausted budget', async () => {
  const deps = setup();
  assert.equal((await deps.handler(request({ headers: { 'content-length': '300000' } }))).status, 413);
  assert.equal((await deps.handler(request({ type: 'text/plain' }))).status, 400);
  assert.equal((await deps.handler(request({ duration: '90000' }))).status, 400);
  assert.equal(deps.calls(), 0);
  assert.equal((await setup({ reserve: () => null }).handler(request())).status, 429);
});
test('valid audio returns text privately; failures release budget and hide provider secrets', async () => {
  const deps = setup(); const response = await deps.handler(request());
  assert.deepEqual(await response.json(), { text: 'Abre pedidos.' }); assert.equal(deps.calls(), 1); assert.equal(deps.releases(), 1); assert.match(response.headers.get('cache-control'), /no-store/);
  const failure = setup({ fetch: async () => new Response('SECRET provider body', { status: 401 }) }); const result = await failure.handler(request()); assert.equal(result.status, 502); assert.equal(failure.releases(), 1); assert.doesNotMatch(await result.text(), /SECRET|private-test-key/);
});
