import assert from "node:assert/strict";
import { test } from "node:test";
import { moduleUrl } from "../lib/load-module.mjs";

const metrics = await import(await moduleUrl("lib/sales-metrics.ts"));

test("only the supported periods are accepted from the URL", () => {
  assert.equal(metrics.metricPeriod("30"), 30);
  assert.equal(metrics.metricPeriod(["90"]), 90);
  for (const value of ["14", "abc", undefined, "-7"]) assert.equal(metrics.metricPeriod(value), 7);
});

test("changes compare with the previous period without inventing a percentage", () => {
  assert.deepEqual(metrics.change(150, 100), { direction: "up", percent: 50 });
  assert.deepEqual(metrics.change(50, 100), { direction: "down", percent: -50 });
  assert.deepEqual(metrics.change(80, 0), { direction: "up", percent: null }, "growth from zero is shown as new, not +∞%");
  assert.deepEqual(metrics.change(0, 0), { direction: "flat", percent: null });
  assert.equal(metrics.ratio(61, 214), 29);
  assert.equal(metrics.ratio(1, 0), null);
});

test("axis maximums are clean numbers at or above the largest value", () => {
  assert.equal(metrics.niceMax(1040000), 2000000);
  assert.equal(metrics.niceMax(180000), 200000);
  assert.equal(metrics.niceMax(2400000), 2500000);
  assert.equal(metrics.niceMax(0), 1);
});
