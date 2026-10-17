const { test } = require('node:test');
const assert = require('node:assert/strict');
const { APP_ORIGIN, trustedUrl, panelUrl, color, googleUrl, callbackUrl } = require('../policy.cjs');
const { microphoneConsent, notice } = require('../policy.cjs');
test('proactive alerts accept short plain text and only CRM panels as destinations', () => {
  assert.deepEqual(notice({ title: 'NEXO', body: 'Ana espera un asesor', href: '/dashboard/handoffs' }), { title: 'NEXO', body: 'Ana espera un asesor', href: '/dashboard/handoffs' });
  assert.equal(notice({ title: ' NEXO\u202e ', body: 'Pagó\u0007 Ana' }).title, 'NEXO');
  assert.equal(notice({ title: 'NEXO', body: 'Pagó\u0007 Ana' }).body, 'Pagó Ana');
  for (const bad of [null, [], 'texto', { title: '', body: 'x' }, { title: 'x', body: '' }, { title: 'x'.repeat(81), body: 'x' }, { title: 'x', body: 'x'.repeat(241) },
    { title: 'x', body: 'x', href: 'https://evil.test' }, { title: 'x', body: 'x', href: '/dashboard/orders?next=evil' }, { title: 'x', body: 'x', icon: 'file:///etc/passwd' }])
    assert.throws(() => notice(bad), /no válido|permitido/);
});
test('macOS asks for microphone consent once, only when undetermined', async () => {
  let requests = 0;
  const preferences = { getMediaAccessStatus: type => { assert.equal(type, 'microphone'); return 'not-determined'; }, askForMediaAccess: async type => { assert.equal(type, 'microphone'); requests++; return true; } };
  assert.equal(await microphoneConsent('darwin', preferences), true);
  assert.equal(requests, 1);
  preferences.getMediaAccessStatus = () => 'granted';
  assert.equal(await microphoneConsent('darwin', preferences), true);
  assert.equal(requests, 1);
});
test('macOS respects denied, restricted, unknown and rejected consent', async () => {
  for (const status of ['denied', 'restricted', 'unknown']) {
    assert.equal(await microphoneConsent('darwin', { getMediaAccessStatus: () => status, askForMediaAccess: () => assert.fail('Must not prompt again') }), false);
  }
  assert.equal(await microphoneConsent('darwin', { getMediaAccessStatus: () => 'not-determined', askForMediaAccess: async () => false }), false);
});
test('Windows does not invoke macOS permission APIs', async () => {
  assert.equal(await microphoneConsent('win32', undefined), true);
});
test('CRM routes reject external URLs, traversal and arbitrary paths', () => {
  assert.equal(panelUrl('/dashboard/orders'), APP_ORIGIN + '/dashboard/orders');
  for (const value of ['https://evil.test', '//evil.test', '/dashboard/../admin', '/dashboard/orders?next=evil', '/admin', null]) assert.throws(() => panelUrl(value));
  assert.equal(trustedUrl(APP_ORIGIN + '/login'), true);
  for (const value of ['http://chatbot-ai-gold-two.vercel.app', APP_ORIGIN + '.evil.test', 'https://user@chatbot-ai-gold-two.vercel.app', 'file:///tmp']) assert.equal(trustedUrl(value), false);
});
test('operator opens WhatsApp and UUID records only in supported CRM panels', () => {
  assert.equal(panelUrl('/dashboard/whatsapp'), APP_ORIGIN + '/dashboard/whatsapp');
  const id = '11111111-2222-4333-8444-555555555555';
  for (const panel of ['orders', 'conversations', 'handoffs']) {
    const path = `/dashboard/${panel}/${id}`;
    assert.equal(panelUrl(path), APP_ORIGIN + path);
    for (const bad of [path + '/delete', path + '?next=https://evil.test', path + '#x', path.replace(id, '%2e%2e'), path.replace(id, 'not-a-uuid')])
      assert.throws(() => panelUrl(bad));
  }
  for (const bad of [`/dashboard/agent/${id}`, `/dashboard/billing/${id}`, `/dashboard/orders//${id}`, `/dashboard/orders/../${id}`, `/dashboard/orders/${id}\n`, `/dashboard/orders/${id}%2f`])
    assert.throws(() => panelUrl(bad));
});
test('preferences admit only plain hex colors', () => {
  assert.equal(color('#FAcC15'), '#facc15');
  for (const value of ['red', '#fff', '#ffffff;background:url(evil)', null]) assert.throws(() => color(value));
});

test('memory and task workspace opens only as an exact CRM panel', () => {
  assert.equal(panelUrl('/dashboard/workspace'), APP_ORIGIN + '/dashboard/workspace');
  for (const bad of ['/dashboard/workspace/delete', '/dashboard/workspace?next=https://evil.test', '/dashboard/workspace#x', '/dashboard/workspace/../agent', '/dashboard/%77orkspace', '/dashboard/workspace\n']) assert.throws(() => panelUrl(bad));
});
test('Google requires trusted Supabase, PKCE, provider and exact desktop callback', () => {
  const url = new URL('https://hdrjzcxlhpzpayhrjafk.supabase.co/auth/v1/authorize');
  url.searchParams.set('provider', 'google'); url.searchParams.set('redirect_to', APP_ORIGIN + '/auth/callback?desktop=1');
  url.searchParams.set('code_challenge_method', 's256'); url.searchParams.set('code_challenge', 'a'.repeat(43));
  assert.equal(googleUrl(url.href), url.href);
  for (const [key, value] of [['provider', 'github'], ['redirect_to', 'https://evil.test/auth/callback?desktop=1'], ['code_challenge_method', 'plain'], ['code_challenge', 'short']]) {
    const bad = new URL(url); bad.searchParams.set(key, value); assert.throws(() => googleUrl(bad.href));
  }
});
test('desktop login accepts a one-time code only while login is pending', () => {
  const link = 'nexo-desktop://auth?code=12345678-abcd-abcd-abcd-123456789012';
  assert.match(callbackUrl(link, 200, 100), /^https:\/\/chatbot-ai-gold-two.vercel.app\/auth\/callback\?code=/);
  assert.equal(callbackUrl(link, 100, 100), null);
  for (const bad of [link + '&next=https://evil.test', link + '&code=duplicate', link.replace('auth?', 'other?'), 'nexo-desktop://auth?code=%3Cscript%3E', link + '#evil']) assert.equal(callbackUrl(bad, 200, 100), null);
});
test('watched files: supported types up to 3 MB, never temp, hidden or lock files; preferences and tokens are strict', () => {
  const { watchPreference, clipboardText, clipboardImage, watchedFile, fileToken } = require('../policy.cjs');
  assert.deepEqual(watchedFile('Lista.XLSX', 10), { name: 'Lista.XLSX', extension: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  assert.equal(watchedFile('foto.JPG', 3 * 1024 * 1024).mime, 'image/jpeg');
  for (const [name, size] of [['.oculto.pdf', 10], ['~$doc.docx', 10], ['a.crdownload', 10], ['a.part', 10], ['a.exe', 10], ['sin-extension', 10], ['a.pdf', 0], ['a.pdf', 3 * 1024 * 1024 + 1],
    ['..\\x.pdf', 10], ['a/b.pdf', 10], [' a.pdf', 10], ['a.pdf\n', 10], ['x'.repeat(170) + '.pdf', 10], [null, 10], ['a.pdf', '10']]) assert.equal(watchedFile(name, size), null, String(name));
  assert.deepEqual(watchPreference({ enabled: true, action: 'catalog_update' }), { enabled: true, action: 'catalog_update' });
  for (const bad of [null, {}, [], { enabled: 'yes', action: 'ask' }, { enabled: true, action: 'rm' }, { enabled: true, action: 'ask', path: '/' }]) assert.throws(() => watchPreference(bad), /no válida/);
  assert.equal(clipboardText(' hola‮ mundo '), 'hola mundo');
  assert.equal(clipboardText('x'.repeat(9000)).length, 8000);
  assert.equal(clipboardText('   '), null); assert.equal(clipboardText(5), null); assert.equal(clipboardText(undefined), null);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
  assert.equal(clipboardImage(png), png);
  assert.equal(clipboardImage(Buffer.from('GIF89a..')), null); assert.equal(clipboardImage(Buffer.alloc(3 * 1024 * 1024 + 1)), null); assert.equal(clipboardImage(null), null);
  assert.equal(fileToken('a'.repeat(32)), 'a'.repeat(32));
  for (const bad of ['A'.repeat(32), 'a'.repeat(31), '../x', null, 7]) assert.throws(() => fileToken(bad), /no disponible/);
});
