import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, WhatsappAccount } from "@/lib/database.types";
import { encryptionConfigured } from "./credentials";
import { GRAPH_API_VERSION } from "./cloud";

export type WhatsAppAccountPublic = Pick<WhatsappAccount,
  "phone_number_id" | "waba_id" | "display_phone" | "connection_status" | "verified_at" | "last_webhook_at"
  | "app_linked_at" | "contacts_sync_requested_at" | "history_sync_requested_at" | "history_sync_progress" | "history_sync_declined"
>;
export type WhatsAppSignupConfig = { appId: string; configId: string; version: string };
/**
 * Bringing a linked WhatsApp Business app's contacts and chats: `pending` while something is still to be
 * asked inside Meta's window (`retryUntil`), `importing` with Meta's progress, or how it ended.
 */
export type WhatsAppAppSync = {
  status: "none" | "pending" | "importing" | "done" | "declined" | "expired";
  progress: number | null;
  retryUntil: string | null;
};
/** Meta only accepts asking for the app's contacts and chats during the 24 hours after linking it. */
export const APP_SYNC_WINDOW_MS = 24 * 60 * 60 * 1000;
export type WhatsAppSetup = {
  account: WhatsAppAccountPublic | null;
  appSync: WhatsAppAppSync;
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
export function appSyncStatus(account: WhatsAppAccountPublic | null, now = Date.now()): WhatsAppAppSync {
  const none = { progress: null, retryUntil: null };
  if (!account?.app_linked_at) return { status: "none", ...none };
  if (account.history_sync_declined) return { status: "declined", ...none };
  if (account.history_sync_progress === 100) return { status: "done", progress: 100, retryUntil: null };
  if (!account.contacts_sync_requested_at || !account.history_sync_requested_at) {
    const until = Date.parse(account.app_linked_at) + APP_SYNC_WINDOW_MS;
    return now < until ? { status: "pending", progress: null, retryUntil: new Date(until).toISOString() } : { status: "expired", ...none };
  }
  return { status: "importing", progress: account.history_sync_progress ?? 0, retryUntil: null };
}
export async function readWhatsAppSetup(client: SupabaseClient<Database>, tenantId: string, owner: boolean): Promise<WhatsAppSetup> {
  const {data,error} = await client.from("whatsapp_accounts")
    .select("phone_number_id,waba_id,display_phone,connection_status,verified_at,last_webhook_at,app_linked_at,contacts_sync_requested_at,history_sync_requested_at,history_sync_progress,history_sync_declined")
    .eq("tenant_id",tenantId).limit(1).maybeSingle();
  if (error) throw new Error("WHATSAPP_STATUS_UNAVAILABLE");
  return {
    account:data, appSync:appSyncStatus(data), canManage:owner, signup:owner ? signupConfig() : null,
    webhookUrl:new URL("/api/whatsapp",process.env.APP_URL || "https://zoraxpilot.com").href,
    graphVersion:GRAPH_API_VERSION,
    requirements:owner ? setupRequirements() : [],
  };
}
