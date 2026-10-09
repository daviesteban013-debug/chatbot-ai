import assert from "node:assert/strict";
import {beforeEach,after,test} from "node:test";
import {load} from "../agent/load.mjs";
const {verifyCloudPhone,activateCloudPhone,cloudErrorMessage}=await import(await load("../../lib/whatsapp/cloud.ts"));
const originalFetch=globalThis.fetch;
const originalId=process.env.WHATSAPP_APP_ID, originalSecret=process.env.WHATSAPP_APP_SECRET;
let calls, phone, debug, responseError;
beforeEach(()=>{
  calls=[];responseError=null;phone={id:"123456789",display_phone_number:"+57 3000000000",code_verification_status:"VERIFIED"};
  debug={is_valid:true,app_id:"987654321",scopes:["whatsapp_business_management","whatsapp_business_messaging"]};
  process.env.WHATSAPP_APP_ID="987654321";process.env.WHATSAPP_APP_SECRET="fixture-app-secret";
  globalThis.fetch=async(url,options)=>{
    calls.push({url,options});
    if(responseError) return Response.json(responseError,{status:400});
    if(url.includes("debug_token")) return Response.json({data:debug});
    if(url.includes("phone_numbers?")) return Response.json({data:[phone]});
    return Response.json({success:true});
  };
});
after(()=>{globalThis.fetch=originalFetch;for(const [name,value] of [["WHATSAPP_APP_ID",originalId],["WHATSAPP_APP_SECRET",originalSecret]]) {if(value===undefined) delete process.env[name];else process.env[name]=value;}});
test("verification checks app, scopes, WABA ownership and SMS verification before accepting a number",async()=>{
  assert.equal((await verifyCloudPhone("1111122222",phone.id,"fixture-token")).id,phone.id);
  assert.equal(calls.length,2);assert.ok(calls.every(call=>call.options.cache==="no-store"));
  assert.ok(calls.every(call=>call.options.signal instanceof AbortSignal));
  debug.app_id="other";await assert.rejects(verifyCloudPhone("1111122222",phone.id,"fixture-token"),/TOKEN_WRONG_APP/);
  debug.app_id="987654321";debug.scopes=[];await assert.rejects(verifyCloudPhone("1111122222",phone.id,"fixture-token"),/META_PERMISSION_OR_ASSET/);
  debug.scopes=["whatsapp_business_management","whatsapp_business_messaging"];
  await assert.rejects(verifyCloudPhone("1111122222","5555566666","fixture-token"),/NUMBER_NOT_IN_WABA/);
  phone.code_verification_status="NOT_VERIFIED";await assert.rejects(verifyCloudPhone("1111122222",phone.id,"fixture-token"),/NUMBER_NOT_VERIFIED/);
});
test("registration sets the explicit PIN then subscribes; subscribe-only does not re-register",async()=>{
  await activateCloudPhone("1111122222",phone.id,"fixture-token","123456");
  assert.deepEqual(JSON.parse(calls[2].options.body),{messaging_product:"whatsapp",pin:"123456"});
  assert.ok(calls[2].url.endsWith("/register"));assert.ok(calls[3].url.endsWith("/subscribed_apps"));
  calls=[];await activateCloudPhone("1111122222",phone.id,"fixture-token");
  assert.equal(calls.length,3);assert.ok(!calls.some(call=>call.url.endsWith("/register")));
  calls=[];await assert.rejects(activateCloudPhone("1111122222",phone.id,"fixture-token","123"),/INVALID_PIN/);assert.equal(calls.length,0);
});
test("provider failures are redacted and never retried as mutations",async()=>{
  responseError={error:{code:190,message:"fixture-secret-token echoed by provider"}};
  try {await verifyCloudPhone("1111122222",phone.id,"fixture-token");assert.fail();}
  catch(error){assert.ok(!cloudErrorMessage(error).includes("fixture-secret"));assert.equal(error.message,"TOKEN_INVALID");}
  assert.equal(calls.length,1);
  globalThis.fetch=async()=>{throw new Error("private-network-detail");};
  await assert.rejects(verifyCloudPhone("1111122222",phone.id,"fixture-token"),{message:"META_UNAVAILABLE"});
});
