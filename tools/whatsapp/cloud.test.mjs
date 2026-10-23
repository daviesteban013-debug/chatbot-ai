import assert from "node:assert/strict";
import {beforeEach,after,test} from "node:test";
import {load} from "../agent/load.mjs";
const {verifyCloudPhone,activateCloudPhone,cloudErrorMessage,exchangeSignupCode,generateTwoStepPin,CloudSetupError,onlyCloudPhoneId,requestAppDataSync}=await import(await load("../../lib/whatsapp/cloud.ts"));
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
  // Meta's sandbox number is never SMS-verified and is still accepted; a real unverified SIM is not.
  phone.display_phone_number="+1 555 629 0862";phone.verified_name="Test Number";
  assert.equal((await verifyCloudPhone("1111122222",phone.id,"fixture-token")).display_phone_number,"+1 555 629 0862");
  phone.display_phone_number="+1 555 629 0862";phone.verified_name="Bellisima";
  assert.equal((await verifyCloudPhone("1111122222",phone.id,"fixture-token")).id,phone.id,"the +1 555 range alone identifies the sandbox");
  phone.display_phone_number="+1 555 629 08620";phone.verified_name="Bellisima";
  await assert.rejects(verifyCloudPhone("1111122222",phone.id,"fixture-token"),/NUMBER_NOT_VERIFIED/,"a number that only resembles the sandbox range is not excused");
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
test("the signup code becomes a business token only on the server; bad codes, outages and a missing app are told apart",async()=>{
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return url.includes("oauth/access_token") ? Response.json({access_token:"fixture-business-token"}) : Response.json({});};
  assert.equal(await exchangeSignupCode("AQB-fixture-code-1234567890"),"fixture-business-token");
  const url=new URL(calls[0].url);assert.equal(url.pathname,"/v26.0/oauth/access_token");
  assert.equal(url.searchParams.get("client_id"),"987654321");assert.equal(url.searchParams.get("client_secret"),"fixture-app-secret");assert.equal(url.searchParams.get("code"),"AQB-fixture-code-1234567890");
  assert.equal(calls[0].options.cache,"no-store");assert.ok(calls[0].options.signal instanceof AbortSignal);
  await assert.rejects(exchangeSignupCode("short"),/SIGNUP_CODE_INVALID/);await assert.rejects(exchangeSignupCode("bad code with spaces"),/SIGNUP_CODE_INVALID/);
  globalThis.fetch=async()=>Response.json({error:{code:100,message:"private fixture"}},{status:400});
  await assert.rejects(exchangeSignupCode("AQB-fixture-code-1234567890"),/SIGNUP_CODE_INVALID/);
  globalThis.fetch=async()=>{throw new Error("offline");};
  await assert.rejects(exchangeSignupCode("AQB-fixture-code-1234567890"),/META_UNAVAILABLE/);
  delete process.env.WHATSAPP_APP_ID;await assert.rejects(exchangeSignupCode("AQB-fixture-code-1234567890"),/APP_NOT_CONFIGURED/);
});
test("a PIN mismatch on registration is reported as such, and generated PINs are six digits",async()=>{
  globalThis.fetch=async(url,options)=>{calls.push({url,options});
    if(url.includes("debug_token")) return Response.json({data:debug});
    if(url.includes("phone_numbers?")) return Response.json({data:[phone]});
    if(url.endsWith("/register")) return Response.json({error:{code:133005,message:"Two step verification PIN mismatch"}},{status:400});
    return Response.json({success:true});};
  await assert.rejects(activateCloudPhone("1111122222",phone.id,"fixture-token","123456"),/PIN_MISMATCH/);
  assert.match(cloudErrorMessage(new CloudSetupError("PIN_MISMATCH")),/PIN de verificación/);
  assert.match(cloudErrorMessage(new CloudSetupError("SIGNUP_CODE_INVALID")),/Conectar WhatsApp/);
  for (let i=0;i<50;i++) assert.match(generateTwoStepPin(),/^\d{6}$/);
});

test("a number Meta just linked from the WhatsApp Business app is accepted without an SMS check, and the account's single number is found",async()=>{
  phone.code_verification_status="NOT_VERIFIED";
  await assert.rejects(verifyCloudPhone("1111122222",phone.id,"fixture-token"),/NUMBER_NOT_VERIFIED/);
  assert.equal((await verifyCloudPhone("1111122222",phone.id,"fixture-token",{requireVerified:false})).id,phone.id);
  calls=[];await activateCloudPhone("1111122222",phone.id,"fixture-token",undefined,{requireVerified:false});
  assert.ok(calls.some(call=>call.url.endsWith("/subscribed_apps")));assert.ok(!calls.some(call=>call.url.endsWith("/register")),"never re-registers a linked app");
  assert.equal(await onlyCloudPhoneId("1111122222","fixture-token"),phone.id);
  globalThis.fetch=async()=>Response.json({data:[{id:"123456789"},{id:"987654321"}]});
  await assert.rejects(onlyCloudPhoneId("1111122222","fixture-token"),/NUMBER_NOT_IN_WABA/);
  globalThis.fetch=async()=>Response.json({data:[]});
  await assert.rejects(onlyCloudPhoneId("1111122222","fixture-token"),/NUMBER_NOT_IN_WABA/);
  await assert.rejects(onlyCloudPhoneId("x","fixture-token"),/INVALID_IDS/);
});
test("asking for a linked app's contacts or chats posts the sync type to the number and maps refusals to codes",async()=>{
  await requestAppDataSync("123456789","fixture-token","smb_app_state_sync");
  await requestAppDataSync("123456789","fixture-token","history");
  assert.ok(calls[0].url.endsWith("/123456789/smb_app_data"));assert.equal(calls[0].options.method,"POST");
  assert.deepEqual(calls.map(call=>JSON.parse(call.options.body)),[{messaging_product:"whatsapp",sync_type:"smb_app_state_sync"},{messaging_product:"whatsapp",sync_type:"history"}]);
  assert.equal(calls[0].options.headers.Authorization,"Bearer fixture-token");
  responseError={error:{code:100,message:"fixture-token already requested"}};
  await assert.rejects(requestAppDataSync("123456789","fixture-token","history"),{message:"META_PERMISSION_OR_ASSET"});
  calls=[];await assert.rejects(requestAppDataSync("not-a-number","fixture-token","history"),/INVALID_IDS/);assert.equal(calls.length,0);
});
