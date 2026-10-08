const { test } = require('node:test');
const assert = require('node:assert/strict');
const { APP_ORIGIN, trustedUrl, panelUrl, color, googleUrl, callbackUrl } = require('../policy.cjs');
test('CRM routes reject external URLs, traversal and arbitrary paths', () => {
  assert.equal(panelUrl('/dashboard/orders'), APP_ORIGIN + '/dashboard/orders');
  for (const value of ['https://evil.test', '//evil.test', '/dashboard/../admin', '/dashboard/orders?next=evil', '/admin', null]) assert.throws(() => panelUrl(value));
  assert.equal(trustedUrl(APP_ORIGIN + '/login'), true);
  for (const value of ['http://chatbot-ai-gold-two.vercel.app', APP_ORIGIN + '.evil.test', 'https://user@chatbot-ai-gold-two.vercel.app', 'file:///tmp']) assert.equal(trustedUrl(value), false);
});
test('preferences admit only plain hex colors', () => {
  assert.equal(color('#FAcC15'), '#facc15');
  for (const value of ['red', '#fff', '#ffffff;background:url(evil)', null]) assert.throws(() => color(value));
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
