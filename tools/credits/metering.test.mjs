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
  if (name === "reserve_nexo_model") {
    assert.equal(args.p_message_id,"turn-1");
    state.requests.set(args.p_id,{reserved:args.p_requested,state:"reserved",nexo:true});
    return {data:{ok:true,reservedTokens:args.p_requested},error:null};
  }
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
  if (request.nexo) {
    if(name === "settle_nexo_model"){request.state="settled";request.usage=args.p_tokens_in+args.p_tokens_out;state.settlements++;}
    else if(name === "release_nexo_model"){request.state="released";state.releases++;}
    else throw new Error(`wrong ledger ${name}`);
    return {error:null,data:null};
  }
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
const originalOpenaiKey = process.env.OPENAI_API_KEY;
beforeEach(() => {
  delete process.env.OPENAI_API_KEY;
  process.env.LLM_API_KEY = "test-placeholder"; process.env.LLM_BASE_URL = "https://provider.invalid";
  state = {quota:100000,used:0,reserved:0,settlements:0,releases:0,calls:0,requests:new Map()};
});
after(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = originalKey;
  if (originalUrl === undefined) delete process.env.LLM_BASE_URL; else process.env.LLM_BASE_URL = originalUrl;
  if (originalOpenaiKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalOpenaiKey;
});
const messages = [{role:"user",content:"Hola"}];
const account = {tenantId:"tenant-1",channel:"web"};
test("a reserved NEXO turn bypasses monthly token exhaustion but records every model call separately",async()=>{
  state.quota=0;globalThis.fetch=async()=>streamResponse();
  const turn={...account,messageReservationId:'turn-1'};
  await collect(metered.meteredChatCompletionStream(turn,messages));
  await collect(metered.meteredChatCompletionStream(turn,messages));
  assert.equal(state.settlements,2);assert.equal(state.used,0);assert.equal(state.reserved,0);
  assert.ok([...state.requests.values()].every(row=>row.nexo && row.state==='settled' && row.usage===250));
});
test("NEXO definitive failure releases technical reservation; unknown usage stays pending",async()=>{
  const turn={...account,messageReservationId:'turn-1'};
  globalThis.fetch=async()=>new Response('private-provider-body',{status:401});
  await assert.rejects(collect(metered.meteredChatCompletionStream(turn,messages)),/401/);
  assert.equal(state.releases,1);
  globalThis.fetch=async()=>streamResponse(fixture(null));
  await assert.rejects(collect(metered.meteredChatCompletionStream(turn,messages)));
  assert.equal(state.releases,1);
  assert.equal([...state.requests.values()].filter(row=>row.state==='reserved').length,1);
});
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

const crmTools = [{ type: "function", function: { name: "search_customers", description: "Buscar clientes", parameters: { type: "object", properties: { query: { type: "string" } } } } }];
const toolCall = { id: "call_crm", type: "function", function: { name: "search_customers", arguments: '{"query":"Ana"}' } };

test("OpenAI key selects Luna at the official endpoint despite legacy URL and model overrides", async () => {
  process.env.OPENAI_API_KEY = " openai-test-placeholder ";
  globalThis.fetch = async (endpoint, options) => {
    assert.equal(endpoint, "https://api.openai.com/v1/chat/completions");
    assert.equal(options.headers.Authorization, "Bearer openai-test-placeholder");
    const body = JSON.parse(options.body);
    assert.equal(body.model, "gpt-6-luna");
    assert.equal(body.reasoning_effort, "none");
    assert.equal(body.max_completion_tokens, 700);
    assert.ok(!("max_tokens" in body));
    assert.deepEqual(body.tools, crmTools);
    assert.equal(body.tool_choice, "auto");
    return Response.json({ model: "gpt-6-luna", choices: [{ message: { content: null, tool_calls: [toolCall] } }], usage: { prompt_tokens: 100, completion_tokens: 50 } });
  };
  const result = await metered.meteredChatCompletion(account, messages, crmTools, { model: "old-business-model", maxTokens: 700 });
  assert.deepEqual(result.toolCalls, [toolCall]);
  assert.equal(result.model, "gpt-6-luna");
  assert.equal(state.used, 150); assert.equal(state.settlements, 1); assert.equal(state.reserved, 0);
  assert.equal(raw.configuredModel("old-business-model"), "gpt-6-luna");
  assert.deepEqual(raw.llmStatus(), { provider: "openai", model: "gpt-6-luna", ready: true, keyVariable: "OPENAI_API_KEY" });
});

test("Luna streams CRM tool fragments and uses the reduced credit output budget", async () => {
  process.env.OPENAI_API_KEY = "openai-test-placeholder";
  const { inputReservation } = await import(serverUrl);
  state.quota = inputReservation(messages, crmTools) + 100;
  globalThis.fetch = async (endpoint, options) => {
    assert.equal(endpoint, "https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(options.body);
    assert.equal(body.max_completion_tokens, 100);
    assert.equal(body.reasoning_effort, "none");
    assert.deepEqual(body.stream_options, { include_usage: true });
    assert.deepEqual(body.tools, crmTools);
    const rows = [
      { model: "gpt-6-luna", choices: [{ delta: { tool_calls: [{ index: 0, id: "call_crm", function: { name: "search_customers", arguments: '{"query":' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"Ana"}' } }] }, finish_reason: "tool_calls" }] },
      { choices: [], usage: { prompt_tokens: 25, completion_tokens: 50 } },
    ];
    return streamResponse(rows.map(row => `data: ${JSON.stringify(row)}\n\n`).join("") + "data: [DONE]\n", true);
  };
  const events = await collect(metered.meteredChatCompletionStream(account, messages, crmTools));
  assert.deepEqual(events.find(event => event.type === "tool_calls").toolCalls, [toolCall]);
  assert.equal(events.at(-1).model, "gpt-6-luna");
  assert.equal(state.used, 75); assert.equal(state.settlements, 1); assert.equal(state.reserved, 0);
});

test("blank or missing OpenAI key retains the compatible provider", async () => {
  for (const key of [undefined, "   "]) {
    if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key;
    globalThis.fetch = async (endpoint, options) => {
      assert.equal(endpoint, "https://provider.invalid/chat/completions");
      assert.equal(options.headers.Authorization, "Bearer test-placeholder");
      const body = JSON.parse(options.body);
      assert.equal(body.model, "legacy-model");
      assert.equal(body.max_tokens, 500);
      assert.ok(!("reasoning_effort" in body));
      return streamResponse();
    };
    await collect(raw.chatCompletionStream(messages, undefined, { model: "legacy-model", maxTokens: 500 }));
    assert.equal(raw.llmStatus().provider, "compatible");
  }
});

test("OpenAI 401/429 never expose provider bodies or fall back to the compatible key", async () => {
  process.env.OPENAI_API_KEY = "openai-test-placeholder";
  for (const streaming of [false, true]) for (const status of [401, 429]) {
    const before = state.calls;
    globalThis.fetch = async endpoint => {
      state.calls++;
      assert.equal(endpoint, "https://api.openai.com/v1/chat/completions");
      return new Response("sensitive-provider-body", { status, headers: { "retry-after": "0" } });
    };
    const call = streaming ? collect(metered.meteredChatCompletionStream(account, messages)) : metered.meteredChatCompletion(account, messages);
    await assert.rejects(call, error => error.message.includes(String(status)) && !error.message.includes("sensitive-provider-body"));
    assert.equal(state.calls - before, !streaming && status === 429 ? 3 : 1);
    assert.equal(state.reserved, 0); assert.equal(state.used, 0);
  }
  assert.equal(state.releases, 4);
});
