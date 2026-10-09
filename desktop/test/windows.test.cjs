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
  const state = { authenticated, quit: 0, external: [], area: { x: 0, y: 0, width: 1440, height: 900 } };
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.bounds = { x: 0, y: 0, ...options }; this.visible = false; this.loads = [];
      this.webContents = new EventEmitter(); this.webContents.mainFrame = { url: '' };
      this.webContents.getURL = () => this.webContents.mainFrame.url;
      this.webContents.setWindowOpenHandler = callback => { this.openHandler = callback; };
      this.webContents.getLastWebPreferences = () => options.webPreferences;
      this.webContents.send = () => {};
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
    requestSingleInstanceLock: () => true, whenReady: () => Promise.resolve(), getPath: () => '/test/preferences',
    setAsDefaultProtocolClient() {}, quit() { state.quit++; }, exit() {},
  });
  const shared = { setPermissionCheckHandler(fn) { this.check = fn; }, setPermissionRequestHandler(fn) { this.request = fn; }, setDisplayMediaRequestHandler(fn) { this.display = fn; } };
  const electron = { app, BrowserWindow: Window, ipcMain: { handle: (name, callback) => handlers.set(name, callback) },
    session: { fromPartition: () => shared }, screen: { getPrimaryDisplay: () => ({ workArea: state.area }), getDisplayMatching: () => ({ workArea: state.area }) },
    globalShortcut: { register: (key, fn) => shortcuts.set(key, fn), unregisterAll() {} }, shell: { openExternal: async url => state.external.push(url) },
    Tray: class extends EventEmitter { setToolTip() {} setContextMenu(menu) { state.menu = menu; } }, Menu: { buildFromTemplate: items => items },
    nativeImage: { createFromPath: () => ({ resize: () => ({}) }) }, systemPreferences: {},
  };
  vm.runInNewContext(source, { require: name => name === 'electron' ? electron : name === './policy.cjs' ? policy : name === 'node:fs' ? { readFileSync() { throw new Error('First start'); }, writeFileSync() {}, renameSync() {} } : require(name),
    __dirname: path.dirname(path.join(__dirname, '../main.cjs')), process: { argv: ['electron', 'app', ...(selfTest ? ['--startup-check'] : [])], platform: 'win32', arch: 'x64', execPath: '/electron' },
    URL, console: { log() {}, error() {} }, setTimeout: () => ({ unref() {} }),
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
