import nextEnv from "@next/env";
import { moduleUrl } from "../stripe/load-module.mjs";

// Match next dev environment loading without reading or printing dotenv values.
nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const { llmStatus } = await import(await moduleUrl("lib/llm/client.ts"));
console.log(JSON.stringify(llmStatus(), null, 2));
