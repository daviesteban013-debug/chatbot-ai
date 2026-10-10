const { app, BrowserWindow, ipcMain, session, screen, globalShortcut, shell, Tray, Menu, nativeImage, systemPreferences } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const policy = require('./policy.cjs');
let bubble, crm, tray, pendingLoginUntil = 0, awaitingLogin = false, bubbleLoading = false;
let preferences = { color: '#facc15', expanded: false };
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
  const [width, height] = expanded ? [Math.min(368, area.width), Math.min(560, area.height)] : [112, 148];
  const bounds = bubble.getBounds();
  // Anchor the bottom-right corner so collapsing returns the orb to its spot.
  bubble.setBounds({ x: Math.max(area.x, Math.min(bounds.x + bounds.width - width, area.x + area.width - width)), y: Math.max(area.y, Math.min(bounds.y + bounds.height - height, area.y + area.height - height)), width, height });
  preferences.expanded = expanded;
  return save();
}
function guard(event, allowCrm = false) {
  if ((event.sender !== bubble?.webContents && !(allowCrm && event.sender === crm?.webContents)) || event.senderFrame !== event.sender.mainFrame || !policy.trustedUrl(event.senderFrame.url)) throw new Error('Solicitud no permitida');
}
function secure(window) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
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
function showBubble(expanded = preferences.expanded) {
  if (!bubble) return;
  if (!dashboardUrl(bubble.webContents.getURL())) { openPanel(); return; }
  expand(expanded); bubble.show(); bubble.focus();
}
function openPanel(route) {
  const url = policy.panelUrl(route ?? '/dashboard');
  if (!crm || crm.isDestroyed()) {
    crm = new BrowserWindow({ width: 1440, height: 960, minWidth: 800, minHeight: 600, title: 'NEXO · CRM', backgroundColor: '#0b0b0c', autoHideMenuBar: true, show: false,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), additionalArguments: ['--nexo-surface=crm'], partition, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } });
    secure(crm);
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
    bubble = new BrowserWindow({ x: area.x + Math.max(0, area.width - 132), y: area.y + Math.max(0, area.height - 180), width: 112, height: 148, frame: false, transparent: true, backgroundColor: '#00000000', hasShadow: false, alwaysOnTop: true, resizable: false, title: 'NEXO', show: false,
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
    if (!selfTest) {
      const trayIcon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
      tray = new Tray(process.platform === 'darwin' ? trayIcon.resize({ width: 18, height: 18 }) : trayIcon);
      tray.setToolTip('NEXO · Tu agente');
      tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Abrir CRM', click: () => openPanel() }, { label: 'Hablar con NEXO', click: () => showBubble(true) }, { type: 'separator' }, { label: 'Salir y apagar micrófono', click: () => app.quit() }]));
      tray.on('click', () => openPanel());
      globalShortcut.register('Alt+Shift+N', () => showBubble(!preferences.expanded));
    }
    if (selfTest) {
      // Hidden, bounded startup validation; never operates the user's UI or microphone.
      bubble.loadURL(policy.APP_ORIGIN + '/login').then(() => {
        console.log(JSON.stringify({ startup: 'ok', version: app.getVersion(), workspacePanel: policy.panelUrl('/dashboard/workspace'), platform: process.platform, arch: process.arch, sandbox: bubble.webContents.getLastWebPreferences().sandbox, nodeIntegration: bubble.webContents.getLastWebPreferences().nodeIntegration, alwaysOnTop: bubble.isAlwaysOnTop(), allWorkspaces: bubble.isVisibleOnAllWorkspaces() })); app.quit();
      }).catch(() => { console.error('NEXO startup check failed'); app.exit(1); });
      setTimeout(() => app.exit(1), 30_000).unref();
    } else openPanel('/dashboard');
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => app.quit());
}
