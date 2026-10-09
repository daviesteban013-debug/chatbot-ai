import assert from "node:assert/strict";
import {beforeEach,after,test} from "node:test";
import {randomBytes} from "node:crypto";
import {load} from "../agent/load.mjs";
const {encryptWhatsAppToken,decryptWhatsAppToken,loadWhatsAppSendOptions}=await import(await load("../../lib/whatsapp/credentials.ts"));
const saved=new Map(["WHATSAPP_CREDENTIALS_KEY","WHATSAPP_ACCESS_TOKEN","WHATSAPP_PHONE_NUMBER_ID"].map(key=>[key,process.env[key]]));
beforeEach(()=>{process.env.WHATSAPP_CREDENTIALS_KEY=randomBytes(32).toString("base64");process.env.WHATSAPP_ACCESS_TOKEN="fixture-global";process.env.WHATSAPP_PHONE_NUMBER_ID="123456789";});
after(()=>{for(const [key,value]of saved) {if(value===undefined) delete process.env[key];else process.env[key]=value;}});
const tenant=crypto.randomUUID(), phone="123456789";
function admin(stored,id=phone,error=null){const filters=[];const q={select(){return q;},eq(...args){filters.push(args);return q;},limit(){return q;},maybeSingle:async()=>({data:{phone_number_id:id,access_token_enc:stored},error})};return {from:()=>q,filters};}
test("random authenticated encryption is bound to business and number; tampering fails",()=>{
  const a=encryptWhatsAppToken("fixture-access-token",tenant,phone),b=encryptWhatsAppToken("fixture-access-token",tenant,phone);
  assert.notEqual(a,b);assert.ok(!a.includes("fixture-access-token"));assert.equal(decryptWhatsAppToken(a,tenant,phone),"fixture-access-token");
  assert.throws(()=>decryptWhatsAppToken(a,crypto.randomUUID(),phone),/WHATSAPP_CREDENTIAL_UNAVAILABLE/);
  assert.throws(()=>decryptWhatsAppToken(a,tenant,"987654321"),/WHATSAPP_CREDENTIAL_UNAVAILABLE/);
  const parts=a.split('.');parts[3]=randomBytes(16).toString('base64url');assert.throws(()=>decryptWhatsAppToken(parts.join('.'),tenant,phone),/WHATSAPP_CREDENTIAL_UNAVAILABLE/);
});
test("all credential consumers load the exact tenant/number and corrupt ciphertext never falls back",async()=>{
  const client=admin(encryptWhatsAppToken("fixture-token",tenant,phone));
  assert.equal((await loadWhatsAppSendOptions(client,tenant,phone)).accessToken,"fixture-token");
  assert.deepEqual(client.filters,[["tenant_id",tenant],["phone_number_id",phone]]);
  assert.equal(await loadWhatsAppSendOptions(admin("wa.v1.broken"),tenant),null);
  assert.equal(await loadWhatsAppSendOptions(admin(null,"987654321"),tenant),null);
  assert.equal((await loadWhatsAppSendOptions(admin(null),tenant)).accessToken,"fixture-global");
  assert.equal(await loadWhatsAppSendOptions(admin(null,phone,{message:"fixture failure"}),tenant),null);
});
test("missing or malformed encryption key blocks new credentials and encrypted reads",async()=>{
  const encrypted=encryptWhatsAppToken("fixture-token",tenant,phone);
  delete process.env.WHATSAPP_CREDENTIALS_KEY;
  assert.throws(()=>encryptWhatsAppToken("fixture-token",tenant,phone),/WHATSAPP_ENCRYPTION_NOT_CONFIGURED/);
  assert.equal(await loadWhatsAppSendOptions(admin(encrypted),tenant),null);
  process.env.WHATSAPP_CREDENTIALS_KEY="invalid";assert.throws(()=>encryptWhatsAppToken("fixture-token",tenant,phone),/WHATSAPP_ENCRYPTION_NOT_CONFIGURED/);
});
