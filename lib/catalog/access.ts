import { getCurrentTenant, getCurrentUser } from "@/lib/auth";

export const PRODUCT_IMAGE_BUCKET = "product-images";

/** Catalog writes are for owners and agents; viewers only read. The RPCs check again. */
export async function catalogEditor() {
  const [user, tenant] = await Promise.all([getCurrentUser(), getCurrentTenant()]);
  if (!user || user.is_anonymous || !tenant) return { ok: false as const, status: 401, error: "Inicia sesión con tu negocio." };
  if (!["owner", "agent"].includes(tenant.role)) return { ok: false as const, status: 403, error: "Tu rol permite consultar el catálogo, no editarlo." };
  return { ok: true as const, userId: user.id, tenantId: tenant.tenantId };
}

/** Browser requests from this app only (multipart and binary bodies are CSRF-able otherwise). */
export function sameSite(request: Request): boolean {
  return request.headers.get("origin") === new URL(request.url).origin && request.headers.get("sec-fetch-site") !== "cross-site";
}

export async function readLimited(request: Request, maxBytes: number): Promise<Uint8Array | null> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel().catch(() => {}); return null; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (!size) return null;
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  return data;
}
