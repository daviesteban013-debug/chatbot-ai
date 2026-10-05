import { fileURLToPath } from "node:url";
import { realpath } from "node:fs/promises";
import { deliveryStatus } from "./integrations.mjs";

const root = await realpath(fileURLToPath(new URL("../..", import.meta.url)));
console.log(JSON.stringify(await deliveryStatus(root), null, 2));
