import { fileURLToPath } from "node:url";
import { realpath, writeFile, unlink, mkdir } from "node:fs/promises";
import path from "node:path";
import { EnvSync } from "./env-sync.mjs";

const root = await realpath(fileURLToPath(new URL("../..", import.meta.url)));
const sync = new EnvSync(root);
const command = process.argv[2] ?? "status";
try {
  if (command === "enable") console.log(JSON.stringify(await sync.configure(true, [process.argv[3] ?? "production"])));
  else if (command === "pause") console.log(JSON.stringify(await sync.configure(false, (await sync.config()).targets)));
  else if (command === "sync") {
    const result = await sync.sync();
    console.log(JSON.stringify(result));
    if (result.failed?.length) process.exitCode = 1;
  } else if (command === "status") console.log(JSON.stringify(await sync.inspect()));
  else if (command === "watch") {
    await mkdir(sync.dir, { recursive: true });
    const pidFile = path.join(sync.dir, `env-watcher-${process.pid}.pid`);
    await writeFile(pidFile, String(process.pid), { mode: 0o600 });
    let previous = "";
    const stop = sync.startWatching((result) => {
      // CLI output only contains names, status and generic errors, never values.
      const signature = JSON.stringify([result.error, result.updated, result.failed]);
      if (signature !== previous && (result.error || result.updated?.length || result.failed?.length)) console.log(JSON.stringify(result));
      previous = signature;
    });
    const keepAlive = setInterval(() => {}, 60_000);
    const close = async () => {
      stop(); clearInterval(keepAlive);
      await sync.pending;
      await unlink(pidFile).catch(() => {});
    };
    process.once("SIGINT", () => { void close(); });
    process.once("SIGTERM", () => { void close(); });
  } else throw new Error("Usa status, sync, enable, pause o watch.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
