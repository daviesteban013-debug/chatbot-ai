// Deliberately redacted CLI: never prints environment values, tokens or rows.
import { appendFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { load } from "../agent/load.mjs";
config({path:".env.local",quiet:true});
const { encryptionConfigured, encryptWhatsAppToken } = await import(await load("../../lib/whatsapp/credentials.ts"));
const command=process.argv[2]||"status";
try {
  if (command==="init") {
    const additions=[];
    for (const [name,bytes] of [["WHATSAPP_CREDENTIALS_KEY",32],["WHATSAPP_VERIFY_TOKEN",32]]) {
      if (!process.env[name]?.trim()) {
        const value=randomBytes(bytes).toString("base64");
        additions.push(`${name}=${value}`); process.env[name]=value;
      }
    }
    if (additions.length) await appendFile(".env.local",`\n# WhatsApp server setup\n${additions.join("\n")}\n`);
    console.log(JSON.stringify({generated:additions.map(item=>item.split("=")[0]),values:"hidden"}));
  } else if (command==="encrypt-legacy") {
    // Old deployments read this column as plaintext. Upgrade ALL consumers first.
    if (!process.argv.includes("--deployed")) throw new Error("DEPLOY_NEW_CREDENTIAL_READERS_FIRST");
    if (!encryptionConfigured()) throw new Error("ENCRYPTION_KEY_REQUIRED");
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SERVER_CONNECTION_REQUIRED");
    const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error}=await client.from("whatsapp_accounts").select("id,tenant_id,phone_number_id,access_token_enc");
    if(error) throw new Error("CREDENTIAL_READ_FAILED");
    let converted=0;
    for (const row of data??[]) {
      if (!row.access_token_enc?.trim() || row.access_token_enc.startsWith("wa.")) continue;
      const encrypted=encryptWhatsAppToken(row.access_token_enc,row.tenant_id,row.phone_number_id);
      const result=await client.from("whatsapp_accounts").update({access_token_enc:encrypted}).eq("id",row.id).eq("access_token_enc",row.access_token_enc).select("id");
      if(result.error) throw new Error("CREDENTIAL_UPDATE_FAILED");
      converted+=result.data?.length??0;
    }
    console.log(JSON.stringify({converted,values:"hidden"}));
  } else if(command!=="status") throw new Error("UNKNOWN_COMMAND");
  console.log(JSON.stringify({requirements:[
    {name:"WHATSAPP_CREDENTIALS_KEY",ready:encryptionConfigured()},
    ...["WHATSAPP_VERIFY_TOKEN","WHATSAPP_APP_ID","WHATSAPP_APP_SECRET"].map(name=>({name,ready:Boolean(process.env[name]?.trim())})),
  ]}));
} catch(error) {
  const known=new Set(["DEPLOY_NEW_CREDENTIAL_READERS_FIRST","ENCRYPTION_KEY_REQUIRED","SERVER_CONNECTION_REQUIRED","CREDENTIAL_READ_FAILED","CREDENTIAL_UPDATE_FAILED","UNKNOWN_COMMAND"]);
  console.error(JSON.stringify({error:known.has(error?.message)?error.message:"WHATSAPP_SETUP_FAILED",values:"hidden"}));
  process.exitCode=1;
}
