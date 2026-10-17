const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createUpdates, newer, macRelease, REPO } = require('../updater.cjs');
function fixture(platform = 'win32', enabled = true, { installable = false, failInstall = false } = {}) {
  const updater = new EventEmitter(), calls = { checks: 0, downloads: 0, installs: 0, notices: [], external: [], states: [], macDownloads: [], macInstalls: [], opened: [], relaunches: 0 };
  updater.checkForUpdates = async () => { calls.checks++; updater.emit('update-available', { version: '0.2.4' }); };
  updater.downloadUpdate = async () => { calls.downloads++; updater.emit('download-progress', { percent: 54 }); updater.emit('update-downloaded', { version: '0.2.4' }); };
  updater.quitAndInstall = (...args) => { calls.installs++; assert.deepEqual(args, [false, true]); };
  const base = `https://github.com/${REPO}/releases/download/nexo-desktop-v0.2.4/`;
  const release = { tag_name: 'nexo-desktop-v0.2.4', draft: false, prerelease: false, assets: [
    { name: 'NEXO-0.2.4-mac-universal.dmg', size: 100, browser_download_url: `${base}NEXO-0.2.4-mac-universal.dmg` },
    { name: 'SHA256SUMS-0.2.4.txt', size: 355, browser_download_url: `${base}SHA256SUMS-0.2.4.txt` },
  ] };
  const macInstaller = {
    installable: () => installable,
    download: async ({ url, size, checksumsUrl, version, onProgress }) => { calls.macDownloads.push({ url, size, checksumsUrl, version }); onProgress(30); onProgress(30); onProgress(80); return { dmg: '/tmp/nexo-updates/NEXO-0.2.4-mac-universal.dmg' }; },
    install: async ({ dmg, version }) => { calls.macInstalls.push({ dmg, version }); if (failInstall) throw new Error('EACCES: /Applications/.NEXO-0.2.4-update.app'); calls.relaunches++; },
    openInstaller: async dmg => calls.opened.push(dmg),
  };
  const updates = createUpdates({ version: '0.2.3', platform, enabled, updater, macInstaller, fetchRelease: async () => release, openExternal: async url => calls.external.push(url), changed: state => calls.states.push(state), available: state => calls.notices.push(state), now: () => 100_000 });
  return { updater, calls, updates, release, macInstaller };
}
test('Windows checks without downloading or installing and coalesces concurrent checks', async () => {
  const { updates, calls, updater } = fixture();
  await Promise.all([updates.check(), updates.check()]);
  assert.equal(calls.checks, 1); assert.equal(calls.downloads, 0); assert.equal(calls.installs, 0);
  assert.equal(updater.autoDownload, false); assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.allowDowngrade, false); assert.equal(updater.allowPrerelease, false);
  assert.equal(updates.snapshot().status, 'available'); assert.equal(calls.notices.length, 1);
});
test('Windows requires an explicit download and a verified downloaded event before explicit installation', async () => {
  const { updates, calls } = fixture();
  updates.install(); await updates.download(); assert.equal(calls.installs, 0); assert.equal(calls.downloads, 0);
  await updates.check(); updates.install(); assert.equal(calls.installs, 0);
  await Promise.all([updates.download(), updates.download()]); assert.equal(calls.downloads, 1);
  assert.equal(updates.snapshot().status, 'downloaded'); assert.equal(calls.installs, 0);
  updates.install(); updates.install(); assert.equal(calls.installs, 1); assert.equal(updates.snapshot().status, 'installing');
});
test('download failure (including checksum rejection) cannot install and does not leak provider errors', async () => {
  const { updates, calls, updater } = fixture();
  updater.downloadUpdate = async () => { throw new Error('sha512 mismatch /private/path?token=private'); };
  await updates.check(); await updates.download(); updates.install();
  assert.equal(updates.snapshot().status, 'error'); assert.equal(calls.installs, 0);
  assert.doesNotMatch(JSON.stringify(updates.snapshot()), /private|token|sha512/);
});
test('a downloaded event for a different version cannot install', async () => {
  const { updates, calls, updater } = fixture(); await updates.check();
  updater.downloadUpdate = async () => updater.emit('update-downloaded', { version: '0.2.2' });
  await updates.download(); updates.install(); assert.equal(calls.installs, 0);
});
test('Mac outside a writable Applications folder stays assisted: it opens only the validated installer after a click', async () => {
  const { updates, calls, release } = fixture('darwin');
  await updates.check(); assert.equal(updates.snapshot().mode, 'assisted'); assert.equal(calls.external.length, 0);
  await updates.download(); assert.deepEqual(calls.external, [release.assets[0].browser_download_url]);
  await updates.install(); assert.equal(calls.installs, 0); assert.equal(calls.downloads, 0); assert.equal(calls.macDownloads.length + calls.macInstalls.length, 0);
});
test('Mac in Applications updates in place: verified download with progress, explicit install, relaunch', async () => {
  const { updates, calls, release } = fixture('darwin', true, { installable: true });
  assert.equal(updates.snapshot().mode, 'automatic');
  await updates.check(); assert.equal(updates.snapshot().status, 'available'); assert.equal(calls.macDownloads.length, 0);
  await updates.install(); assert.equal(calls.macInstalls.length, 0, 'nothing to install before a verified download');
  await Promise.all([updates.download(), updates.download()]);
  assert.deepEqual(calls.macDownloads, [{ url: release.assets[0].browser_download_url, size: 100, checksumsUrl: release.assets[1].browser_download_url, version: '0.2.4' }]);
  assert.deepEqual(calls.states.filter(state => state.status === 'downloading').map(state => state.progress), [0, 30, 80], 'progress is reported once per change');
  assert.equal(updates.snapshot().status, 'downloaded'); assert.equal(updates.snapshot().progress, 100); assert.equal(calls.external.length, 0);
  await Promise.all([updates.install(), updates.install()]);
  assert.deepEqual(calls.macInstalls, [{ dmg: '/tmp/nexo-updates/NEXO-0.2.4-mac-universal.dmg', version: '0.2.4' }]); assert.equal(calls.relaunches, 1);
  assert.equal(updates.snapshot().status, 'installing'); assert.equal(calls.opened.length, 0);
});
test('a Mac swap that fails hands over the verified image and never leaks the system error', async () => {
  const { updates, calls } = fixture('darwin', true, { installable: true, failInstall: true });
  await updates.check(); await updates.download(); await updates.install();
  assert.equal(calls.relaunches, 0); assert.deepEqual(calls.opened, ['/tmp/nexo-updates/NEXO-0.2.4-mac-universal.dmg']);
  assert.equal(updates.snapshot().status, 'error'); assert.match(updates.snapshot().message, /Aplicaciones/);
  assert.doesNotMatch(JSON.stringify(updates.snapshot()), /EACCES|update\.app/);
});
test('a Mac download that fails its checksum cannot install', async () => {
  const { updates, calls, macInstaller } = fixture('darwin', true, { installable: true });
  macInstaller.download = async () => { throw new Error('checksum mismatch /private/tmp/x.dmg'); };
  await updates.check(); await updates.download(); await updates.install();
  assert.equal(updates.snapshot().status, 'error'); assert.equal(calls.macInstalls.length, 0);
  assert.doesNotMatch(JSON.stringify(updates.snapshot()), /private|mismatch/);
});
test('Mac rejects external URLs, drafts, prereleases, missing assets, a missing checksum file and older versions', () => {
  const { release } = fixture('darwin');
  const [dmg, sums] = release.assets;
  for (const patch of [{ draft: true }, { prerelease: true }, { tag_name: 'nexo-desktop-v0.2.1' }, { assets: [] }, { assets: [dmg] }, { assets: [{ ...dmg, browser_download_url: 'https://evil.test/app.dmg' }, sums] },
    { assets: [dmg, { ...sums, browser_download_url: 'https://evil.test/SHA256SUMS-0.2.4.txt' }] }, { assets: [dmg, { ...sums, size: 50_000 }] }]) assert.equal(macRelease({ ...release, ...patch }, '0.2.3'), null);
  assert.deepEqual(macRelease(release, '0.2.3'), { version: '0.2.4', url: dmg.browser_download_url, size: 100, checksumsUrl: sums.browser_download_url });
  assert.equal(newer('0.10.0', '0.2.3'), true); assert.equal(newer('0.2.3', '0.2.3'), false); assert.equal(newer('0.2.4-beta', '0.2.3'), false);
});
test('development and startup-check modes never request releases, download or install', async () => {
  const { updates, calls } = fixture('win32', false);
  await updates.check(); await updates.download(); updates.install();
  assert.equal(updates.snapshot().mode, 'development'); assert.equal(calls.checks + calls.downloads + calls.installs, 0);
});
