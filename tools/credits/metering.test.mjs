import assert from "node:assert/strict";
import { test, beforeEach, after } from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const url = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
async function load(relative, replacements = {}) {
  let source = await readFile(new URL(relative, import.meta.url), "utf8");
  for (const [from,to] of Object.entries(replacements)) source = source.replaceAll(`"${from}"`, `"${to}"`).replaceAll(`'${from}'`, `'${to}'`);
  return url(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
}
let state;
globalThis.__creditsRpc = async (name, args) => {
  if (state.databaseError) return { error: { message: "unavailable" }, data: null };
  if (name === "reserve_credits") {
    const available = state.quota - state.used - state.reserved;
    if (available < args.p_minimum) return { error: null, data: { ok: false } };
    const reserved = Math.min(available,args.p_requested);
    state.requests.set(args.p_id,{reserved, state:"reserved", channel:args.p_channel});
    state.reserved += reserved;
    return { error:null, data:{ok:true,reservedTokens:reserved} };
  }
  const request = state.requests.get(args.p_id);
  assert.ok(request);
  assert.equal(request.state,"reserved");
  state.reserved -= request.reserved;
  if (name === "settle_credits") { state.used += args.p_tokens_in + args.p_tokens_out; request.state="settled"; state.settlements++; }
  else if (name === "release_credits") { request.state="released"; state.releases++; }
  else throw new Error(`unexpected RPC ${name}`);
  return { error:null,data:null };
};
const serverUrl = await load("../../lib/credits/server.ts", { "@/lib/supabase/admin": url("export const createAdminClient = () => ({rpc:globalThis.__creditsRpc});") });
const clientUrl = await load("../../lib/llm/client.ts");
const raw = await import(clientUrl);
const metered = await import(await load("../../lib/llm/metered.ts", { "./client":clientUrl, "@/lib/credits/server":serverUrl }));
const originalFetch = globalThis.fetch;
const originalKey = process.env.LLM_API_KEY;
const originalUrl = process.env.LLM_BASE_URL;
beforeEach(() => {
  process.env.LLM_API_KEY = "test-placeholder"; process.env.LLM_BASE_URL = "https://provider.invalid";
  state = {quota:100000,used:0,reserved:0,settlements:0,releases:0,calls:0,requests:new Map()};
});
after(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = originalKey;
  if (originalUrl === undefined) delete process.env.LLM_BASE_URL; else process.env.LLM_BASE_URL = originalUrl;
});
const messages = [{role:"user",content:"Hola"}];
const account = {tenantId:"tenant-1",channel:"web"};
const fixture = (usage = {prompt_tokens:75,completion_tokens:175}) => [
  {model:"test-model",choices:[{delta:{content:"Hola ñ"}}]},
  {choices:[{delta:{content:" mundo"},finish_reason:"stop"}]},
  ...(usage ? [{choices:[],usage}] : []),
].map(row => `data: ${JSON.stringify(row)}\r\n\r\n`).join("") + "data: [DONE]";
function streamResponse(source = fixture(), split = false) {
  const bytes = new TextEncoder().encode(source);
  return new Response(new ReadableStream({
    start(controller) {
      if (split) for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      else controller.enqueue(bytes);
      controller.close();
    },
  }), {headers:{"Content-Type":"text/event-stream"}});
}
async function collect(stream) { const events=[]; for await (const event of stream) events.push(event); return events; }

test("stream requests usage; split UTF-8/CRLF and unterminated final line report real tokens, not chunks", async () => {
  globalThis.fetch = async (_url,options) => {
    state.calls++; state.body=JSON.parse(options.body);
    return streamResponse(fixture(),true);
  };
  const events = await collect(raw.chatCompletionStream(messages));
  assert.deepEqual(state.body.stream_options,{include_usage:true});
  assert.equal(events.filter(e=>e.type==="delta").map(e=>e.content).join(""),"Hola ñ mundo");
  assert.equal(events.at(-1).tokensIn,75); assert.equal(events.at(-1).tokensOut,175);
});
test("one model call settles exactly once despite usage and done events; tool rounds each consume actual tokens", async () => {
  globalThis.fetch = async () => { state.calls++; return streamResponse(); };
  await collect(metered.meteredChatCompletionStream(account,messages));
  assert.equal(state.used,250); assert.equal(state.settlements,1); assert.equal(state.reserved,0);
  await collect(metered.meteredChatCompletionStream(account,[...messages,{role:"assistant",content:"tool result"}]));
  assert.equal(state.used,500); assert.equal(state.settlements,2);
  assert.ok([...state.requests.values()].every(r=>r.channel==="web"));
});
test("provisional chunk usage is ignored and only the final provider totals are charged", async () => {
  const provisional = 'data: ' + JSON.stringify({choices:[{delta:{content:"Inicio"}}],usage:{prompt_tokens:1,completion_tokens:1}}) + '\n\n';
  globalThis.fetch = async () => streamResponse(provisional+fixture());
  await collect(metered.meteredChatCompletionStream(account,messages));
  assert.equal(state.used,250);assert.equal(state.settlements,1);
});

test("Groq's repeated final usage on the finish and usage-only chunks is charged once", async () => {
  const usage={prompt_tokens:75,completion_tokens:175};
  const source=[{choices:[{delta:{content:"Total"},finish_reason:"stop"}],usage},{choices:[],usage}].map(row=>`data: ${JSON.stringify(row)}\n\n`).join("")+"data: [DONE]\n";
  globalThis.fetch=async()=>streamResponse(source,true);
  const events=await collect(metered.meteredChatCompletionStream(account,messages));
  assert.equal(events.filter(event=>event.type==="usage").length,1);
  assert.equal(state.used,250);assert.equal(state.settlements,1);assert.equal(state.reserved,0);
});

test("conflicting final totals or a missing terminal marker never settle a provisional report", async () => {
  const finish={choices:[{delta:{content:"Total"},finish_reason:"stop"}],usage:{prompt_tokens:75,completion_tokens:175}};
  const conflicting={choices:[],usage:{prompt_tokens:75,completion_tokens:200}};
  for(const source of [ [finish,conflicting].map(row=>`data: ${JSON.stringify(row)}\n\n`).join("")+"data: [DONE]\n", `data: ${JSON.stringify(finish)}\n\n` ]) {
    globalThis.fetch=async()=>streamResponse(source);
    await assert.rejects(collect(metered.meteredChatCompletionStream(account,messages)),/inconsistente|interrumpió/);
  }
  assert.equal(state.used,0);assert.equal(state.settlements,0);assert.ok(state.reserved>0);assert.equal(state.releases,0);
});
test("WhatsApp non-streaming uses the same meter and usage from the provider", async () => {
  globalThis.fetch = async () => { state.calls++; return Response.json({model:"test-model",choices:[{message:{content:"Hola"}}],usage:{prompt_tokens:100,completion_tokens:300}}); };
  const result = await metered.meteredChatCompletion({...account,channel:"whatsapp"},messages);
  assert.equal(result.tokensIn,100); assert.equal(state.used,400); assert.equal(state.reserved,0);
  assert.equal([...state.requests.values()][0].channel,"whatsapp");
});
test("exhausted or unavailable credit storage prevents any call to the provider", async () => {
  globalThis.fetch = async () => { state.calls++; return streamResponse(); };
  state.quota=0;
  await assert.rejects(collect(metered.meteredChatCompletionStream(account,messages)), error => error.code === "CREDITS_EXHAUSTED");
  state.databaseError=true;
  await assert.rejects(metered.meteredChatCompletion(account,messages), error => error.code === "CREDITS_UNAVAILABLE");
  assert.equal(state.calls,0);
});
test("definitive provider rejection releases the reservation without charging", async () => {
  globalThis.fetch = async () => { state.calls++; return new Response("unauthorized",{status:401}); };
  await assert.rejects(collect(metered.meteredChatCompletionStream(account,messages)),/401/);
  assert.equal(state.used,0); assert.equal(state.reserved,0); assert.equal(state.releases,1);
});
test("missing usage is never replaced by a chunk count or zero; the accepted request remains pending", async () => {
  globalThis.fetch = async () => streamResponse(fixture(null));
  await assert.rejects(collect(metered.meteredChatCompletionStream(account,messages)),/consumo de tokens/);
  assert.equal(state.used,0); assert.ok(state.reserved>0); assert.equal(state.releases,0);
});
test("interrupted consumption retains a pending reservation; a missing key releases it before dispatch", async () => {
  globalThis.fetch = async () => { state.calls++; return streamResponse(); };
  const stream=metered.meteredChatCompletionStream(account,messages);
  assert.equal((await stream.next()).value.type,"delta");
  await stream.return();
  assert.equal(state.used,0); assert.ok(state.reserved>0);
  delete process.env.LLM_API_KEY;
  await assert.rejects(metered.meteredChatCompletion(account,messages),/LLM_API_KEY/);
  assert.equal(state.releases,1); assert.equal(state.calls,1);
});
test("network uncertainty is not retried or refunded as if no tokens were consumed", async () => {
  globalThis.fetch = async () => { state.calls++; throw new Error("fetch failed"); };
  await assert.rejects(metered.meteredChatCompletion(account,messages),/fetch failed/);
  assert.equal(state.calls,1); assert.equal(state.releases,0); assert.ok(state.reserved>0);
});
test("near exhaustion the output budget shrinks to the available reservation", async () => {
  const {inputReservation}=await import(serverUrl);
  state.quota=inputReservation(messages)+100;
  globalThis.fetch = async (_url,options) => {
    state.body=JSON.parse(options.body);
    return streamResponse(fixture({prompt_tokens:25,completion_tokens:50}));
  };
  await collect(metered.meteredChatCompletionStream(account,messages));
  assert.equal(state.body.max_tokens,100);
  assert.equal(state.used,75); assert.equal(state.reserved,0);
});
test("a pre-aborted request never reaches the provider and releases its reservation", async () => {
  const controller=new AbortController(); controller.abort();
  globalThis.fetch = async () => { state.calls++; return streamResponse(); };
  await assert.rejects(collect(metered.meteredChatCompletionStream(account,messages,undefined,{signal:controller.signal})),error=>error.name==="AbortError");
  assert.equal(state.calls,0); assert.equal(state.reserved,0);
});
