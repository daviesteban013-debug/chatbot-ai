// Self-update for the macOS build, the counterpart of electron-updater on Windows. The app
// downloads the DMG published in the official release, checks its SHA-256 against the checksum
// file published next to it, copies NEXO.app out of the image and swaps it with the running
// bundle in Applications using two renames; then it relaunches. Everything that touches the
// system is injected so the logic runs under tests on any platform.
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const BUNDLE_ID = 'ai.nexo.desktop';
const MAX_DMG_BYTES = 600 * 1024 * 1024;
const MAX_SUMS_BYTES = 16 * 1024;
const TOOLS = { exec: promisify(execFile), fs, fsp, tmpdir: () => os.tmpdir() };

/** The .app bundle that contains an executable path, or null when NEXO runs outside a bundle. */
function bundlePath(execPath) {
  const match = /^(.*?\.app)\/Contents\/MacOS\/[^/]+$/.exec(String(execPath ?? ''));
  return match ? match[1] : null;
}
/** Where the previous version waits, hidden, until the next start removes it. */
const previousPath = bundle => path.join(path.dirname(bundle), `.${path.basename(bundle, '.app')}-previous.app`);
const stagingPath = (bundle, version) => path.join(path.dirname(bundle), `.${path.basename(bundle, '.app')}-${version}-update.app`);

/** Only a bundle in a regular, writable folder can be swapped; translocated or mounted copies cannot. */
function installable(bundle, tools = TOOLS) {
  if (!bundle || /^\/(?:private\/)?var\/folders\//.test(bundle) || bundle.startsWith('/Volumes/')) return false;
  try {
    tools.fs.accessSync(path.dirname(bundle), tools.fs.constants.W_OK);
    tools.fs.accessSync(bundle, tools.fs.constants.W_OK);
    return true;
  } catch { return false; }
}

/** The SHA-256 published for one file in the release's checksum text, or null. */
function parseChecksum(text, name) {
  for (const line of String(text).split(/\r?\n/)) {
    const match = /^([a-f0-9]{64})\s+\*?(.+)$/i.exec(line.trim());
    if (match && match[2].trim() === name) return match[1].toLowerCase();
  }
  return null;
}

/** Streams a download to disk while hashing it; the size must match what the release declares. */
async function downloadToFile({ url, destination, fetchImpl, expectedSize = 0, maxBytes = MAX_DMG_BYTES, onProgress = () => {} }, tools = TOOLS) {
  const response = await fetchImpl(url, { redirect: 'follow', headers: { Accept: 'application/octet-stream' } });
  if (!response.ok || !response.body) throw new Error('download failed');
  const total = expectedSize || Number(response.headers.get('content-length')) || 0;
  await tools.fsp.mkdir(path.dirname(destination), { recursive: true });
  const handle = await tools.fsp.open(destination, 'w');
  const hash = createHash('sha256');
  let size = 0, reported = -1;
  try {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes || (expectedSize && size > expectedSize)) throw new Error('download too large');
      hash.update(value);
      await handle.write(value);
      if (total) { const percent = Math.min(99, Math.floor(size / total * 100)); if (percent !== reported) { reported = percent; onProgress(percent); } }
    }
  } finally { await handle.close(); }
  if (expectedSize && size !== expectedSize) throw new Error('download incomplete');
  return { sha256: hash.digest('hex'), size };
}

/**
 * Mounts a verified DMG, checks the app inside (signature, identifier, version), copies it next
 * to the installed bundle and swaps the two with renames on the same volume. The running process
 * keeps its mapped binary; the previous bundle stays hidden until the next start cleans it up.
 */
async function installFromDmg({ dmg, bundle, version }, tools = TOOLS) {
  if (!bundle || !/^\d+\.\d+\.\d+$/.test(String(version))) throw new Error('nothing to install');
  const { exec } = tools;
  const name = path.basename(bundle);
  const staging = stagingPath(bundle, version), previous = previousPath(bundle);
  const mount = await tools.fsp.mkdtemp(path.join(tools.tmpdir(), 'nexo-update-'));
  let mounted = false;
  try {
    await exec('/usr/bin/hdiutil', ['attach', '-nobrowse', '-readonly', '-noautoopen', '-mountpoint', mount, dmg]);
    mounted = true;
    const source = path.join(mount, name), plist = path.join(source, 'Contents', 'Info.plist');
    await exec('/usr/bin/codesign', ['--verify', '--deep', '--strict', source]);
    const identifier = (await exec('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', plist])).stdout.trim();
    const found = (await exec('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', plist])).stdout.trim();
    if (identifier !== BUNDLE_ID || found !== version) throw new Error('unexpected app in image');
    await tools.fsp.rm(staging, { recursive: true, force: true });
    await exec('/usr/bin/ditto', [source, staging]);
    await exec('/usr/bin/codesign', ['--verify', '--deep', '--strict', staging]);
  } catch (error) {
    await tools.fsp.rm(staging, { recursive: true, force: true }).catch(() => {});
    throw error;
  } finally {
    if (mounted) await exec('/usr/bin/hdiutil', ['detach', mount, '-force']).catch(() => {});
    await tools.fsp.rm(mount, { recursive: true, force: true }).catch(() => {});
  }
  await tools.fsp.rm(previous, { recursive: true, force: true });
  await tools.fsp.rename(bundle, previous);
  try { await tools.fsp.rename(staging, bundle); }
  catch (error) { await tools.fsp.rename(previous, bundle).catch(() => {}); throw error; }
  await tools.fsp.rm(dmg, { force: true }).catch(() => {});
  return { bundle, previous, version };
}

/** Removes the previous version left by the last update, if any. */
async function cleanupPrevious(bundle, tools = TOOLS) {
  if (!bundle) return false;
  const previous = previousPath(bundle);
  try { await tools.fsp.access(previous); } catch { return false; }
  await tools.fsp.rm(previous, { recursive: true, force: true });
  return true;
}

/** The pieces the updater needs, bound to the running app. */
function createMacInstaller({ execPath, tempDir, fetchImpl, relaunch, openPath, tools = TOOLS }) {
  const bundle = bundlePath(execPath);
  return {
    bundle,
    installable: () => installable(bundle, tools),
    async download({ url, size, checksumsUrl, version, onProgress }) {
      const sums = await fetchImpl(checksumsUrl, { redirect: 'follow', signal: AbortSignal.timeout(30_000) });
      if (!sums.ok) throw new Error('checksums unavailable');
      const text = await sums.text();
      if (text.length > MAX_SUMS_BYTES) throw new Error('checksums too large');
      const name = `NEXO-${version}-mac-universal.dmg`;
      const expected = parseChecksum(text, name);
      if (!expected) throw new Error('checksum missing');
      const destination = path.join(tempDir, 'nexo-updates', name);
      const { sha256 } = await downloadToFile({ url, destination, fetchImpl, expectedSize: size, onProgress }, tools);
      if (sha256 !== expected) { await tools.fsp.rm(destination, { force: true }).catch(() => {}); throw new Error('checksum mismatch'); }
      return { dmg: destination };
    },
    async install({ dmg, version }) { await installFromDmg({ dmg, bundle, version }, tools); relaunch(); },
    openInstaller: dmg => openPath(dmg),
    cleanup: () => cleanupPrevious(bundle, tools).catch(() => false),
  };
}

module.exports = { BUNDLE_ID, bundlePath, previousPath, installable, parseChecksum, downloadToFile, installFromDmg, cleanupPrevious, createMacInstaller };

// CI: `node mac-install.cjs --self-test <dmg> <folder> <version>` installs the image over
// <folder>/NEXO.app exactly as the app does on update, and prints the result.
if (require.main === module && process.argv[2] === '--self-test') {
  const [dmg, folder, version] = process.argv.slice(3);
  installFromDmg({ dmg: path.resolve(dmg), bundle: path.join(path.resolve(folder), 'NEXO.app'), version })
    .then(result => console.log(JSON.stringify({ ok: true, ...result })))
    .catch(error => { console.error(`self-update failed: ${error.message}`); process.exit(1); });
}
