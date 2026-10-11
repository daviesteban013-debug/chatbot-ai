const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createUpdates, newer, macRelease, REPO } = require('../updater.cjs');
function fixture(platform = 'win32', enabled = true) {
  const updater = new EventEmitter(), calls = { checks: 0, downloads: 0, installs: 0, notices: [], external: [] };
  updater.checkForUpdates = async () => { calls.checks++; updater.emit('update-available', { version: '0.2.4' }); };
  updater.downloadUpdate = async () => { calls.downloads++; updater.emit('download-progress', { percent: 54 }); updater.emit('update-downloaded', { version: '0.2.4' }); };
  updater.quitAndInstall = (...args) => { calls.installs++; assert.deepEqual(args, [false, true]); };
  const release = { tag_name: 'nexo-desktop-v0.2.4', draft: false, prerelease: false, assets: [{ name: 'NEXO-0.2.4-mac-universal.dmg', size: 100, browser_download_url: `https://github.com/${REPO}/releases/download/nexo-desktop-v0.2.4/NEXO-0.2.4-mac-universal.dmg` }] };
  const updates = createUpdates({ version: '0.2.3', platform, enabled, updater, fetchRelease: async () => release, openExternal: async url => calls.external.push(url), available: state => calls.notices.push(state), now: () => 100_000 });
  return { updater, calls, updates, release };
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
test('Mac checks validated public assets and opens only that installer after a click', async () => {
  const { updates, calls, release } = fixture('darwin');
  await updates.check(); assert.equal(updates.snapshot().mode, 'assisted'); assert.equal(calls.external.length, 0);
  await updates.download(); assert.deepEqual(calls.external, [release.assets[0].browser_download_url]);
  updates.install(); assert.equal(calls.installs, 0); assert.equal(calls.downloads, 0);
});
test('Mac rejects external URLs, drafts, prereleases, missing assets and older versions', () => {
  const { release } = fixture('darwin');
  for (const patch of [{ draft: true }, { prerelease: true }, { tag_name: 'nexo-desktop-v0.2.1' }, { assets: [] }, { assets: [{ ...release.assets[0], browser_download_url: 'https://evil.test/app.dmg' }] }]) assert.equal(macRelease({ ...release, ...patch }, '0.2.3'), null);
  assert.equal(newer('0.10.0', '0.2.3'), true); assert.equal(newer('0.2.3', '0.2.3'), false); assert.equal(newer('0.2.4-beta', '0.2.3'), false);
});
test('development and startup-check modes never request releases, download or install', async () => {
  const { updates, calls } = fixture('win32', false);
  await updates.check(); await updates.download(); updates.install();
  assert.equal(updates.snapshot().mode, 'development'); assert.equal(calls.checks + calls.downloads + calls.installs, 0);
});
