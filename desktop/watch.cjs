// Watches Descargas/NEXO (and its catalogo/ and stock/ subfolders) and reports a file once
// it stopped changing. Pure: the file system and timers are injected, so it runs in tests
// without a real folder, and nothing here ever stops the app.
const path = require('node:path');
const policy = require('./policy.cjs');

const SETTLE_MS = 1500;
const REMEMBER_MS = 10 * 60_000;
const MAX_SETTLE_CHECKS = 80;
const FOLDERS = ['root', 'catalogo', 'stock'];

function createWatcher({ root, fs, setTimeout: schedule = setTimeout, clearTimeout: cancel = clearTimeout, now = Date.now, onFile, onError = () => {} }) {
  const folders = { root, catalogo: path.join(root, 'catalogo'), stock: path.join(root, 'stock') };
  const watchers = [];
  const timers = new Map();
  const seen = new Map();
  let active = false;

  function ensureFolders() {
    for (const folder of Object.values(folders)) {
      try { fs.mkdirSync(folder, { recursive: true }); } catch (error) { onError(error); }
    }
  }
  function remember(key) {
    const at = now();
    for (const [known, when] of seen) if (at - when > REMEMBER_MS) seen.delete(known);
    if (seen.has(key)) return false;
    seen.set(key, at);
    return true;
  }
  function changed(folder, name) {
    if (!active || typeof name !== 'string' || !name) return;
    const key = `${folder}/${name}`;
    const file = path.join(folders[folder], name);
    if (timers.has(key)) cancel(timers.get(key).timer);
    const pending = { size: -1, checks: 0, timer: null };
    const check = () => {
      let stat;
      try { stat = fs.statSync(file); } catch { timers.delete(key); return; }
      if (!stat.isFile()) { timers.delete(key); return; }
      // A download or a copy grows for a while: report it only after its size holds still.
      if (stat.size !== pending.size || pending.checks === 0) {
        pending.size = stat.size; pending.checks++;
        if (pending.checks > MAX_SETTLE_CHECKS) { timers.delete(key); return; }
        pending.timer = schedule(check, SETTLE_MS); timers.set(key, pending);
        return;
      }
      timers.delete(key);
      const accepted = policy.watchedFile(name, stat.size);
      if (!accepted) return;
      if (!remember(`${key}:${stat.size}:${Math.floor(stat.mtimeMs || 0)}`)) return;
      try { onFile({ folder, name, path: file, size: stat.size, mime: accepted.mime }); } catch (error) { onError(error); }
    };
    pending.timer = schedule(check, SETTLE_MS);
    timers.set(key, pending);
  }
  function start() {
    if (active) return;
    active = true;
    ensureFolders();
    for (const folder of FOLDERS) {
      try {
        const watcher = fs.watch(folders[folder], { persistent: false }, (_eventType, name) => changed(folder, name));
        if (typeof watcher.on === 'function') watcher.on('error', onError);
        watchers.push(watcher);
      } catch (error) { onError(error); }
    }
  }
  function stop() {
    active = false;
    for (const watcher of watchers.splice(0)) { try { watcher.close(); } catch { /* Already closed. */ } }
    for (const pending of timers.values()) cancel(pending.timer);
    timers.clear();
  }
  return { start, stop, folders, ensureFolders, get active() { return active; } };
}

module.exports = { createWatcher, SETTLE_MS, REMEMBER_MS, FOLDERS };
