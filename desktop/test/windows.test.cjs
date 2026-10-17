const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { EventEmitter } = require('node:events');
const vm = require('node:vm');
const path = require('node:path');
const policy = require('../policy.cjs');
const source = readFileSync(path.join(__dirname, '../main.cjs'), 'utf8');
const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };

async function launch({ authenticated = true, selfTest = false } = {}) {
  const windows = [], handlers = new Map(), shortcuts = new Map();
  const state = { authenticated, quit: 0, external: [], notifications: [], area: { x: 0, y: 0, width: 1440, height: 900 },
    timers: [], watchers: [], dirs: new Set(), files: new Map(), stats: new Map(), realpaths: new Map(), opened: [], clipboardText: '', clipboardImage: null, written: null };
  state.runTimers = () => { for (const timer of state.timers.splice(0)) if (!timer.cleared) timer.fn(); };
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.bounds = { x: 0, y: 0, ...options }; this.visible = false; this.loads = [];
      this.webContents = new EventEmitter(); this.webContents.mainFrame = { url: '' };
      this.webContents.getURL = () => this.webContents.mainFrame.url;
      this.webContents.setWindowOpenHandler = callback => { this.openHandler = callback; };
      this.webContents.getLastWebPreferences = () => options.webPreferences;
      this.sent = [];
      this.webContents.send = (channel, payload) => { this.sent.push({ channel, payload }); };
      windows.push(this);
    }
    async loadURL(url) {
      this.loads.push(url);
      await Promise.resolve();
      let destination = url;
      if (url.includes('/dashboard') && !state.authenticated) destination = policy.APP_ORIGIN + '/login';
      this.webContents.mainFrame.url = destination;
      this.webContents.emit('did-navigate', {}, destination);
      this.webContents.emit('did-finish-load');
    }
    getBounds() { return this.bounds; }
    setBounds(bounds) { this.bounds = bounds; }
    maximize() { this.maximized = true; }
    isMinimized() { return this.minimized ?? false; }
    restore() { this.minimized = false; this.restored = true; }
    show() { this.visible = true; }
    showInactive() { this.visible = true; this.inactive = true; }
    hide() { this.visible = false; }
    focus() { this.focused = true; }
    isDestroyed() { return false; }
    isAlwaysOnTop() { return this.options.alwaysOnTop; }
    setVisibleOnAllWorkspaces() { this.allWorkspaces = true; }
    isVisibleOnAllWorkspaces() { return this.allWorkspaces ?? false; }
  }
  const app = Object.assign(new EventEmitter(), {
    requestSingleInstanceLock: () => true, whenReady: () => Promise.resolve(), getPath: name => name === 'downloads' ? '/test/downloads' : '/test/preferences',
    setAsDefaultProtocolClient() {}, getVersion: () => '0.2.3', quit() { state.quit++; }, exit() {},
  });
  const shared = { setPermissionCheckHandler(fn) { this.check = fn; }, setPermissionRequestHandler(fn) { this.request = fn; }, setDisplayMediaRequestHandler(fn) { this.display = fn; } };
  const electron = { app, BrowserWindow: Window, ipcMain: { handle: (name, callback) => handlers.set(name, callback) },
    session: { fromPartition: () => shared }, screen: { getPrimaryDisplay: () => ({ workArea: state.area }), getDisplayMatching: () => ({ workArea: state.area }) },
    globalShortcut: { register: (key, fn) => shortcuts.set(key, fn), unregisterAll() {} }, shell: { openExternal: async url => state.external.push(url), openPath: async target => state.opened.push(target) },
    clipboard: { readImage: () => ({ isEmpty: () => !state.clipboardImage, toPNG: () => state.clipboardImage }), readText: () => state.clipboardText },
    Tray: class extends EventEmitter { setToolTip() {} setContextMenu(menu) { state.menu = menu; } }, Menu: { buildFromTemplate: items => items },
    nativeImage: { createFromPath: () => ({ resize: () => ({}) }) }, systemPreferences: {},
    Notification: class extends EventEmitter { static isSupported() { return true; } constructor(options) { super(); this.options = options; state.notifications.push(this); } show() { this.shown = true; } },
  };
  const fsStub = {
    readFileSync(file) {
      if (String(file).endsWith('preferences.json')) throw new Error('First start');
      const content = state.files.get(String(file)); if (content === undefined) throw new Error('ENOENT'); return Buffer.from(content);
    },
    writeFileSync(_file, data) { state.written = String(data); }, renameSync() {},
    mkdirSync(dir) { state.dirs.add(String(dir)); },
    watch(dir, _options, callback) { const watcher = { dir: String(dir), callback, closed: false, close() { this.closed = true; }, on() {} }; state.watchers.push(watcher); return watcher; },
    statSync(file) { const entry = state.stats.get(String(file)); if (!entry) throw new Error('ENOENT'); return { isFile: () => entry.file !== false, size: entry.size, mtimeMs: entry.mtime ?? 1 }; },
    lstatSync(file) { return fsStub.statSync(file); },
    realpathSync(target) { return state.realpaths.get(String(target)) ?? String(target); },
  };
  vm.runInNewContext(source, { require: name => name === 'electron' ? electron : name === './policy.cjs' ? policy : name === './updater.cjs' ? require('../updater.cjs') : name === './watch.cjs' ? require('../watch.cjs') : name === './mac-install.cjs' ? require('../mac-install.cjs') : name === 'node:fs' ? fsStub : require(name),
    __dirname: path.dirname(path.join(__dirname, '../main.cjs')), process: { argv: ['electron', 'app', ...(selfTest ? ['--startup-check'] : [])], platform: 'win32', arch: 'x64', execPath: '/electron' },
    URL, Buffer, console: { log() {}, error() {} },
    setTimeout: (fn, ms) => { const timer = { fn, ms, cleared: false, unref() {} }; state.timers.push(timer); return timer; }, clearTimeout: timer => { if (timer) timer.cleared = true; },
    setInterval: () => ({ unref() {} }), clearInterval() {},
  });
  await settle();
  const bubble = windows.find(win => win.options.transparent), crm = windows.find(win => !win.options.transparent);
  const event = window => ({ sender: window.webContents, senderFrame: window.webContents.mainFrame });
  return { state, windows, bubble, crm, handlers, shortcuts, app, shared, event };
}

test('launch opens the maximized CRM, a compact orb and isolated shared-session renderers', async () => {
  const { crm, bubble } = await launch();
  assert.equal(crm.maximized, true); assert.equal(crm.visible, true);
  assert.equal(crm.webContents.getURL(), policy.panelUrl('/dashboard'));
  assert.equal(bubble.options.show, false); assert.equal(bubble.visible, true); assert.equal(bubble.inactive, true);
  assert.equal(bubble.bounds.width, 112); assert.equal(bubble.bounds.height, 148);
  for (const win of [crm, bubble]) { assert.equal(win.options.webPreferences.sandbox, true); assert.equal(win.options.webPreferences.nodeIntegration, false); assert.equal(win.options.webPreferences.contextIsolation, true); }
  assert.equal(crm.options.webPreferences.partition, bubble.options.webPreferences.partition);
  assert.deepEqual(Array.from(crm.options.webPreferences.additionalArguments), ['--nexo-surface=crm']);
});

test('signed-out launch shows full-size login; password login lands in CRM and then loads orb', async () => {
  const { state, crm, bubble } = await launch({ authenticated: false });
  assert.equal(crm.webContents.getURL(), policy.APP_ORIGIN + '/login'); assert.equal(bubble.visible, false);
  state.authenticated = true;
  await crm.loadURL(policy.panelUrl('/dashboard/jarvis')); await settle();
  assert.equal(crm.webContents.getURL(), policy.panelUrl('/dashboard'));
  assert.equal(bubble.webContents.getURL(), policy.panelUrl('/dashboard/jarvis')); assert.equal(bubble.visible, true);
});

test('logout unloads the voice renderer and hides the orb', async () => {
  const { state, crm, bubble } = await launch(); state.authenticated = false;
  await crm.loadURL(policy.APP_ORIGIN + '/login'); await settle();
  assert.equal(bubble.webContents.getURL(), policy.APP_ORIGIN + '/login'); assert.equal(bubble.visible, false);
});

test('reopening the app preserves the current CRM panel and restores a minimized window', async () => {
  const { crm, app } = await launch(); await crm.loadURL(policy.panelUrl('/dashboard/orders'));
  const count = crm.loads.length; crm.minimized = true;
  app.emit('second-instance', {}, ['electron', 'app']); await settle();
  assert.equal(crm.loads.length, count); assert.equal(crm.restored, true); assert.equal(crm.webContents.getURL(), policy.panelUrl('/dashboard/orders'));
});

test('operator IPC opens verified record routes and WhatsApp in the existing CRM without reloading NEXO', async () => {
  const { crm, bubble, handlers, event, windows } = await launch();
  const bubbleLoads = bubble.loads.length;
  const id = '11111111-2222-4333-8444-555555555555';
  for (const route of ['/dashboard/whatsapp', '/dashboard/workspace', '/dashboard/agent', ...['orders', 'conversations', 'handoffs'].map(panel => `/dashboard/${panel}/${id}`)]) {
    handlers.get('nexo:panel')(event(bubble), route);
    await settle();
    assert.equal(crm.webContents.getURL(), policy.APP_ORIGIN + route);
    assert.equal(crm.focused, true);
    assert.equal(windows.length, 2);
    assert.equal(bubble.loads.length, bubbleLoads);
  }
  const count = crm.loads.length;
  assert.throws(() => handlers.get('nexo:panel')(event(bubble), `/dashboard/orders/${id}?next=https://evil.test`), /permitido/);
  assert.equal(crm.loads.length, count);
});

test('CRM can open the assistant but only its trusted main frame; color remains bubble-only', async () => {
  const { handlers, crm, bubble, event } = await launch();
  handlers.get('nexo:expanded')(event(crm), true);
  assert.equal(bubble.bounds.width, 368); assert.equal(bubble.bounds.height, 560);
  assert.throws(() => handlers.get('nexo:color')(event(crm), '#ffffff'), /permitida/);
  assert.throws(() => handlers.get('nexo:expanded')({ sender: crm.webContents, senderFrame: { url: policy.APP_ORIGIN } }, true), /permitida/);
  assert.throws(() => handlers.get('nexo:panel')(event(bubble), 'https://evil.test'), /permitido/);
});

test('expansion stays inside a secondary monitor and keeps the right edge anchored', async () => {
  const { handlers, bubble, state, event } = await launch();
  state.area = { x: -1280, y: 0, width: 1280, height: 500 }; bubble.bounds = { x: -122, y: 330, width: 112, height: 148 };
  handlers.get('nexo:expanded')(event(bubble), true);
  assert.equal(bubble.bounds.x, -378); assert.equal(bubble.bounds.y, 0); assert.equal(bubble.bounds.height, 500);
  handlers.get('nexo:expanded')(event(bubble), false);
  assert.equal(bubble.bounds.x, -122); assert.equal(bubble.bounds.width, 112);
  assert.equal(bubble.bounds.y, 352);
});

test('expanding and collapsing returns the orb to the same corner', async () => {
  const { handlers, bubble, event } = await launch();
  const before = { ...bubble.bounds };
  handlers.get('nexo:expanded')(event(bubble), true);
  handlers.get('nexo:expanded')(event(bubble), false);
  assert.equal(bubble.bounds.x, before.x); assert.equal(bubble.bounds.y, before.y);
});

test('Google starts in CRM and exchanges the callback there once, with CRM as destination', async () => {
  const { handlers, crm, app, state, event } = await launch({ authenticated: false });
  const url = new URL('https://hdrjzcxlhpzpayhrjafk.supabase.co/auth/v1/authorize');
  url.searchParams.set('provider', 'google'); url.searchParams.set('redirect_to', policy.APP_ORIGIN + '/auth/callback?desktop=1');
  url.searchParams.set('code_challenge_method', 's256'); url.searchParams.set('code_challenge', 'a'.repeat(43));
  await handlers.get('nexo:google')(event(crm), url.href);
  assert.equal(state.external.length, 1);
  app.emit('second-instance', {}, ['nexo-desktop://auth?code=12345678-abcd-abcd-abcd-123456789012']); await settle();
  const callback = new URL(crm.webContents.getURL()); assert.equal(callback.pathname, '/auth/callback'); assert.equal(callback.searchParams.get('next'), '/dashboard');
  const count = crm.loads.length;
  app.emit('second-instance', {}, ['nexo-desktop://auth?code=12345678-abcd-abcd-abcd-123456789012']); await settle();
  assert.equal(crm.loads.length, count);
});

test('only the orb can request audio; CRM, camera, frames and external origins are denied', async () => {
  const { shared, crm, bubble } = await launch();
  assert.equal(shared.check(bubble.webContents, 'media', policy.APP_ORIGIN, { mediaType: 'audio' }), true);
  for (const [contents, origin, type] of [[crm.webContents, policy.APP_ORIGIN, 'audio'], [bubble.webContents, 'https://evil.test', 'audio'], [bubble.webContents, policy.APP_ORIGIN, 'video']]) assert.equal(shared.check(contents, 'media', origin, { mediaType: type }), false);
  let granted;
  shared.request(bubble.webContents, 'media', value => { granted = value; }, { isMainFrame: false, requestingUrl: policy.APP_ORIGIN, mediaTypes: ['audio'] });
  assert.equal(granted, false);
});

test('startup check remains hidden and never opens CRM or requests microphone', async () => {
  const { windows, bubble } = await launch({ selfTest: true });
  assert.equal(windows.length, 1); assert.equal(bubble.visible, false); assert.equal(bubble.webContents.getURL(), policy.APP_ORIGIN + '/login');
});

test('update IPC accepts only the CRM or orb main frame at the trusted origin', async () => {
  const { handlers, crm, bubble, event } = await launch();
  for (const channel of ['state', 'check', 'download', 'install']) {
    const handle = handlers.get(`nexo:update-${channel}`);
    assert.equal((await handle(event(crm))).mode, 'development');
    assert.equal((await handle(event(bubble))).mode, 'development');
    assert.throws(() => handle({ sender: crm.webContents, senderFrame: { url: policy.APP_ORIGIN } }), /permitida/);
    assert.throws(() => handle({ sender: { mainFrame: {} }, senderFrame: {} }), /permitida/);
  }
});

test('only the orb sends proactive alerts: validated, rate limited, and a click opens the CRM panel', async () => {
  const { state, bubble, crm, handlers, event } = await launch();
  const notify = handlers.get('nexo:notify');
  assert.throws(() => notify(event(crm), { title: 'NEXO', body: 'x' }), /permitida/);
  assert.throws(() => notify(event(bubble), { title: 'NEXO', body: 'x', href: 'https://evil.test' }), /permitido/);
  const id = '11111111-2222-4333-8444-555555555555';
  assert.equal(notify(event(bubble), { title: 'NEXO', body: 'Ana espera un asesor', href: `/dashboard/handoffs/${id}` }), true);
  assert.equal(state.notifications[0].shown, true);
  state.notifications[0].emit('click'); await settle();
  assert.equal(crm.webContents.getURL(), policy.panelUrl(`/dashboard/handoffs/${id}`));
  for (let i = 0; i < 5; i++) notify(event(bubble), { title: 'NEXO', body: `Aviso ${i}` });
  assert.equal(notify(event(bubble), { title: 'NEXO', body: 'Uno de más' }), false, 'at most six per minute');
  assert.equal(state.notifications.length, 6);
});

const watchRoot = path.join('/test/downloads', 'NEXO');
// Values cross the vm boundary: compare their shape, not their realm.
const plain = value => JSON.parse(JSON.stringify(value));
const readyFiles = window => window.sent.filter(message => message.channel === 'nexo:file-ready');

test('the watched folder is opt-in from the orb, persisted, and watches its three folders only while enabled', async () => {
  const { handlers, bubble, crm, event, state } = await launch();
  assert.deepEqual(plain(handlers.get('nexo:watch')(event(bubble))), { enabled: false, action: 'ask' });
  assert.throws(() => handlers.get('nexo:watch')(event(crm)), /permitida/);
  assert.throws(() => handlers.get('nexo:watch-set')(event(bubble), { enabled: true, action: 'delete' }), /no válida/);
  assert.equal(state.watchers.length, 0, 'nothing is watched until the person turns it on');
  assert.deepEqual(plain(handlers.get('nexo:watch-set')(event(bubble), { enabled: true, action: 'catalog_import' })), { enabled: true, action: 'catalog_import' });
  assert.deepEqual(state.watchers.map(w => w.dir), [watchRoot, path.join(watchRoot, 'catalogo'), path.join(watchRoot, 'stock')]);
  assert.ok(state.dirs.has(path.join(watchRoot, 'stock')));
  assert.match(state.written, /"watch":\{"enabled":true,"action":"catalog_import"\}/);
  await handlers.get('nexo:watch-open')(event(bubble));
  assert.deepEqual(state.opened, [watchRoot]);
  handlers.get('nexo:watch-set')(event(bubble), { enabled: false, action: 'ask' });
  assert.ok(state.watchers.every(w => w.closed));
});

test('a finished file in the folder reaches the orb once, under a one-time token, and the orb expands to show it', async () => {
  const { handlers, bubble, event, state } = await launch();
  handlers.get('nexo:watch-set')(event(bubble), { enabled: true, action: 'ask' });
  const file = path.join(watchRoot, 'catalogo', 'lista.xlsx');
  state.stats.set(file, { size: 100 }); state.files.set(file, 'hoja');
  const watcher = state.watchers.find(w => w.dir === path.join(watchRoot, 'catalogo'));
  watcher.callback('rename', 'lista.xlsx'); state.runTimers();
  assert.equal(readyFiles(bubble).length, 0, 'waits until the size holds still');
  state.runTimers();
  assert.equal(readyFiles(bubble).length, 1);
  const ready = readyFiles(bubble)[0];
  assert.equal(ready.channel, 'nexo:file-ready'); assert.match(ready.payload.token, /^[0-9a-f]{32}$/);
  assert.deepEqual([ready.payload.name, ready.payload.folder, ready.payload.size], ['lista.xlsx', 'catalogo', 100]);
  assert.equal(bubble.bounds.width, 368); assert.equal(bubble.visible, true);
  const read = handlers.get('nexo:file-read')(event(bubble), ready.payload.token);
  assert.deepEqual(plain(read), { name: 'lista.xlsx', folder: 'catalogo', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', base64: Buffer.from('hoja').toString('base64') });
  assert.throws(() => handlers.get('nexo:file-read')(event(bubble), ready.payload.token), /no disponible/, 'one read per token');
  assert.throws(() => handlers.get('nexo:file-read')(event(bubble), 'zz'), /no disponible/);
  watcher.callback('change', 'lista.xlsx'); state.runTimers(); state.runTimers();
  assert.equal(readyFiles(bubble).length, 1, 'the same file is not announced twice');
  state.stats.set(path.join(watchRoot, 'catalogo', 'grande.pdf'), { size: 4 * 1024 * 1024 });
  watcher.callback('rename', 'grande.pdf'); watcher.callback('rename', 'lista.xlsx.crdownload'); state.runTimers(); state.runTimers();
  assert.equal(readyFiles(bubble).length, 1, 'oversized and temporary files never arrive');
});

test('a token never reads outside the watched folder; the CRM reads neither files nor the clipboard', async () => {
  const { handlers, bubble, crm, event, state } = await launch();
  handlers.get('nexo:watch-set')(event(bubble), { enabled: true, action: 'ask' });
  const file = path.join(watchRoot, 'secreto.txt');
  state.stats.set(file, { size: 10 }); state.files.set(file, 'x'); state.realpaths.set(file, '/etc/passwd');
  state.watchers.find(w => w.dir === watchRoot).callback('rename', 'secreto.txt'); state.runTimers(); state.runTimers();
  const token = readyFiles(bubble)[0].payload.token;
  assert.throws(() => handlers.get('nexo:file-read')(event(crm), token), /permitida/);
  assert.throws(() => handlers.get('nexo:file-read')(event(bubble), token), /no disponible/, 'a link that escapes the folder is refused');
  assert.throws(() => handlers.get('nexo:clipboard')(event(crm)), /permitida/);
  assert.throws(() => handlers.get('nexo:watch-set')(event(crm), { enabled: true, action: 'ask' }), /permitida/);
});

test('the clipboard gives the orb a PNG or trimmed text, at most ten times a minute', async () => {
  const { handlers, bubble, event, state } = await launch();
  const read = () => plain(handlers.get('nexo:clipboard')(event(bubble)));
  assert.deepEqual(read(), { kind: 'empty' });
  state.clipboardText = '  hola\u0007 mundo  ';
  assert.deepEqual(read(), { kind: 'text', text: 'hola mundo' });
  state.clipboardImage = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  assert.deepEqual(read(), { kind: 'image', png: state.clipboardImage.toString('base64') });
  state.clipboardImage = Buffer.from('GIF89a not png');
  assert.deepEqual(read(), { kind: 'text', text: 'hola mundo' }, 'a non-PNG image falls back to the text');
  for (let i = 0; i < 6; i++) read();
  assert.throws(read, /Demasiadas/);
});
