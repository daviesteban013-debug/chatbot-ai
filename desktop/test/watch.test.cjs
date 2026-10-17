const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createWatcher, SETTLE_MS, REMEMBER_MS } = require('../watch.cjs');

const root = path.join('/d', 'NEXO');
function harness({ watchError = false } = {}) {
  const timers = [], watchers = [], dirs = [], files = [], errors = [], stats = new Map();
  let clock = 0;
  const fs = {
    mkdirSync: dir => dirs.push(dir),
    watch: (dir, options, callback) => {
      if (watchError) throw new Error('EPERM');
      const watcher = { dir, options, callback, closed: false, close() { this.closed = true; }, on() {} };
      watchers.push(watcher); return watcher;
    },
    statSync: file => { const entry = stats.get(file); if (!entry) throw new Error('ENOENT'); return { isFile: () => entry.file !== false, size: entry.size, mtimeMs: entry.mtime ?? 0 }; },
  };
  const watcher = createWatcher({ root, fs, setTimeout: (fn, ms) => { const timer = { fn, ms, cleared: false }; timers.push(timer); return timer; }, clearTimeout: timer => { if (timer) timer.cleared = true; },
    now: () => clock, onFile: file => files.push(file), onError: error => errors.push(error) });
  const tick = () => { for (const timer of timers.splice(0)) if (!timer.cleared) timer.fn(); };
  const emit = (folder, name, type = 'rename') => watchers.find(item => item.dir === (folder === 'root' ? root : path.join(root, folder))).callback(type, name);
  return { watcher, timers, watchers, dirs, files, errors, stats, tick, emit, advance: ms => { clock += ms; } };
}

test('start creates the three folders and watches them without keeping the app alive; stop closes everything', () => {
  const h = harness();
  h.watcher.start(); h.watcher.start();
  assert.deepEqual(h.dirs, [root, path.join(root, 'catalogo'), path.join(root, 'stock')]);
  assert.deepEqual(h.watchers.map(w => [w.dir, w.options.persistent]), [[root, false], [path.join(root, 'catalogo'), false], [path.join(root, 'stock'), false]]);
  assert.equal(h.watcher.active, true);
  h.stats.set(path.join(root, 'a.pdf'), { size: 10 }); h.emit('root', 'a.pdf');
  h.watcher.stop();
  assert.ok(h.watchers.every(w => w.closed)); assert.ok(h.timers.every(t => t.cleared)); assert.equal(h.watcher.active, false);
  h.emit('root', 'a.pdf'); h.tick(); h.tick();
  assert.deepEqual(h.files, [], 'events after stop are ignored');
});

test('a file is reported once its size holds still, with its folder and type, and only once', () => {
  const h = harness(); h.watcher.start();
  const file = path.join(root, 'stock', 'inventario.xlsx');
  h.stats.set(file, { size: 100, mtime: 5 });
  h.emit('stock', 'inventario.xlsx');
  assert.equal(h.timers.at(-1).ms, SETTLE_MS);
  h.tick(); assert.deepEqual(h.files, [], 'first look only records the size');
  h.stats.set(file, { size: 250, mtime: 6 }); h.tick(); assert.deepEqual(h.files, [], 'still growing');
  h.tick();
  assert.deepEqual(h.files, [{ folder: 'stock', name: 'inventario.xlsx', path: file, size: 250, mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }]);
  h.emit('stock', 'inventario.xlsx', 'change'); h.tick(); h.tick();
  assert.equal(h.files.length, 1, 'the same content is not announced twice within ten minutes');
  h.advance(REMEMBER_MS + 1); h.emit('stock', 'inventario.xlsx', 'change'); h.tick(); h.tick();
  assert.equal(h.files.length, 2, 'later it counts as a new file');
  h.stats.set(file, { size: 260, mtime: 9 }); h.emit('stock', 'inventario.xlsx', 'change'); h.tick(); h.tick();
  assert.equal(h.files.length, 3, 'a different size is a different file');
});

test('temp, hidden, unsupported, oversized, vanished and folder entries are never reported', () => {
  const h = harness(); h.watcher.start();
  const cases = [['lista.xlsx.crdownload', { size: 10 }], ['.DS_Store', { size: 10 }], ['~$doc.docx', { size: 10 }], ['virus.exe', { size: 10 }], ['grande.pdf', { size: 3 * 1024 * 1024 + 1 }], ['carpeta.pdf', { size: 10, file: false }]];
  for (const [name, stat] of cases) { h.stats.set(path.join(root, name), stat); h.emit('root', name); }
  h.emit('root', 'desaparecido.pdf');
  h.emit('root', null);
  h.tick(); h.tick();
  assert.deepEqual(h.files, []);
  // A file renamed while settling restarts the wait instead of leaking a timer.
  h.stats.set(path.join(root, 'ok.pdf'), { size: 10 });
  h.emit('root', 'ok.pdf'); h.emit('root', 'ok.pdf');
  assert.equal(h.timers.filter(t => !t.cleared).length, 1);
  h.tick(); h.tick();
  assert.equal(h.files.length, 1);
});

test('a file that never stops changing is given up on, and failures never throw out of the watcher', () => {
  const h = harness(); h.watcher.start();
  const file = path.join(root, 'infinito.csv');
  for (let size = 1; size <= 90; size++) { h.stats.set(file, { size }); if (size === 1) h.emit('root', 'infinito.csv'); h.tick(); }
  assert.deepEqual(h.files, []); assert.equal(h.timers.filter(t => !t.cleared).length, 0);
  const broken = harness({ watchError: true });
  broken.watcher.start();
  assert.equal(broken.errors.length, 3); assert.equal(broken.watcher.active, true);
  const throwing = harness();
  throwing.watcher = createWatcher({ root, fs: { mkdirSync() {}, watch: (dir, options, callback) => ({ close() {}, on() {}, callback, dir }), statSync: () => ({ isFile: () => true, size: 5, mtimeMs: 1 }) },
    setTimeout: fn => { fn(); return {}; }, clearTimeout() {}, now: () => 0, onFile: () => { throw new Error('renderer gone'); }, onError: error => throwing.errors.push(error) });
  throwing.watcher.start();
  assert.doesNotThrow(() => throwing.watcher.start());
});
