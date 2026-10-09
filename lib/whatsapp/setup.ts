import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, WhatsappAccount } from "@/lib/database.types";
import { encryptionConfigured } from "./credentials";
import { GRAPH_API_VERSION } from "./cloud";

export type WhatsAppAccountPublic = Pick<WhatsappAccount,
  "phone_number_id" | "waba_id" | "display_phone" | "connection_status" | "verified_at" | "last_webhook_at"
>;
export type WhatsAppSetup = {
  account: WhatsAppAccountPublic | null;
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
export async function readWhatsAppSetup(client: SupabaseClient<Database>, tenantId: string, owner: boolean): Promise<WhatsAppSetup> {
  const {data,error} = await client.from("whatsapp_accounts")
    .select("phone_number_id,waba_id,display_phone,connection_status,verified_at,last_webhook_at")
    .eq("tenant_id",tenantId).limit(1).maybeSingle();
  if (error) throw new Error("WHATSAPP_STATUS_UNAVAILABLE");
  return {
    account:data, canManage:owner,
    webhookUrl:new URL("/api/whatsapp",process.env.APP_URL || "https://chatbot-ai-gold-two.vercel.app").href,
    graphVersion:GRAPH_API_VERSION,
    requirements:owner ? setupRequirements() : [],
  };
}
