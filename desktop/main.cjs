const { app, BrowserWindow, ipcMain, session, screen, globalShortcut, shell, Tray, Menu, nativeImage, systemPreferences } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const policy = require('./policy.cjs');
let bubble, crm, tray, pendingLoginUntil = 0;
let preferences = { color: '#facc15', expanded: true };
const partition = 'persist:nexo';
const selfTest = process.argv.includes('--startup-check');
function save() {
  const file = path.join(app.getPath('userData'), 'preferences.json');
  fs.writeFileSync(file + '.tmp', JSON.stringify(preferences));
  fs.renameSync(file + '.tmp', file);
  bubble?.webContents.send('nexo:preferences-changed', preferences);
  return preferences;
}
function expand(expanded) {
  const area = screen.getDisplayMatching(bubble.getBounds()).workArea;
  const [width, height] = expanded ? [420, Math.min(680, area.height)] : [156, 190];
  const bounds = bubble.getBounds();
  bubble.setBounds({ x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)), y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)), width, height });
  preferences.expanded = expanded;
  return save();
}
function guard(event) {
  if (event.sender !== bubble?.webContents || event.senderFrame !== event.sender.mainFrame || !policy.trustedUrl(event.senderFrame.url)) throw new Error('Solicitud no permitida');
}
function secure(window) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (!policy.trustedUrl(url)) event.preventDefault(); });
  window.webContents.on('will-redirect', (event, url) => { if (!policy.trustedUrl(url)) event.preventDefault(); });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
}
function openPanel(route) {
  const url = policy.panelUrl(route);
  if (!crm || crm.isDestroyed()) {
    crm = new BrowserWindow({ width: 1200, height: 800, title: 'NEXO · CRM', autoHideMenuBar: true, webPreferences: { partition, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
    secure(crm);
  }
  crm.loadURL(url).catch(() => {});
  crm.show(); crm.focus();
}
function deepLink(value) {
  const url = policy.callbackUrl(value, pendingLoginUntil);
  if (!url || !bubble) return;
  pendingLoginUntil = 0;
  expand(true); bubble.show(); bubble.focus();
  bubble.loadURL(url).catch(() => {});
}
const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  app.on('second-instance', (_event, args) => {
    const link = args.find(value => value.startsWith('nexo-desktop://'));
    if (link) deepLink(link);
    else { bubble?.show(); bubble?.focus(); }
  });
  app.on('open-url', (event, url) => { event.preventDefault(); deepLink(url); });
  app.on('activate', () => { bubble?.show(); bubble?.focus(); });
  app.whenReady().then(() => {
    try {
      const saved = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'preferences.json'), 'utf8'));
      preferences.color = policy.color(saved.color);
      // Start expanded so login and mic consent never disappear into a tiny window.
    } catch { /* First start uses defaults. */ }
    if (!selfTest) {
      if (process.defaultApp) app.setAsDefaultProtocolClient('nexo-desktop', process.execPath, [path.resolve(process.argv[1])]);
      else app.setAsDefaultProtocolClient('nexo-desktop');
    }
    const shared = session.fromPartition(partition);
    shared.setPermissionCheckHandler((contents, permission, origin, details) => contents === bubble?.webContents && permission === 'media' && details.mediaType === 'audio' && policy.trustedUrl(origin));
    shared.setPermissionRequestHandler((contents, permission, callback, details) => {
      const allowed = contents === bubble?.webContents && permission === 'media' && details.isMainFrame && policy.trustedUrl(details.requestingUrl) && details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'audio';
      if (!allowed) { callback(false); return; }
      // macOS consent is requested only after the trusted voice UI requests audio.
      policy.microphoneConsent(process.platform, systemPreferences).then(callback, () => callback(false));
    });
    shared.setDisplayMediaRequestHandler((_request, callback) => callback({}));
    const area = screen.getPrimaryDisplay().workArea;
    bubble = new BrowserWindow({ x: area.x + Math.max(0, area.width - 440), y: area.y + 20, width: 420, height: Math.min(680, area.height), frame: false, transparent: true, backgroundColor: '#00000000', alwaysOnTop: true, resizable: false, title: 'NEXO', show: !selfTest,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), partition, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: false } });
    secure(bubble);
    if (process.platform === 'darwin') bubble.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    bubble.on('closed', () => { bubble = null; app.quit(); });
    ipcMain.handle('nexo:preferences', event => { guard(event); return preferences; });
    ipcMain.handle('nexo:color', (event, value) => { guard(event); preferences.color = policy.color(value); return save(); });
    ipcMain.handle('nexo:expanded', (event, value) => { guard(event); if (typeof value !== 'boolean') throw new Error('Tamaño no válido'); return expand(value); });
    ipcMain.handle('nexo:panel', (event, route) => { guard(event); openPanel(route); });
    ipcMain.handle('nexo:google', async (event, value) => {
      guard(event); const url = policy.googleUrl(value);
      pendingLoginUntil = Date.now() + 5 * 60_000;
      try { await shell.openExternal(url); } catch { pendingLoginUntil = 0; throw new Error('No se pudo abrir el navegador'); }
    });
    ipcMain.handle('nexo:quit', event => { guard(event); app.quit(); });
    if (!selfTest) {
      tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'icon.png')));
      tray.setToolTip('NEXO · Tu agente');
      tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Mostrar NEXO', click: () => { expand(true); bubble.show(); bubble.focus(); } }, { label: 'Abrir CRM', click: () => openPanel('/dashboard') }, { type: 'separator' }, { label: 'Salir y apagar micrófono', click: () => app.quit() }]));
      tray.on('click', () => { bubble.show(); bubble.focus(); });
      globalShortcut.register('Alt+Shift+N', () => { expand(!preferences.expanded); bubble.show(); });
    }
    if (selfTest) {
      // Hidden, bounded startup validation; never operates the user's UI or microphone.
      bubble.loadURL(policy.APP_ORIGIN + '/login').then(() => {
        console.log(JSON.stringify({ startup: 'ok', platform: process.platform, arch: process.arch, sandbox: bubble.webContents.getLastWebPreferences().sandbox, nodeIntegration: bubble.webContents.getLastWebPreferences().nodeIntegration, alwaysOnTop: bubble.isAlwaysOnTop(), allWorkspaces: bubble.isVisibleOnAllWorkspaces() })); app.quit();
      }).catch(() => { console.error('NEXO startup check failed'); app.exit(1); });
      setTimeout(() => app.exit(1), 30_000).unref();
    } else bubble.loadURL(policy.APP_ORIGIN + '/dashboard/jarvis').catch(() => {});
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => app.quit());
}
