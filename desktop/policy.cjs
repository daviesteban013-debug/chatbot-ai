const APP_ORIGIN = 'https://chatbot-ai-gold-two.vercel.app';
const AUTH_ORIGIN = 'https://hdrjzcxlhpzpayhrjafk.supabase.co';
const PANELS = new Set(['/dashboard', '/dashboard/orders', '/dashboard/catalog', '/dashboard/conversations', '/dashboard/handoffs', '/dashboard/approval', '/dashboard/agent', '/dashboard/billing', '/dashboard/jarvis']);
function trustedUrl(value) {
  try { const url = new URL(value); return url.origin === APP_ORIGIN && !url.username && !url.password; } catch { return false; }
}
function panelUrl(value) {
  if (typeof value !== 'string' || !PANELS.has(value)) throw new Error('Panel no permitido');
  return APP_ORIGIN + value;
}
function color(value) {
  if (typeof value !== 'string' || !/^#[a-f\d]{6}$/i.test(value)) throw new Error('Color no válido');
  return value.toLowerCase();
}
function googleUrl(value) {
  try {
    const url = new URL(value);
    const allowed = new Set(['provider', 'redirect_to', 'code_challenge', 'code_challenge_method', 'skip_http_redirect']);
    if ([...url.searchParams.keys()].some(key => !allowed.has(key) || url.searchParams.getAll(key).length !== 1)) throw new Error();
    const redirect = new URL(url.searchParams.get('redirect_to'));
    if (url.origin !== AUTH_ORIGIN || url.pathname !== '/auth/v1/authorize' || url.username || url.password || url.searchParams.get('provider') !== 'google' ||
      !trustedUrl(redirect.href) || redirect.pathname !== '/auth/callback' || redirect.searchParams.get('desktop') !== '1' ||
      url.searchParams.get('code_challenge_method') !== 's256' || !/^[\w-]{43,128}$/.test(url.searchParams.get('code_challenge') || '')) throw new Error();
    return url.href;
  } catch { throw new Error('Inicio de sesión no permitido'); }
}
function callbackUrl(value, pendingUntil, now = Date.now()) {
  if (now >= pendingUntil) return null;
  try {
    const url = new URL(value);
    const code = url.searchParams.get('code');
    if (url.protocol !== 'nexo-desktop:' || url.hostname !== 'auth' || url.username || url.password || url.port || url.hash || !['', '/'].includes(url.pathname) ||
      [...url.searchParams.keys()].some(key => key !== 'code') || url.searchParams.getAll('code').length !== 1 || !/^[\w-]{16,256}$/.test(code || '')) return null;
    const destination = new URL('/auth/callback', APP_ORIGIN);
    destination.searchParams.set('code', code);
    destination.searchParams.set('next', '/dashboard');
    return destination.href;
  } catch { return null; }
}
async function microphoneConsent(platform, systemPreferences) {
  if (platform !== 'darwin') return true;
  const status = systemPreferences.getMediaAccessStatus('microphone');
  if (status === 'granted') return true;
  if (status !== 'not-determined') return false;
  return systemPreferences.askForMediaAccess('microphone');
}
module.exports = { APP_ORIGIN, trustedUrl, panelUrl, color, googleUrl, callbackUrl, microphoneConsent };
