import assert from "node:assert/strict";
import { test } from "node:test";
import { moduleUrl } from "../lib/load-module.mjs";

const { diffPulse, selectAlerts, defaultSettings, parseSettings, isQuiet, dueRoutines, buildEvening, buildWeekly, pulseSchema } = await import(await moduleUrl("lib/proactive.ts"));

const id = n => `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`;
const pulse = (extra = {}) => pulseSchema.parse({ at: "2026-10-14T15:00:00Z", handoffs: [], approvals: [], payments: [], sales: [], stockouts: [], tasks: [], ...extra });
const on = { ...defaultSettings, alerts: true };
// 15:00 UTC = 10:00 a. m. in Bogotá (UTC-5).
const morning = Date.parse("2026-10-14T15:00:00Z");

test("turning alerts on learns the current state silently; only later events are announced, once", () => {
  const first = diffPulse(pulse({ handoffs: [{ id: id(1), at: "2026-10-14T14:00:00Z", customer: "Ana" }] }), null, morning);
  assert.deepEqual(first.fresh, [], "old cases do not flood the bubble");
  const second = diffPulse(pulse({
    handoffs: [{ id: id(1), at: "2026-10-14T14:00:00Z", customer: "Ana" }, { id: id(2), at: "2026-10-14T14:59:00Z", customer: "Luis" }],
    payments: [{ id: id(3), at: "2026-10-14T14:58:00Z", customer: "Ana", total: 189000 }],
  }), first.seen, morning + 45000);
  assert.deepEqual(second.fresh.map(alert => alert.text), ["Luis espera un asesor", "Ana pagó $ 189.000"]);
  assert.equal(second.fresh[0].href, `/dashboard/handoffs/${id(2)}`);
  const third = diffPulse(pulse({ handoffs: [{ id: id(2), at: "2026-10-14T14:59:00Z", customer: "Luis" }] }), second.seen, morning + 90000);
  assert.deepEqual(third.fresh, [], "an open case is announced only once");
});

test("a product that sells out again after two days is announced again", () => {
  const out = pulse({ stockouts: [{ id: id(4), label: "Tenis · 40" }] });
  const start = diffPulse(pulse(), null, morning);
  const first = diffPulse(out, start.seen, morning);
  assert.equal(first.fresh[0].text, "Se agotó Tenis · 40");
  const restocked = diffPulse(pulse(), first.seen, morning + 3 * 86400000);
  assert.equal(diffPulse(out, restocked.seen, morning + 3 * 86400000 + 1).fresh.length, 1);
});

test("only the chosen kinds are shown, and three or more of a kind become one alert", () => {
  const sales = [1, 2, 3].map(n => ({ key: `sale:${n}`, kind: "sale", text: "x", action: "Ver pedido", href: "/dashboard/orders/x", at: "", amount: 100000 }));
  const selected = selectAlerts([...sales, { key: "stock:1", kind: "stock", text: "Se agotó Gorra", action: "", href: "/dashboard/catalog", at: "" }], on);
  assert.equal(selected.length, 2);
  assert.equal(selected[0].text, "NEXO vendió 3 pedidos por $ 300.000");
  assert.equal(selectAlerts(sales, { ...on, kinds: { ...on.kinds, sale: false } }).length, 0);
});

test("finished jobs are announced once with their summary and open the job", () => {
  const start = diffPulse(pulse(), null, morning);
  const done = pulse({ jobs: [{ id: id(9), kind: "collections_review", status: "done", at: "2026-10-14T14:59:00Z", summary: "Revisé 4 pedidos" }, { id: id(8), kind: "catalog_import", status: "failed", at: "2026-10-14T14:58:00Z", summary: null }] });
  const fresh = diffPulse(done, start.seen, morning + 1000).fresh;
  assert.deepEqual(fresh.map(alert => [alert.kind, alert.text, alert.href, alert.action]), [
    ["job", "Terminé: Revisé 4 pedidos", `/dashboard/jobs/${id(9)}`, "Ver resultado"], ["job", "No pude terminar: Importar catálogo", `/dashboard/jobs/${id(8)}`, "Ver detalle"]]);
  assert.equal(selectAlerts(fresh, on).length, 2, "job alerts are on by default");
  assert.equal(diffPulse(done, diffPulse(done, start.seen, morning + 1000).seen, morning + 2000).fresh.length, 0, "announced once");
  assert.equal(parseSettings({ ...on, kinds: { handoff: true, approval: true, payment: true, sale: true, stock: true, task: true } }).kinds.job, true, "settings saved before jobs existed still parse");
  assert.deepEqual(pulse().jobs, [], "pulses from older servers parse without jobs");
});

test("settings start off, survive bad storage, and quiet hours cross midnight in Colombia time", () => {
  assert.equal(defaultSettings.alerts, false);
  assert.ok(Object.values(defaultSettings.routines).every(routine => !routine.enabled));
  assert.deepEqual(parseSettings({ alerts: "yes" }), defaultSettings);
  assert.equal(isQuiet(on, Date.parse("2026-10-15T03:00:00Z")), true, "10 p. m. in Bogotá");
  assert.equal(isQuiet(on, Date.parse("2026-10-14T11:30:00Z")), true, "6:30 a. m. in Bogotá");
  assert.equal(isQuiet(on, morning), false);
  assert.equal(isQuiet({ ...on, quiet: { ...on.quiet, enabled: false } }, Date.parse("2026-10-15T03:00:00Z")), false);
});

test("routines arrive once a day at their time, up to four hours late; the weekly one only on Mondays", () => {
  const settings = { ...on, routines: { morning: { enabled: true, time: "08:00" }, evening: { enabled: true, time: "18:00" }, weekly: { enabled: true, time: "08:30" } } };
  assert.deepEqual(dueRoutines(settings, morning, {}), ["morning"], "Wednesday 10 a. m.: morning only");
  assert.deepEqual(dueRoutines(settings, morning, { morning: "2026-10-14" }), []);
  assert.deepEqual(dueRoutines(settings, Date.parse("2026-10-14T21:00:00Z"), {}), [], "4 p. m.: too late for the morning, too early for the evening");
  assert.deepEqual(dueRoutines(settings, Date.parse("2026-10-12T14:00:00Z"), {}), ["morning", "weekly"], "Monday 9 a. m.");
  assert.deepEqual(dueRoutines(defaultSettings, morning, {}), []);
});

const window = (orders = 0, sales = 0, extra = {}) => ({ conversations: 0, converted: 0, orders, sales, agentOrders: orders, agentSales: sales, paidOrders: 0, collected: 0, recoveredOrders: 0, recovered: 0, handoffs: 0, avgReplyMs: null, ...extra });

test("evening and weekly summaries state facts without inventing activity", () => {
  const evening = buildEvening({ date: "2026-10-14", today: window(4, 600000, { paidOrders: 2, collected: 300000 }), yesterday: window(), dayBefore: window(),
    unpaid: { count: 2, total: 300000, oldest: null }, pendingApproval: 0, handoffs: { count: 1, oldest: null, customer: "Ana" }, lowStock: { count: 0, outOfStock: 0, items: [] }, tasksDue: 0 });
  assert.deepEqual(evening.items.map(item => item.id), ["today", "collected", "unpaid", "handoffs"]);
  assert.match(evening.headline, /^Hoy vendiste \$\s?600\.000 en 4 pedidos\. NEXO cerró todos\./);
  const weekly = buildWeekly({ days: 7, since: "", current: window(10, 2000000, { collected: 1500000 }), previous: window(8, 1600000), daily: [], topProducts: [{ name: "Tenis Urban", qty: 6, sales: 1134000 }] });
  assert.match(weekly.items[0].text, /^Esta semana vendiste \$\s?2\.000\.000 en 10 pedidos \(25% más que la anterior\)\.$/);
  assert.equal(weekly.items.at(-1).text, "Lo más vendido: Tenis Urban (6 u).");
  assert.equal(buildWeekly({ days: 7, since: "", current: window(), previous: window(), daily: [], topProducts: [] }).items[0].text, "Esta semana no hubo ventas confirmadas.");
});
