import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, WhatsappAccount } from "@/lib/database.types";
import { encryptionConfigured } from "./credentials";
import { GRAPH_API_VERSION } from "./cloud";

export type WhatsAppAccountPublic = Pick<WhatsappAccount,
  "phone_number_id" | "waba_id" | "display_phone" | "connection_status" | "verified_at" | "last_webhook_at"
>;
export type WhatsAppSignupConfig = { appId: string; configId: string; version: string };
export type WhatsAppSetup = {
  account: WhatsAppAccountPublic | null;
  /** Present when the owner can connect with Meta's button (Embedded Signup); both IDs are public. */
  signup: WhatsAppSignupConfig | null;
  canManage: boolean;
  webhookUrl: string;
  graphVersion: string;
  requirements: { name: string; ready: boolean }[];
};
export const setupRequirements = () => [
  {name:"WHATSAPP_APP_ID",ready:Boolean(process.env.WHATSAPP_APP_ID?.trim())},
  {name:"WHATSAPP_APP_SECRET",ready:Boolean(process.env.WHATSAPP_APP_SECRET?.trim())},
  {name:"WHATSAPP_VERIFY_TOKEN",ready:Boolean(process.env.WHATSAPP_VERIFY_TOKEN?.trim())},
  {name:"WHATSAPP_CREDENTIALS_KEY",ready:encryptionConfigured()},
];
export const signupConfig = (): WhatsAppSignupConfig | null => {
  const appId = process.env.WHATSAPP_APP_ID?.trim() ?? "", configId = process.env.WHATSAPP_SIGNUP_CONFIG_ID?.trim() ?? "";
  return /^\d{5,30}$/.test(appId) && /^\d{5,30}$/.test(configId) ? { appId, configId, version: GRAPH_API_VERSION } : null;
};
export async function readWhatsAppSetup(client: SupabaseClient<Database>, tenantId: string, owner: boolean): Promise<WhatsAppSetup> {
  const {data,error} = await client.from("whatsapp_accounts")
    .select("phone_number_id,waba_id,display_phone,connection_status,verified_at,last_webhook_at")
    .eq("tenant_id",tenantId).limit(1).maybeSingle();
  if (error) throw new Error("WHATSAPP_STATUS_UNAVAILABLE");
  return {
    account:data, canManage:owner, signup:owner ? signupConfig() : null,
    webhookUrl:new URL("/api/whatsapp",process.env.APP_URL || "https://zoraxpilot.com").href,
    graphVersion:GRAPH_API_VERSION,
    requirements:owner ? setupRequirements() : [],
  };
}
