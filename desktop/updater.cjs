const REPO = 'daviesteban013-debug/chatbot-ai';
const stable = value => typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value);
function newer(candidate, current) {
  if (!stable(candidate) || !stable(current)) return false;
  const a = candidate.split('.').map(Number), b = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
  return false;
}
function macRelease(release, current) {
  if (!release || release.draft || release.prerelease) return null;
  const version = release.tag_name?.replace(/^nexo-desktop-v/, '');
  if (release.tag_name !== `nexo-desktop-v${version}` || !newer(version, current)) return null;
  // The image kept the NEXO- file name through the rename so older apps still find it; a Zorax- name is accepted too.
  const names = [`Zorax-${version}-mac-universal.dmg`, `NEXO-${version}-mac-universal.dmg`], sums = `SHA256SUMS-${version}.txt`;
  const base = `https://github.com/${REPO}/releases/download/nexo-desktop-v${version}/`;
  const asset = (file, maxSize = Infinity) => release.assets?.find(item => item.name === file && item.browser_download_url === base + file && item.size > 0 && item.size <= maxSize);
  const dmg = names.map(file => asset(file)).find(Boolean), checksums = asset(sums, 16_384);
  return dmg && checksums ? { version, name: dmg.name, url: dmg.browser_download_url, size: dmg.size, checksumsUrl: checksums.browser_download_url } : null;
}
// All native update decisions stay in the main process; renderers supply no URLs or paths.
function createUpdates({ version, platform, enabled, updater, macInstaller, fetchRelease, openExternal, changed = () => {}, available = () => {}, now = Date.now }) {
  // macOS installs in place when the bundle sits in a writable Applications folder; otherwise the person gets the DMG.
  const macAutomatic = Boolean(enabled && platform === 'darwin' && macInstaller?.installable());
  const mode = !enabled ? 'development' : platform === 'win32' || macAutomatic ? 'automatic' : 'assisted';
  let state = { status: 'idle', mode, currentVersion: version, message: enabled ? 'Busca una nueva versión de NEXO.' : 'Actualizaciones disponibles en la app instalada.' };
  let checking, downloading, installing, lastCheck = 0, notified, macAsset, macDmg;
  const snapshot = () => ({ ...state });
  const set = patch => { state = { ...state, ...patch }; changed(snapshot()); };
  function found(latestVersion) {
    if (!newer(latestVersion, version)) return set({ status: 'current', message: 'Tienes la última versión.' });
    set({ status: 'available', latestVersion, progress: undefined, message: mode === 'automatic' ? 'Nueva versión lista para descargar.' : 'Descarga la nueva versión y reemplaza NEXO en Aplicaciones.' });
    if (notified !== latestVersion) { notified = latestVersion; available(snapshot()); }
  }
  const fail = () => set({ status: 'error', message: 'No se pudo completar la actualización. Revisa tu conexión y vuelve a buscar.' });
  if (enabled && platform === 'win32') {
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.logger = null;
    updater.on('update-available', info => found(info.version));
    updater.on('update-not-available', () => set({ status: 'current', message: 'Tienes la última versión.' }));
    updater.on('download-progress', info => set({ status: 'downloading', progress: Math.max(0, Math.min(100, Number(info.percent) || 0)), message: 'Descargando la actualización…' }));
    updater.on('update-downloaded', info => {
      if (info.version === state.latestVersion && newer(info.version, version)) set({ status: 'downloaded', progress: 100, message: 'Guardamos tu sesión. Reinicia para instalar la actualización.' });
      else fail();
    });
    updater.on('error', fail);
  }
  return {
    snapshot,
    check() {
      if (!enabled || !['win32', 'darwin'].includes(platform)) return Promise.resolve(snapshot());
      if (checking) return checking;
      if (['available', 'downloading', 'downloaded', 'installing'].includes(state.status) || (lastCheck && now() - lastCheck < 60_000)) return Promise.resolve(snapshot());
      lastCheck = now();
      set({ status: 'checking', latestVersion: undefined, progress: undefined, message: 'Buscando actualizaciones…' });
      checking = Promise.resolve().then(async () => {
        if (platform === 'win32') await updater.checkForUpdates();
        else {
          const result = macRelease(await fetchRelease(), version);
          if (result) { macAsset = result; found(result.version); }
          else set({ status: 'current', message: 'Tienes la última versión.' });
        }
      }).catch(fail).then(snapshot).finally(() => { checking = null; });
      return checking;
    },
    download() {
      if (downloading) return downloading;
      if (!enabled || state.status !== 'available') return Promise.resolve(snapshot());
      if (platform === 'darwin' && macAutomatic) {
        set({ status: 'downloading', progress: 0, message: 'Descargando la actualización…' });
        downloading = macInstaller.download({ ...macAsset, onProgress: percent => { if (state.status === 'downloading' && percent !== state.progress) set({ progress: percent }); } })
          .then(({ dmg }) => { macDmg = dmg; set({ status: 'downloaded', progress: 100, message: 'Guardamos tu sesión. Reinicia para instalar la actualización.' }); })
          .catch(fail).then(snapshot).finally(() => { downloading = null; });
      } else if (platform === 'darwin') {
        downloading = Promise.resolve().then(() => openExternal(macAsset.url)).then(() => {
          set({ message: 'Descarga abierta. Cierra NEXO y reemplázalo en Aplicaciones; conserva tus datos.' });
        }).catch(fail).then(snapshot).finally(() => { downloading = null; });
      } else if (platform === 'win32') {
        set({ status: 'downloading', progress: 0, message: 'Descargando la actualización…' });
        downloading = Promise.resolve().then(() => updater.downloadUpdate()).catch(fail).then(snapshot).finally(() => { downloading = null; });
      }
      return downloading ?? Promise.resolve(snapshot());
    },
    install() {
      if (enabled && platform === 'win32' && state.status === 'downloaded') {
        set({ status: 'installing', message: 'Reiniciando para instalar…' });
        try { updater.quitAndInstall(false, true); } catch { fail(); }
      } else if (macAutomatic && state.status === 'downloaded' && macDmg) {
        if (installing) return installing;
        const dmg = macDmg, latest = state.latestVersion;
        set({ status: 'installing', message: 'Instalando y reiniciando…' });
        installing = macInstaller.install({ dmg, version: latest }).catch(async () => {
          // The swap was refused (permissions, unexpected location): hand over the verified image instead.
          set({ status: 'error', message: 'No pude reemplazar NEXO en Aplicaciones. Abrí el instalador verificado: arrastra NEXO a Aplicaciones y vuelve a abrirlo.' });
          await macInstaller.openInstaller(dmg).catch(() => {});
        }).then(snapshot).finally(() => { installing = null; });
        return installing;
      }
      return snapshot();
    },
  };
}
module.exports = { createUpdates, newer, macRelease, REPO };
