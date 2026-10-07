import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { moduleUrl } from "../stripe/load-module.mjs";

// Server-side, read-only probe. No model requests, sends, writes or raw CRM values.
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { executeWebToolCall } = await import(await moduleUrl("lib/agent/web-tools.ts"));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: member, error } = await db.from("tenant_members").select("tenant_id, role").eq("role", "owner").limit(1).maybeSingle();
if (error || !member) throw new Error("No se pudo resolver un negocio para la comprobación del CRM.");
const ctx = { supabase: db, tenantId: member.tenant_id, role: member.role, signal: AbortSignal.timeout(20000) };
const probes = [
  ["get_business_overview", { days: 7 }],
  ["search_customers", { query: "jarvis-smoke-unmatched", limit: 1 }],
  ["list_orders", { limit: 1 }],
];
const { data: product, error: productError } = await db.from("products").select("name").eq("tenant_id", ctx.tenantId).eq("active", true).limit(1).maybeSingle();
const { data: variant, error: variantError } = await db.from("product_variants").select("sku").eq("tenant_id", ctx.tenantId).eq("active", true).limit(1).maybeSingle();
if (productError || variantError) throw new Error("No se pudo consultar el catálogo para la comprobación.");
probes.push(["search_catalog", { query: product?.name || "jarvis-smoke-unmatched", max_results: 1 }]);
if (variant) probes.push(["check_stock", { variant_sku: variant.sku, qty: 1 }]);
let failed = false;
for (const [tool, args] of probes) {
  const result = await executeWebToolCall(tool, args, ctx);
  failed ||= !result.ok;
  console.log(JSON.stringify({ tool, ok: result.ok }));
}
if (!variant) console.log(JSON.stringify({ tool: "check_stock", state: "skipped_no_active_variant" }));
if (failed) process.exitCode = 1;
