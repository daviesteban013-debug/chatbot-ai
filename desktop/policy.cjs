const APP_ORIGIN = 'https://chatbot-ai-gold-two.vercel.app';
const AUTH_ORIGIN = 'https://hdrjzcxlhpzpayhrjafk.supabase.co';
const PANELS = new Set(['/dashboard', '/dashboard/orders', '/dashboard/catalog', '/dashboard/conversations', '/dashboard/handoffs', '/dashboard/approval', '/dashboard/agent', '/dashboard/billing', '/dashboard/jarvis', '/dashboard/whatsapp', '/dashboard/workspace', '/dashboard/jobs']);
const DETAIL_PANEL = /^\/dashboard\/(?:orders|conversations|handoffs|jobs)\/[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
function trustedUrl(value) {
  try { const url = new URL(value); return url.origin === APP_ORIGIN && !url.username && !url.password; } catch { return false; }
}
function panelUrl(value) {
  if (typeof value !== 'string' || (!PANELS.has(value) && !(DETAIL_PANEL.test(value) && value === value.trim()))) throw new Error('Panel no permitido');
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
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g;
/** A proactive alert from the orb: short plain text and, optionally, a CRM panel to open on click. */
function notice(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['title', 'body', 'href'].includes(key))) throw new Error('Aviso no válido');
  const clean = text => typeof text === 'string' ? text.replace(CONTROL, '').trim() : '';
  const title = clean(value.title), body = clean(value.body);
  if (!title || title.length > 80 || !body || body.length > 240) throw new Error('Aviso no válido');
  if (value.href !== undefined) panelUrl(value.href);
  return { title, body, href: value.href };
}
/** NEXO 0.2.5: files the person hands to NEXO from this computer (dropped in Descargas/NEXO or copied). */
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', txt: 'text/plain', md: 'text/markdown' };
const WATCH_ACTIONS = new Set(['ask', 'catalog_import', 'catalog_update']);
function watchPreference(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['enabled', 'action'].includes(key))
    || typeof value.enabled !== 'boolean' || !WATCH_ACTIONS.has(value.action)) throw new Error('Preferencia no válida');
  return { enabled: value.enabled, action: value.action };
}
/** Copied text: control characters removed, at most 8 000 characters; null when there is nothing usable. */
function clipboardText(value) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').trim();
  return text ? text.slice(0, 8000) : null;
}
/** A copied image is accepted only as a real PNG of at most 3 MB. */
function clipboardImage(buffer) {
  if (!buffer || typeof buffer.length !== 'number' || buffer.length < 8 || buffer.length > MAX_FILE_BYTES) return null;
  return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => buffer[index] === byte) ? buffer : null;
}
/** A file that appeared in the watched folder: supported type, 1 byte to 3 MB, never a temp, hidden or lock file. */
function watchedFile(name, size) {
  if (typeof name !== 'string' || !name || name.length > 160 || name !== name.trim() || /[\u0000-\u001f\u007f\\/]/.test(name)
    || name.startsWith('.') || name.startsWith('~$') || /\.(crdownload|part|tmp|download|partial)$/i.test(name)) return null;
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  if (!MIME[extension] || !Number.isSafeInteger(size) || size < 1 || size > MAX_FILE_BYTES) return null;
  return { name, extension, mime: MIME[extension] };
}
function fileToken(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{32}$/.test(value)) throw new Error('Archivo no disponible');
  return value;
}
async function microphoneConsent(platform, systemPreferences) {
  if (platform !== 'darwin') return true;
  const status = systemPreferences.getMediaAccessStatus('microphone');
  if (status === 'granted') return true;
  if (status !== 'not-determined') return false;
  return systemPreferences.askForMediaAccess('microphone');
}
module.exports = { APP_ORIGIN, MAX_FILE_BYTES, trustedUrl, panelUrl, color, googleUrl, callbackUrl, microphoneConsent, notice, watchPreference, clipboardText, clipboardImage, watchedFile, fileToken };
