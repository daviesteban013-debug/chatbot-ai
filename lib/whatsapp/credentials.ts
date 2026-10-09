import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { SendOptions } from "./send";

function key(): Buffer {
  const value = process.env.WHATSAPP_CREDENTIALS_KEY?.trim() ?? "";
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 32 || decoded.toString("base64") !== value) throw new Error("WHATSAPP_ENCRYPTION_NOT_CONFIGURED");
  return decoded;
}
export function encryptionConfigured(): boolean {
  try { key(); return true; } catch { return false; }
}
const aad = (tenantId: string, phoneId: string) => Buffer.from(`whatsapp:${tenantId}:${phoneId}`);

export function encryptWhatsAppToken(token: string, tenantId: string, phoneId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(aad(tenantId,phoneId));
  const ciphertext = Buffer.concat([cipher.update(token,"utf8"),cipher.final()]);
  return ["wa","v1",iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),ciphertext.toString("base64url")].join(".");
}

export function decryptWhatsAppToken(value: string, tenantId: string, phoneId: string): string {
  try {
    const [prefix,version,iv,tag,ciphertext,...extra] = value.split(".");
    if (prefix !== "wa" || version !== "v1" || extra.length || !iv || !tag || !ciphertext) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm",key(),Buffer.from(iv,"base64url"));
    decipher.setAAD(aad(tenantId,phoneId));
    decipher.setAuthTag(Buffer.from(tag,"base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext,"base64url")),decipher.final()]).toString("utf8");
  } catch { throw new Error("WHATSAPP_CREDENTIAL_UNAVAILABLE"); }
}

/** Shared by agent, human replies and media download; server client only. */
export async function loadWhatsAppSendOptions(
  admin: SupabaseClient<Database>, tenantId: string, expectedPhoneId?: string,
): Promise<SendOptions | null> {
  let query = admin.from("whatsapp_accounts").select("phone_number_id,access_token_enc").eq("tenant_id",tenantId);
  if (expectedPhoneId) query = query.eq("phone_number_id",expectedPhoneId);
  const { data,error } = await query.limit(1).maybeSingle();
  if (error || !data?.phone_number_id) return null;
  const stored = data.access_token_enc?.trim();
  if (stored?.startsWith("wa.")) {
    try { return {phoneNumberId:data.phone_number_id,accessToken:decryptWhatsAppToken(stored,tenantId,data.phone_number_id)}; }
    catch { return null; } // Never fall back after a corrupt/foreign ciphertext.
  }
  // Compatibility for existing accounts during rollout. Browser column access
  // is revoked by the migration; setup.mjs encrypt-legacy removes this legacy data.
  if (stored) return {phoneNumberId:data.phone_number_id,accessToken:stored};
  // Development fallback is explicitly bound to ONE number, never every tenant.
  if (process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() !== data.phone_number_id) return null;
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  return token ? {phoneNumberId:data.phone_number_id,accessToken:token} : null;
}
