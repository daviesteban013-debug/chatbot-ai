import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { moduleUrl } from "../lib/load-module.mjs";

const url = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const portal = await import(await moduleUrl("lib/onboarding-portal.ts"));
const { PORTAL_SCENES, PORTAL_TOTAL, fillLine, afterLine, describeAnswer, validateAnswer, typingSchedule, portalSubmission, portalSummary, portalDefaults } = portal;
const complete = { agentName: "Lía", displayName: "David", businessName: "Bellísima", businessType: "Belleza", city: "Medellín", tone: "divertido", accent: "#22d3ee", voice: true, maxDiscountPct: 10, autoConfirmMaxTotal: 200000, rules: "" };

test("the portal asks eleven things once each, starting with Zorax's own name and ending with the rules", () => {
  assert.equal(PORTAL_TOTAL, 11);
  assert.deepEqual([...new Set(PORTAL_SCENES.map(scene => scene.key))].length, 11);
  assert.equal(PORTAL_SCENES[0].key, "agentName"); assert.equal(PORTAL_SCENES.at(-1).key, "rules");
  assert.ok(PORTAL_SCENES.every(scene => scene.say.length > 10 && scene.title));
  assert.ok(PORTAL_SCENES.find(scene => scene.key === "accent").chips.includes("#22d3ee"), "the cyan from the reference HUD is a choice");
});

test("Zorax's lines use what it already knows and repeat each answer the way a person would say it", () => {
  assert.equal(fillLine("Hola {you}, soy {agent} de {store}.", { agentName: " Lía ", displayName: "David", businessName: "Bellísima" }), "Hola David, soy Lía de Bellísima.");
  assert.equal(fillLine("Hola {you}, soy {agent} de {store}.", {}), "Hola , soy Zorax de tu tienda.".replace("Hola ,", "Hola ,"));
  assert.equal(afterLine(PORTAL_SCENES[0], { agentName: "Lía" }, "Lía"), "Me gusta. Desde ahora soy Lía.");
  assert.equal(afterLine(PORTAL_SCENES.find(s => s.key === "voice"), complete, false), "Entendido. Trabajaré en silencio.");
  assert.equal(afterLine(PORTAL_SCENES.find(s => s.key === "maxDiscountPct"), complete, 0), "Sin descuentos por mi cuenta. Cualquier rebaja pasa por ti.");
  assert.match(afterLine(PORTAL_SCENES.find(s => s.key === "autoConfirmMaxTotal"), complete, 200000), /\$200\.000/);
  assert.equal(describeAnswer("accent", "#22d3ee"), "Cian"); assert.equal(describeAnswer("tone", "directo"), "Directo");
  assert.equal(describeAnswer("rules", "  "), "Sin reglas por ahora"); assert.equal(describeAnswer("voice", true), "Con voz");
});

test("answers are checked before Zorax accepts them, and the final submission is strict", () => {
  const scene = key => PORTAL_SCENES.find(item => item.key === key);
  assert.equal(validateAnswer(scene("agentName"), "Lía"), null);
  assert.match(validateAnswer(scene("agentName"), "Jarvis"), /reservado/);
  assert.match(validateAnswer(scene("agentName"), "L"), /2 a 24/);
  assert.match(validateAnswer(scene("displayName"), "   "), /llamarte/);
  assert.equal(validateAnswer(scene("rules"), ""), null);
  assert.match(validateAnswer(scene("rules"), "x".repeat(2001)), /2 000/);
  assert.equal(validateAnswer(scene("accent"), "#22d3ee"), null); assert.ok(validateAnswer(scene("accent"), "#000000"));
  assert.equal(validateAnswer(scene("autoConfirmMaxTotal"), 200000), null); assert.ok(validateAnswer(scene("autoConfirmMaxTotal"), -1));
  assert.equal(portalSubmission.safeParse(complete).success, true);
  assert.equal(portalSubmission.safeParse({ ...complete, tenant_id: "x" }).success, false, "no extra keys");
  assert.equal(portalSubmission.safeParse({ ...complete, tone: "sarcastico" }).success, false);
  assert.equal(portalSubmission.safeParse({ ...portalDefaults }).success, false, "defaults alone are not a finished portal");
  assert.deepEqual(portalSummary(complete).map(item => item.label), ["Agente", "Te llamo", "Tienda", "Ciudad", "Personalidad", "Color", "Voz", "Límites"]);
});

test("typing is quick and breathes after each sentence", () => {
  const schedule = typingSchedule("Hola. ¿Qué tal?");
  assert.equal(schedule.length, "Hola. ¿Qué tal?".length);
  assert.ok(schedule.every((at, index) => index === 0 || at > schedule[index - 1]));
  assert.equal(schedule[4] - schedule[3], 18 + 220, "a pause after the period");
  assert.equal(schedule[6] - schedule[5], 18);
});

// ---------- The server action ----------
let state;
globalThis.__portalState = () => state;
beforeEach(() => { state = { user: { id: "user-1", email: "d@x.co", user_metadata: { jarvis_personalization: { displayName: "", voice: { enabled: false, engine: "browser" } } } }, tenant: { tenantId: "tenant-1", role: "owner", tenant: null }, writes: [], agents: [], configs: [], updated: null, cookies: [] }; });
const table = name => { const q = { filters: [], select() { return q; }, eq(key, value) { q.filters.push([key, value]); return q; }, limit() { return q; },
  async maybeSingle() { const s = globalThis.__portalState(); return { data: name === "agents" ? s.agents[0] ?? null : name === "jarvis_configs" ? s.configs[0] ?? null : null, error: null }; },
  update(values) { const s = globalThis.__portalState(); s.writes.push({ table: name, op: "update", values }); return q; },
  insert(values) { const s = globalThis.__portalState(); s.writes.push({ table: name, op: "insert", values }); return q; },
  upsert(values) { const s = globalThis.__portalState(); s.writes.push({ table: name, op: "upsert", values }); return q; },
  then(resolve, reject) { return Promise.resolve({ data: null, error: null }).then(resolve, reject); } }; return q; };
const { savePortal, interpretPortalAnswer } = await import(await moduleUrl("app/(onboarding)/onboarding/actions.ts", {
  "@/lib/llm/client": url("export const llmStatus=()=>({ready:Boolean(globalThis.__portalState().llm)});export const chatCompletion=async(messages)=>{const s=globalThis.__portalState();s.llmCalls=(s.llmCalls||0)+1;s.lastMessages=messages;if(s.llm.fail)throw new Error('down');return {content:s.llm.content,toolCalls:[],tokensIn:1,tokensOut:1,latencyMs:1,model:'stub'};};"),
  "next/headers": url("export const cookies=async()=>({set:(name,value,options)=>globalThis.__portalState().cookies.push({name,value,options})});"),
  "@/lib/supabase/admin": url(`export const createAdminClient=()=>({from:${table.toString()}});`),
  "@/lib/supabase/server": url("export const createClient=async()=>({auth:{updateUser:async data=>{globalThis.__portalState().updated=data;return {error:null};}}});"),
  "@/lib/auth": url("export const getCurrentUser=async()=>globalThis.__portalState().user;export const getCurrentTenant=async()=>globalThis.__portalState().tenant;"),
}));

test("the owner's answers personalize the store, the WhatsApp seller, Zorax's identity and the person's profile at once", async () => {
  const result = await savePortal(complete);
  assert.deepEqual(result, { ok: true });
  const [tenant, agent, config] = state.writes;
  assert.deepEqual([tenant.table, tenant.values], ["tenants", { name: "Bellísima" }]);
  assert.equal(agent.table, "agents"); assert.equal(agent.op, "insert");
  assert.equal(agent.values.name, "Lía"); assert.equal(agent.values.tone, "divertido"); assert.equal(agent.values.onboarding_completed, true); assert.equal(agent.values.mode, "autonomous");
  assert.equal(agent.values.max_discount_pct, 10); assert.equal(agent.values.auto_confirm_max_total, 200000);
  assert.deepEqual(agent.values.business_rules, { tipo_negocio: "Belleza", ciudad: "Medellín", pais: "Colombia", descuento_max_pct: 10, auto_confirmar_hasta_cop: 200000, reglas: null });
  assert.match(agent.values.system_prompt, /^Eres Lía, el asistente virtual de Bellísima\./); assert.match(agent.values.system_prompt, /Tu tono es divertido/);
  assert.equal(config.table, "jarvis_configs"); assert.equal(config.op, "upsert");
  assert.deepEqual([config.values.config.name, config.values.config.business, config.values.config.tone, config.values.config.accent], ["Lía", "Bellísima", "divertido", "#22d3ee"]);
  assert.equal(state.updated.data.jarvis_personalization.displayName, "David");
  assert.equal(state.updated.data.jarvis_personalization.voice.enabled, true);
  assert.equal(state.updated.data.jarvis_personalization.voice.engine, "browser", "the rest of the voice profile is kept");
  assert.deepEqual(state.cookies.map(cookie => [cookie.name, cookie.value, cookie.options.httpOnly]), [["onboarding_done", "user-1", true]]);
});

test("replaying keeps the existing agent and Zorax's other settings; only the owner may run it", async () => {
  state.agents = [{ id: "agent-1", mode: "copilot", business_rules: { sales_payments: { link_url: "https://pay.test" } } }];
  state.configs = [{ config: { welcome: "Hola, soy {agente}", maxDiscount: 25, abilities: ["catalogo"] } }];
  assert.deepEqual(await savePortal({ ...complete, rules: "Envío gratis desde $150.000" }), { ok: true });
  const agent = state.writes.find(write => write.table === "agents");
  assert.equal(agent.op, "update"); assert.equal(agent.values.mode, "copilot");
  assert.equal(agent.values.business_rules.sales_payments.link_url, "https://pay.test"); assert.equal(agent.values.business_rules.reglas, "Envío gratis desde $150.000");
  const config = state.writes.find(write => write.table === "jarvis_configs").values.config;
  assert.equal(config.welcome, "Hola, soy {agente}"); assert.equal(config.maxDiscount, 25); assert.equal(config.accent, "#22d3ee");
  state.writes = []; state.tenant.role = "agent";
  assert.match((await savePortal(complete)).error, /dueño/); assert.equal(state.writes.length, 0);
  state.tenant.role = "owner";
  assert.match((await savePortal({ ...complete, agentName: "Jarvis" })).error, /Revisa/);
  assert.match((await savePortal({ ...complete, accent: "#000000" })).error, /Revisa/);
  state.user = null;
  assert.match((await savePortal(complete)).error, /sesión/);
});

// ---------- The handoff to the CRM ----------
const arrival = await import(await moduleUrl("lib/arrival.ts"));
test("the portal leaves a short note for the CRM: read once, only while fresh, never trusted beyond presentation", () => {
  const store = new Map();
  const storage = { setItem: (key, value) => store.set(key, value), getItem: key => store.has(key) ? store.get(key) : null, removeItem: key => store.delete(key) };
  arrival.rememberArrival(storage, { agent: "Lía", you: "David", accent: "#22d3ee" }, 1_000);
  assert.deepEqual(arrival.takeArrival(storage, 2_000), { agent: "Lía", you: "David", accent: "#22d3ee", at: 1_000 });
  assert.equal(arrival.takeArrival(storage, 2_000), null, "taken once");
  arrival.rememberArrival(storage, { agent: "Lía", you: "David", accent: "#22d3ee" }, 1_000);
  assert.equal(arrival.takeArrival(storage, 1_000 + arrival.ARRIVAL_MAX_AGE_MS + 1), null, "stale notes are ignored");
  assert.equal(arrival.parseArrival('{"agent":"Lía","you":"David","accent":"red","at":1}', 2), null, "colors must be hex");
  assert.equal(arrival.parseArrival('{"agent":"Lía","you":"David","accent":"#22d3ee","at":1,"role":"owner"}', 2), null, "no extra keys");
  assert.equal(arrival.parseArrival("not json", 2), null);
  assert.equal(arrival.parseArrival('{"agent":"Lía","you":"David","accent":"#22d3ee","at":5000}', 2), null, "nothing from the future");
  const throwing = { setItem() { throw new Error("quota"); }, getItem() { throw new Error("blocked"); }, removeItem() {} };
  assert.doesNotThrow(() => arrival.rememberArrival(throwing, { agent: "Lía", you: "", accent: "#facc15" }));
  assert.equal(arrival.takeArrival(throwing), null);
  assert.equal(arrival.arrivalGreeting({ you: "David" }), "Ya estoy aquí, David. Este es mi puesto: desde aquí hablamos y manejo tu CRM. ¿Por dónde empezamos?");
  assert.match(arrival.arrivalGreeting({ you: "  " }), /^Ya estoy aquí\. /);
});

// ---------- Spoken answers ----------
const { spokenNumber, cleanSpokenText, parseSpokenAnswer } = portal;
const sceneOf = key => PORTAL_SCENES.find(item => item.key === key);
test("spoken amounts in Colombian Spanish become numbers", () => {
  assert.equal(spokenNumber("doscientos mil"), 200000);
  assert.equal(spokenNumber("doscientos cincuenta mil pesos"), 250000);
  assert.equal(spokenNumber("200 mil"), 200000);
  assert.equal(spokenNumber("1.500.000"), 1500000);
  assert.equal(spokenNumber("medio millón"), 500000);
  assert.equal(spokenNumber("un millón y medio"), 1000000, "the half is ignored, not misread");
  assert.equal(spokenNumber("quince por ciento"), 15);
  assert.equal(spokenNumber("el 10%"), 10);
  assert.equal(spokenNumber("300k"), 300000);
  assert.equal(spokenNumber("siempre pregúntame"), null);
});
test("lead-ins are stripped from spoken names and the rest is tidied", () => {
  assert.equal(cleanSpokenText("agentName", "eh, quiero que te llames Lía"), "Lía");
  assert.equal(cleanSpokenText("agentName", "ponte Max"), "Max");
  assert.equal(cleanSpokenText("displayName", "me llamo David pero dime jefe"), "David Pero Dime Jefe", "the model handles the nuance; locally the words stay");
  assert.equal(cleanSpokenText("displayName", "dime jefe"), "Jefe");
  assert.equal(cleanSpokenText("businessName", "la tienda se llama Bellísima Bags"), "Bellísima Bags");
  assert.equal(cleanSpokenText("businessType", "vendemos ropa y accesorios"), "Ropa y accesorios");
  assert.equal(cleanSpokenText("city", "estamos en medellín"), "Medellín");
  assert.equal(cleanSpokenText("city", "Bogotá"), "Bogotá");
});
test("choices, yes or no, percentages and amounts are read without the model; unclear answers ask again", () => {
  assert.deepEqual(parseSpokenAnswer(sceneOf("tone"), "que sea divertido, con humor"), { ok: true, value: "divertido" });
  assert.deepEqual(parseSpokenAnswer(sceneOf("tone"), "formal"), { ok: true, value: "profesional" });
  assert.deepEqual(parseSpokenAnswer(sceneOf("tone"), "al grano"), { ok: true, value: "directo" });
  assert.equal(parseSpokenAnswer(sceneOf("tone"), "no sé").ok, false);
  assert.deepEqual(parseSpokenAnswer(sceneOf("accent"), "el morado"), { ok: true, value: "#a78bfa" });
  assert.deepEqual(parseSpokenAnswer(sceneOf("accent"), "azul cielo"), { ok: true, value: "#38bdf8" });
  assert.deepEqual(parseSpokenAnswer(sceneOf("voice"), "sí, háblame"), { ok: true, value: true });
  assert.deepEqual(parseSpokenAnswer(sceneOf("voice"), "no, solo texto"), { ok: true, value: false });
  assert.deepEqual(parseSpokenAnswer(sceneOf("voice"), "mejor no"), { ok: true, value: false });
  assert.deepEqual(parseSpokenAnswer(sceneOf("maxDiscountPct"), "hasta el quince por ciento"), { ok: true, value: 15 });
  assert.deepEqual(parseSpokenAnswer(sceneOf("maxDiscountPct"), "sin descuentos"), { ok: true, value: 0 });
  assert.equal(parseSpokenAnswer(sceneOf("maxDiscountPct"), "cincuenta").ok, false, "above the allowed range");
  assert.deepEqual(parseSpokenAnswer(sceneOf("autoConfirmMaxTotal"), "hasta trescientos mil"), { ok: true, value: 300000 });
  assert.deepEqual(parseSpokenAnswer(sceneOf("autoConfirmMaxTotal"), "siempre pregúntame"), { ok: true, value: 0 });
  assert.equal(parseSpokenAnswer(sceneOf("autoConfirmMaxTotal"), "doscientos").ok, false, "too small to be pesos");
  assert.deepEqual(parseSpokenAnswer(sceneOf("rules"), "no, ninguna por ahora"), { ok: true, value: "" });
  assert.deepEqual(parseSpokenAnswer(sceneOf("rules"), "envío gratis desde cien mil y cambios hasta cinco días"), { ok: true, value: "Envío gratis desde cien mil y cambios hasta cinco días" });
  assert.deepEqual(parseSpokenAnswer(sceneOf("agentName"), "llámate Nova"), { ok: true, value: "Nova" });
  assert.equal(parseSpokenAnswer(sceneOf("agentName"), "Jarvis").ok, false, "the reserved name is refused out loud too");
  assert.equal(parseSpokenAnswer(sceneOf("agentName"), "").ok, false);
});
test("the interpreter signs in, reads choices locally and sends only free text to the model", async () => {
  state.llm = { content: '{"value": "Lía"}' };
  assert.deepEqual(await interpretPortalAnswer({ key: "tone", transcript: "divertido" }), { ok: true, value: "divertido" });
  assert.equal(state.llmCalls ?? 0, 0, "choices never reach the model");
  assert.deepEqual(await interpretPortalAnswer({ key: "agentName", transcript: "eh quiero que te llames Lía", answers: { displayName: "David" } }), { ok: true, value: "Lía" });
  assert.equal(state.llmCalls, 1);
  assert.ok(state.lastMessages[1].content.includes("quiero que te llames Lía"));
  state.llm = { content: '{"value": null}' };
  const again = await interpretPortalAnswer({ key: "displayName", transcript: "no sé, dame ideas" });
  assert.equal(again.ok, false); assert.ok(again.reply.includes("¿Y a ti cómo te digo?"), "asks the same question again");
  state.llm = { content: '{"value": "J"}' };
  assert.deepEqual(await interpretPortalAnswer({ key: "agentName", transcript: "ponte Max" }), { ok: true, value: "Max" }, "an invalid model value falls back to the local reading");
  state.llm = { fail: true };
  assert.deepEqual(await interpretPortalAnswer({ key: "city", transcript: "estamos en Cali" }), { ok: true, value: "Cali" }, "a model outage falls back to the local reading");
  state.llm = null;
  assert.deepEqual(await interpretPortalAnswer({ key: "businessName", transcript: "se llama Bellísima" }), { ok: true, value: "Bellísima" }, "no model configured: local reading");
  assert.equal((await interpretPortalAnswer({ key: "tone", transcript: "x".repeat(301) })).ok, false);
  assert.equal((await interpretPortalAnswer({ key: "secret", transcript: "hola" })).ok, false);
  state.user = null;
  assert.ok((await interpretPortalAnswer({ key: "tone", transcript: "directo" })).reply.includes("sesión"));
});
