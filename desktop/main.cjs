const { app, BrowserWindow, ipcMain, session, screen, globalShortcut, shell, Tray, Menu, nativeImage, systemPreferences, Notification, dialog, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const policy = require('./policy.cjs');
const { createUpdates, REPO } = require('./updater.cjs');
const { createWatcher } = require('./watch.cjs');
let bubble, crm, tray, pendingLoginUntil = 0, awaitingLogin = false, bubbleLoading = false;
let preferences = { color: '#facc15', expanded: false, watch: { enabled: false, action: 'ask' } };
// Files from the watched folder wait here under a one-time token until the orb reads them.
const pendingFiles = new Map();
const FILE_TOKEN_MS = 10 * 60_000, MAX_PENDING_FILES = 20;
let watcher, clipboardReads = [];
const partition = 'persist:nexo';
const selfTest = process.argv.includes('--startup-check');
let updates, updateTimer, updateInterval;
let notified = [];
function save() {
  const file = path.join(app.getPath('userData'), 'preferences.json');
  fs.writeFileSync(file + '.tmp', JSON.stringify(preferences));
  fs.renameSync(file + '.tmp', file);
  bubble?.webContents.send('nexo:preferences-changed', preferences);
  return preferences;
}
function expand(expanded) {
  const area = screen.getDisplayMatching(bubble.getBounds()).workArea;
  const [width, height] = expanded ? [Math.min(368, area.width), Math.min(560, area.height)] : [112, 148];
  const bounds = bubble.getBounds();
  // Anchor the bottom-right corner so collapsing returns the orb to its spot.
  bubble.setBounds({ x: Math.max(area.x, Math.min(bounds.x + bounds.width - width, area.x + area.width - width)), y: Math.max(area.y, Math.min(bounds.y + bounds.height - height, area.y + area.height - height)), width, height });
  preferences.expanded = expanded;
  return save();
}
function watchRoot() { return path.join(app.getPath('downloads'), 'Zorax'); }
// 0.2.5 watched Descargas/NEXO; the first start of this version carries that folder over, files included.
function migrateWatchRoot() {
  try { const old = path.join(app.getPath('downloads'), 'NEXO'); if (fs.existsSync(old) && !fs.existsSync(watchRoot())) fs.renameSync(old, watchRoot()); } catch { /* The old folder stays; the person can move it by hand. */ }
}
function fileArrived(file) {
  const now = Date.now();
  for (const [token, entry] of pendingFiles) if (now - entry.at > FILE_TOKEN_MS) pendingFiles.delete(token);
  while (pendingFiles.size >= MAX_PENDING_FILES) pendingFiles.delete(pendingFiles.keys().next().value);
  const token = crypto.randomBytes(16).toString('hex');
  pendingFiles.set(token, { ...file, at: now });
  if (!bubble || bubble.isDestroyed() || !dashboardUrl(bubble.webContents.getURL())) return;
  bubble.webContents.send('nexo:file-ready', { token, name: file.name, folder: file.folder, size: file.size });
  if (!preferences.expanded) expand(true);
  bubble.showInactive();
}
function syncWatcher() {
  if (selfTest) return;
  if (!preferences.watch.enabled) { watcher?.stop(); return; }
  watcher ??= createWatcher({ root: watchRoot(), fs, setTimeout, clearTimeout, onFile: fileArrived, onError: () => {} });
  watcher.start();
}
function guard(event, allowCrm = false) {
  if ((event.sender !== bubble?.webContents && !(allowCrm && event.sender === crm?.webContents)) || event.senderFrame !== event.sender.mainFrame || !policy.trustedUrl(event.senderFrame.url)) throw new Error('Solicitud no permitida');
}
function secure(window, { metaPopups = false } = {}) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (!metaPopups || !policy.metaPopupUrl(url)) return { action: 'deny' };
    // Meta's sign-in dialog (WhatsApp Embedded Signup): a plain sandboxed window on the same session, nothing else.
    return { action: 'allow', overrideBrowserWindowOptions: { width: 640, height: 780, minWidth: 420, minHeight: 560, title: 'Meta', autoHideMenuBar: true, backgroundColor: '#ffffff',
      webPreferences: { partition, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } } };
  });
  window.webContents.on('did-create-window', child => {
    child.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    child.webContents.on('will-navigate', (event, url) => { if (!policy.metaPopupNavigation(url)) event.preventDefault(); });
    child.webContents.on('will-redirect', (event, url) => { if (!policy.metaPopupNavigation(url)) event.preventDefault(); });
    child.webContents.on('will-attach-webview', event => event.preventDefault());
  });
  window.webContents.on('will-navigate', (event, url) => { if (!policy.trustedUrl(url)) event.preventDefault(); });
  window.webContents.on('will-redirect', (event, url) => { if (!policy.trustedUrl(url)) event.preventDefault(); });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
}
function dashboardUrl(url) {
  if (!policy.trustedUrl(url)) return false;
  const pathname = new URL(url).pathname;
  return pathname === '/dashboard' || pathname.startsWith('/dashboard/');
}
function loadBubble() {
  if (!bubble || bubbleLoading || dashboardUrl(bubble.webContents.getURL())) return;
  bubbleLoading = true;
  bubble.loadURL(policy.APP_ORIGIN + '/dashboard/jarvis').catch(() => {}).finally(() => { bubbleLoading = false; });
}
/** The full Zorax screen in the CRM window (the same agent as the orb, with room for everything). */
function zoraxScreen(url) {
  if (!dashboardUrl(url)) return false;
  const pathname = new URL(url).pathname;
  return pathname === '/dashboard/jarvis' || pathname.startsWith('/dashboard/jarvis/');
}
/** One agent at a time: while the Zorax screen is open the orb hides and unloads, which releases its microphone and voice. */
function parkBubble() {
  if (!bubble || bubble.isDestroyed()) return;
  bubble.hide();
  if (bubble.webContents.getURL() !== 'about:blank') bubble.loadURL('about:blank').catch(() => {});
}
function openZorax() { openPanel('/dashboard/jarvis'); }
/** Microphone: the orb, or the CRM window only while it shows the Zorax screen. */
function voiceSurface(contents) {
  return Boolean(contents) && (contents === bubble?.webContents || (contents === crm?.webContents && zoraxScreen(contents.getURL())));
}
function openPanel(route) {
  const url = policy.panelUrl(route ?? '/dashboard');
  if (!crm || crm.isDestroyed()) {
    crm = new BrowserWindow({ width: 1440, height: 960, minWidth: 800, minHeight: 600, title: 'Zorax · CRM', backgroundColor: '#0b0b0c', autoHideMenuBar: true, show: false,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), additionalArguments: ['--nexo-surface=crm'], partition, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
    secure(crm, { metaPopups: true });
    crm.on('closed', () => { crm = null; app.quit(); });
    const navigated = (_event, destination) => {
      if (!policy.trustedUrl(destination)) return;
      if (!dashboardUrl(destination)) {
        // Logging out unloads the voice component and releases its microphone.
        awaitingLogin = true;
        if (bubble && dashboardUrl(bubble.webContents.getURL())) bubble.loadURL(policy.APP_ORIGIN + '/login').catch(() => {});
        bubble?.hide();
        return;
      }
      if (awaitingLogin) {
        awaitingLogin = false;
        if (new URL(destination).pathname === '/dashboard/jarvis') {
          crm.loadURL(policy.panelUrl('/dashboard')).catch(() => {});
          return;
        }
      }
      if (zoraxScreen(destination)) { parkBubble(); return; }
      loadBubble();
    };
    crm.webContents.on('did-navigate', navigated);
    crm.webContents.on('did-navigate-in-page', (event, destination, isMainFrame) => { if (isMainFrame) navigated(event, destination); });
    crm.maximize();
    crm.loadURL(url).catch(() => {});
  } else if (route && crm.webContents.getURL() !== url) {
    crm.loadURL(url).catch(() => {});
  }
  if (crm.isMinimized()) crm.restore();
  crm.show(); crm.focus();
}
function deepLink(value) {
  const url = policy.callbackUrl(value, pendingLoginUntil);
  if (!url) return;
  pendingLoginUntil = 0;
  openPanel();
  crm.loadURL(url).catch(() => {});
}
const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  app.on('second-instance', (_event, args) => {
    const link = args.find(value => value.startsWith('nexo-desktop://'));
    if (link) deepLink(link);
    else openPanel();
  });
  app.on('open-url', (event, url) => { event.preventDefault(); deepLink(url); });
  app.on('activate', () => { if (bubble) openPanel(); });
  app.whenReady().then(() => {
    try {
      const saved = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'preferences.json'), 'utf8'));
      preferences.color = policy.color(saved.color);
      // CRM handles access; the assistant starts as a discreet, microphone-off orb.
      try { preferences.watch = policy.watchPreference(saved.watch); } catch { /* Older preferences: watching stays off. */ }
    } catch { /* First start uses defaults. */ }
    syncWatcher();
    if (!selfTest) {
      if (process.defaultApp) app.setAsDefaultProtocolClient('nexo-desktop', process.execPath, [path.resolve(process.argv[1])]);
      else app.setAsDefaultProtocolClient('nexo-desktop');
    }
    const shared = session.fromPartition(partition);
    shared.setPermissionCheckHandler((contents, permission, origin, details) => voiceSurface(contents) && permission === 'media' && details.mediaType === 'audio' && policy.trustedUrl(origin));
    shared.setPermissionRequestHandler((contents, permission, callback, details) => {
      const allowed = voiceSurface(contents) && permission === 'media' && details.isMainFrame && policy.trustedUrl(details.requestingUrl) && details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'audio';
      if (!allowed) { callback(false); return; }
      // macOS consent is requested only after the trusted voice UI requests audio.
      policy.microphoneConsent(process.platform, systemPreferences).then(callback, () => callback(false));
    });
    shared.setDisplayMediaRequestHandler((_request, callback) => callback({}));
    const area = screen.getPrimaryDisplay().workArea;
    bubble = new BrowserWindow({ x: area.x + Math.max(0, area.width - 132), y: area.y + Math.max(0, area.height - 180), width: 112, height: 148, frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, alwaysOnTop: true, resizable: false, title: 'Zorax', show: false,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), partition, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: false } });
    secure(bubble);
    if (process.platform === 'darwin') bubble.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    bubble.webContents.on('did-finish-load', () => {
      if (selfTest) return;
      if (dashboardUrl(bubble.webContents.getURL())) bubble.showInactive();
      else bubble.hide();
    });
    bubble.on('closed', () => { bubble = null; app.quit(); });
    ipcMain.handle('nexo:preferences', event => { guard(event, true); return preferences; });
    ipcMain.handle('nexo:color', (event, value) => { guard(event); preferences.color = policy.color(value); return save(); });
    ipcMain.handle('nexo:expanded', (event, value) => { guard(event, true); if (typeof value !== 'boolean') throw new Error('Tamaño no válido'); if (!dashboardUrl(bubble.webContents.getURL())) { openPanel(); return preferences; } const next = expand(value); bubble.show(); bubble.focus(); return next; });
    ipcMain.handle('nexo:panel', (event, route) => { guard(event, true); openPanel(route); });
    ipcMain.handle('nexo:google', async (event, value) => {
      guard(event, true); const url = policy.googleUrl(value);
      pendingLoginUntil = Date.now() + 5 * 60_000;
      try { await shell.openExternal(url); } catch { pendingLoginUntil = 0; throw new Error('No se pudo abrir el navegador'); }
    });
    ipcMain.handle('nexo:quit', event => { guard(event); app.quit(); });
    // Proactive alerts from the orb only: validated text, at most 6 per minute, click opens the CRM panel.
    ipcMain.handle('nexo:notify', (event, value) => {
      // The orb, or the Zorax screen in the CRM window while the orb is parked.
      guard(event, true);
      if (event.sender === crm?.webContents && !zoraxScreen(event.senderFrame.url)) throw new Error('Solicitud no permitida');
      const notice = policy.notice(value);
      const now = Date.now(); notified = notified.filter(at => now - at < 60_000);
      if (notified.length >= 6 || !Notification?.isSupported?.()) return false;
      notified.push(now);
      const shown = new Notification({ title: notice.title, body: notice.body });
      shown.on('click', () => { if (notice.href) openPanel(notice.href); else openZorax(); });
      shown.show();
      return true;
    });
    // Watched folder (Descargas/Zorax) and clipboard: bubble only, validated, bounded.
    migrateWatchRoot();
    ipcMain.handle('nexo:watch', event => { guard(event); return preferences.watch; });
    ipcMain.handle('nexo:watch-set', (event, value) => { guard(event); preferences.watch = policy.watchPreference(value); save(); syncWatcher(); return preferences.watch; });
    ipcMain.handle('nexo:watch-open', async event => {
      guard(event);
      try { fs.mkdirSync(path.join(watchRoot(), 'catalogo'), { recursive: true }); fs.mkdirSync(path.join(watchRoot(), 'stock'), { recursive: true }); } catch { /* Shown as empty. */ }
      await shell.openPath(watchRoot());
    });
    ipcMain.handle('nexo:file-read', (event, value) => {
      guard(event);
      const token = policy.fileToken(value);
      const entry = pendingFiles.get(token);
      pendingFiles.delete(token);
      if (!entry || Date.now() - entry.at > FILE_TOKEN_MS) throw new Error('Archivo no disponible');
      // The path must still be a regular file inside the watched folder (no links out of it).
      const root = fs.realpathSync(watchRoot()) + path.sep;
      const real = fs.realpathSync(entry.path);
      const stat = fs.lstatSync(entry.path);
      if (!stat.isFile() || !real.startsWith(root) || stat.size > policy.MAX_FILE_BYTES || !policy.watchedFile(entry.name, stat.size)) throw new Error('Archivo no disponible');
      return { name: entry.name, folder: entry.folder, mime: entry.mime, base64: fs.readFileSync(entry.path).toString('base64') };
    });
    ipcMain.handle('nexo:clipboard', event => {
      guard(event);
      const now = Date.now(); clipboardReads = clipboardReads.filter(at => now - at < 60_000);
      if (clipboardReads.length >= 10) throw new Error('Demasiadas lecturas del portapapeles');
      clipboardReads.push(now);
      if (!clipboard) return { kind: 'empty' };
      const image = clipboard.readImage?.();
      if (image && !image.isEmpty()) {
        const png = policy.clipboardImage(image.toPNG());
        if (png) return { kind: 'image', png: Buffer.from(png).toString('base64') };
      }
      const text = policy.clipboardText(clipboard.readText?.());
      return text ? { kind: 'text', text } : { kind: 'empty' };
    });
    const updateEnabled = Boolean(app.isPackaged && !selfTest);
    // macOS updates itself like Windows: verified DMG, swap in Applications, relaunch (see mac-install.cjs).
    const macInstaller = updateEnabled && process.platform === 'darwin' ? require('./mac-install.cjs').createMacInstaller({
      execPath: process.execPath, tempDir: app.getPath('temp'), fetchImpl: (...args) => fetch(...args), relaunch: execPath => { app.relaunch(typeof execPath === 'string' && execPath ? { execPath } : undefined); app.quit(); }, openPath: target => shell.openPath(target),
    }) : undefined;
    void macInstaller?.cleanup();
    updates = createUpdates({ version: app.getVersion(), platform: process.platform, enabled: updateEnabled, macInstaller,
      updater: updateEnabled && process.platform === 'win32' ? require('electron-updater').autoUpdater : undefined,
      fetchRelease: async () => {
        const response = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(15_000) });
        if (!response.ok) throw new Error('Release unavailable');
        return response.json();
      },
      openExternal: url => shell.openExternal(url),
      changed: state => { for (const win of [bubble, crm]) if (win && !win.isDestroyed() && policy.trustedUrl(win.webContents.getURL())) win.webContents.send('nexo:update-state', state); },
      available: state => {
        if (Notification.isSupported()) { const notice = new Notification({ title: 'Nueva versión de Zorax', body: `Zorax ${state.latestVersion} está disponible. Abre el CRM para actualizar.` }); notice.on('click', () => openPanel()); notice.show(); }
      },
    });
    for (const [channel, action] of [['state', 'snapshot'], ['check', 'check'], ['download', 'download'], ['install', 'install']]) {
      ipcMain.handle(`nexo:update-${channel}`, event => { guard(event, true); return updates[action](); });
    }
    if (updateEnabled) {
      updateTimer = setTimeout(() => void updates.check(), 15_000); updateTimer.unref();
      updateInterval = setInterval(() => void updates.check(), 6 * 60 * 60_000); updateInterval.unref();
    }
    if (!selfTest) {
      const trayIcon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
      tray = new Tray(process.platform === 'darwin' ? trayIcon.resize({ width: 18, height: 18 }) : trayIcon);
      tray.setToolTip('Zorax · Tu agente');
      tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Abrir CRM', click: () => openPanel() }, { label: 'Hablar con Zorax', click: () => openZorax() }, { label: 'Buscar actualizaciones', click: async () => { const state = await updates.check(); openPanel(); void dialog.showMessageBox(crm, { type: 'info', title: 'Actualizaciones de Zorax', message: state.latestVersion ? `Zorax ${state.latestVersion}` : `Zorax ${state.currentVersion}`, detail: state.message }); } }, { type: 'separator' }, { label: 'Salir y apagar micrófono', click: () => app.quit() }]));
      tray.on('click', () => openPanel());
      globalShortcut.register('Alt+Shift+N', () => openZorax());
    }
    if (selfTest) {
      // Hidden, bounded startup validation; never operates the user's UI or microphone.
      bubble.loadURL(policy.APP_ORIGIN + '/login').then(() => {
        console.log(JSON.stringify({ startup: 'ok', version: app.getVersion(), workspacePanel: policy.panelUrl('/dashboard/workspace'), platform: process.platform, arch: process.arch, sandbox: bubble.webContents.getLastWebPreferences().sandbox, nodeIntegration: bubble.webContents.getLastWebPreferences().nodeIntegration, alwaysOnTop: bubble.isAlwaysOnTop(), allWorkspaces: bubble.isVisibleOnAllWorkspaces() })); app.quit();
      }).catch(() => { console.error('Zorax startup check failed'); app.exit(1); });
      setTimeout(() => app.exit(1), 30_000).unref();
    } else openPanel('/dashboard');
  });
  app.on('will-quit', () => { globalShortcut.unregisterAll(); clearTimeout(updateTimer); clearInterval(updateInterval); watcher?.stop(); });
  app.on('window-all-closed', () => app.quit());
}
