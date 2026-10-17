const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const mac = require('../mac-install.cjs');

const sha = buffer => createHash('sha256').update(buffer).digest('hex');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'nexo-mac-test-'));
const response = (body, { ok = true, headers = {} } = {}) => ({ ok, headers: { get: name => headers[name.toLowerCase()] ?? null }, text: async () => String(body), body: ok ? new Blob([body]).stream() : null });
/** A fake macOS tool belt: records every command and does to a temp folder what the real tools would do. */
function fakeTools(root, { version = '0.2.6', identifier = mac.BUNDLE_ID, codesign = () => {}, failRename = false } = {}) {
  const calls = [];
  const exec = async (file, args) => {
    calls.push([path.basename(file), ...args]);
    if (file.endsWith('hdiutil') && args[0] === 'attach') {
      const mount = args[args.indexOf('-mountpoint') + 1];
      fs.mkdirSync(path.join(mount, 'NEXO.app', 'Contents', 'Resources'), { recursive: true });
      fs.writeFileSync(path.join(mount, 'NEXO.app', 'Contents', 'Info.plist'), 'plist');
      fs.writeFileSync(path.join(mount, 'NEXO.app', 'Contents', 'Resources', 'marker'), 'new');
      return { stdout: '' };
    }
    if (file.endsWith('hdiutil')) { fs.rmSync(args[1], { recursive: true, force: true }); return { stdout: '' }; }
    if (file.endsWith('codesign')) { codesign(args.at(-1)); return { stdout: '' }; }
    if (file.endsWith('PlistBuddy')) return { stdout: `${args[1].includes('Identifier') ? identifier : version}\n` };
    if (file.endsWith('ditto')) { fs.cpSync(args[0], args[1], { recursive: true }); return { stdout: '' }; }
    throw new Error(`unexpected tool ${file}`);
  };
  const tools = { exec, fs, fsp: failRename ? { ...fsp, rename: async (from, to) => { if (from.includes('-update.app')) throw new Error('EACCES'); return fsp.rename(from, to); } } : fsp, tmpdir: () => root };
  return { calls, tools };
}
function installedApp(root) {
  const bundle = path.join(root, 'Applications', 'NEXO.app');
  fs.mkdirSync(path.join(bundle, 'Contents', 'Resources'), { recursive: true });
  fs.writeFileSync(path.join(bundle, 'Contents', 'Resources', 'marker'), 'old');
  return bundle;
}

test('the bundle comes from the executable path and only writable regular folders are installable', () => {
  assert.equal(mac.bundlePath('/Applications/NEXO.app/Contents/MacOS/NEXO'), '/Applications/NEXO.app');
  assert.equal(mac.bundlePath('/Users/d/Desktop/NEXO 2.app/Contents/MacOS/NEXO'), '/Users/d/Desktop/NEXO 2.app');
  assert.equal(mac.bundlePath('/usr/local/bin/electron'), null); assert.equal(mac.bundlePath(undefined), null);
  assert.equal(mac.installable('/Volumes/NEXO/NEXO.app'), false, 'running from the mounted DMG');
  assert.equal(mac.installable('/private/var/folders/ab/T/AppTranslocation/x/d/NEXO.app'), false, 'translocated by Gatekeeper');
  assert.equal(mac.installable(null), false);
  const root = tmp(), bundle = installedApp(root);
  assert.equal(mac.installable(bundle), true);
  assert.equal(mac.installable(path.join(root, 'missing', 'NEXO.app')), false);
  assert.equal(mac.previousPath('/Applications/NEXO.app'), path.join('/Applications', '.NEXO-previous.app'));
});

test('the checksum file is read by file name and ignores noise', () => {
  const text = '8e0dbd2cbbe9a69e604537d4069ac573e0370f9e5632abd79551a39bc666446d  NEXO-0.2.6-mac-universal.dmg\r\nb982dab4460ff295efcfd120cd33f6768def28b77b740250973630434900ebc4  NEXO-Setup-0.2.6.exe\n\nnot a line\n';
  assert.equal(mac.parseChecksum(text, 'NEXO-0.2.6-mac-universal.dmg'), '8e0dbd2cbbe9a69e604537d4069ac573e0370f9e5632abd79551a39bc666446d');
  assert.equal(mac.parseChecksum(text, 'NEXO-Setup-0.2.6.exe'), 'b982dab4460ff295efcfd120cd33f6768def28b77b740250973630434900ebc4');
  assert.equal(mac.parseChecksum(text, 'NEXO-0.2.5-mac-universal.dmg'), null);
  assert.equal(mac.parseChecksum('zzzz  NEXO-0.2.6-mac-universal.dmg', 'NEXO-0.2.6-mac-universal.dmg'), null);
});

test('downloads stream to disk with progress and are hashed; size lies are rejected', async () => {
  const root = tmp(), bytes = Buffer.alloc(300_000, 7), destination = path.join(root, 'updates', 'a.dmg'), progress = [];
  const result = await mac.downloadToFile({ url: 'https://github.com/x', destination, fetchImpl: async () => response(bytes), expectedSize: bytes.length, onProgress: percent => progress.push(percent) });
  assert.equal(result.sha256, sha(bytes)); assert.equal(result.size, bytes.length);
  assert.equal(fs.readFileSync(destination).length, bytes.length);
  assert.ok(progress.length > 0 && progress.every((value, index) => index === 0 || value >= progress[index - 1]) && progress.at(-1) <= 99);
  await assert.rejects(mac.downloadToFile({ url: 'u', destination, fetchImpl: async () => response(bytes), expectedSize: bytes.length - 1 }), /too large/);
  await assert.rejects(mac.downloadToFile({ url: 'u', destination, fetchImpl: async () => response(bytes), expectedSize: bytes.length + 1 }), /incomplete/);
  await assert.rejects(mac.downloadToFile({ url: 'u', destination, fetchImpl: async () => response(bytes), maxBytes: 1000 }), /too large/);
  await assert.rejects(mac.downloadToFile({ url: 'u', destination, fetchImpl: async () => response('', { ok: false }) }), /failed/);
});

test('installing mounts, verifies, copies, swaps with two renames and keeps the previous version hidden', async () => {
  const root = tmp(), bundle = installedApp(root), dmg = path.join(root, 'NEXO-0.2.6-mac-universal.dmg');
  fs.writeFileSync(dmg, 'image');
  const { calls, tools } = fakeTools(root);
  const result = await mac.installFromDmg({ dmg, bundle, version: '0.2.6' }, tools);
  assert.deepEqual(result, { bundle, previous: path.join(root, 'Applications', '.NEXO-previous.app'), version: '0.2.6' });
  assert.deepEqual(calls.map(call => call.slice(0, 2)), [['hdiutil', 'attach'], ['codesign', '--verify'], ['PlistBuddy', '-c'], ['PlistBuddy', '-c'], ['ditto', path.join(calls[0][calls[0].indexOf('-mountpoint') + 1], 'NEXO.app')], ['codesign', '--verify'], ['hdiutil', 'detach']]);
  assert.ok(calls[0].includes('-nobrowse') && calls[0].includes('-readonly') && calls[0].includes('-noautoopen'));
  assert.equal(fs.readFileSync(path.join(bundle, 'Contents', 'Resources', 'marker'), 'utf8'), 'new');
  assert.equal(fs.readFileSync(path.join(result.previous, 'Contents', 'Resources', 'marker'), 'utf8'), 'old');
  assert.equal(fs.existsSync(dmg), false, 'the image is removed after a successful swap');
  assert.equal(fs.existsSync(calls[0][calls[0].indexOf('-mountpoint') + 1]), false, 'the mount point is gone');
  assert.equal(fs.readdirSync(path.join(root, 'Applications')).filter(name => name.includes('update')).length, 0, 'no staging left behind');
  assert.equal(await mac.cleanupPrevious(bundle, tools), true);
  assert.equal(fs.existsSync(result.previous), false);
  assert.equal(await mac.cleanupPrevious(bundle, tools), false);
});

test('an image with another app, another version or a bad signature never touches the installed bundle', async () => {
  for (const options of [{ version: '0.2.5' }, { identifier: 'com.other.app' }, { codesign: target => { if (target.includes('nexo-update-')) throw new Error('invalid signature'); } }]) {
    const root = tmp(), bundle = installedApp(root), dmg = path.join(root, 'x.dmg');
    fs.writeFileSync(dmg, 'image');
    const { calls, tools } = fakeTools(root, options);
    await assert.rejects(mac.installFromDmg({ dmg, bundle, version: '0.2.6' }, tools));
    assert.equal(fs.readFileSync(path.join(bundle, 'Contents', 'Resources', 'marker'), 'utf8'), 'old');
    assert.equal(calls.at(-1)[1], 'detach', 'the image is always unmounted');
    assert.equal(fs.existsSync(dmg), true, 'the image stays for the assisted fallback');
    assert.deepEqual(fs.readdirSync(path.join(root, 'Applications')), ['NEXO.app']);
  }
  await assert.rejects(mac.installFromDmg({ dmg: 'x', bundle: null, version: '0.2.6' }), /nothing/);
  await assert.rejects(mac.installFromDmg({ dmg: 'x', bundle: '/Applications/NEXO.app', version: 'latest' }), /nothing/);
});

test('a failed second rename puts the previous bundle back', async () => {
  const root = tmp(), bundle = installedApp(root), dmg = path.join(root, 'x.dmg');
  fs.writeFileSync(dmg, 'image');
  const { tools } = fakeTools(root, { failRename: true });
  await assert.rejects(mac.installFromDmg({ dmg, bundle, version: '0.2.6' }, tools), /EACCES/);
  assert.equal(fs.readFileSync(path.join(bundle, 'Contents', 'Resources', 'marker'), 'utf8'), 'old');
  assert.equal(fs.existsSync(path.join(root, 'Applications', '.NEXO-previous.app')), false);
});

test('the installer bound to the app verifies the published checksum before accepting a download', async () => {
  const root = tmp(), bundle = installedApp(root), image = Buffer.alloc(5000, 1), name = 'NEXO-0.2.6-mac-universal.dmg';
  const relaunches = [], opened = [];
  const fetches = [];
  // macOS paths use forward slashes even when this test runs elsewhere.
  const make = sums => mac.createMacInstaller({ execPath: `${bundle}/Contents/MacOS/NEXO`, tempDir: path.join(root, 'tmp'), relaunch: () => relaunches.push(1), openPath: async target => opened.push(target),
    fetchImpl: async url => { fetches.push(url); return url.endsWith('.txt') ? response(sums) : response(image); } });
  const good = make(`${sha(image)}  ${name}\n`);
  assert.equal(good.bundle, bundle); assert.equal(good.installable(), true);
  const asset = { url: `https://github.com/${name}`, size: image.length, checksumsUrl: 'https://github.com/SHA256SUMS-0.2.6.txt', version: '0.2.6' };
  const { dmg } = await good.download({ ...asset, onProgress() {} });
  assert.equal(dmg, path.join(root, 'tmp', 'nexo-updates', name)); assert.equal(fs.readFileSync(dmg).length, image.length);
  assert.deepEqual(fetches, [asset.checksumsUrl, asset.url], 'checksums first, then the image');
  const bad = make(`${sha(Buffer.alloc(5000, 2))}  ${name}\n`);
  await assert.rejects(bad.download({ ...asset, onProgress() {} }), /mismatch/);
  assert.equal(fs.existsSync(dmg), false, 'a mismatching image is deleted');
  await assert.rejects(make('').download({ ...asset, onProgress() {} }), /missing/);
  await assert.rejects(make('x'.repeat(20_000)).download({ ...asset, onProgress() {} }), /too large/);
  await good.openInstaller('/tmp/x.dmg'); assert.deepEqual(opened, ['/tmp/x.dmg']);
  assert.equal(await good.cleanup(), false);
  assert.equal(mac.createMacInstaller({ execPath: '/usr/bin/node', tempDir: root, fetchImpl: async () => response(''), relaunch() {}, openPath: async () => {} }).installable(), false);
});
