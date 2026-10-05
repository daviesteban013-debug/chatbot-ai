import test from "node:test";
import assert from "node:assert/strict";
import { assessDelivery } from "./integrations.mjs";

const goodGit = { status: "success", sha: "new", checks: [], workflow_runs: [] };
const fulfilled = (value) => ({ status: "fulfilled", value });

test("detects failed and outdated production while retaining useful GitHub data", () => {
  const result = assessDelivery(fulfilled(goodGit), fulfilled({ deployments: [{ state: "ERROR", sha: "old" }] }));
  assert.equal(result.alerts.length, 2);
  assert.equal(result.github.sha, "new");
});

test("a successful CI rerun does not keep alerting for the previous failure", () => {
  const result = assessDelivery(fulfilled({ ...goodGit, workflow_runs: [
    { workflow_id: 1, sha: "new", conclusion: "success" },
    { workflow_id: 1, sha: "new", conclusion: "failure" },
    { workflow_id: 2, sha: "old", conclusion: "failure" },
  ] }), fulfilled({ deployments: [{ state: "READY", sha: "new" }] }));
  assert.deepEqual(result.alerts, []);
  const failing = assessDelivery(fulfilled({ ...goodGit, checks: [{ conclusion: "failure" }] }), fulfilled({ deployments: [] }));
  assert.equal(failing.alerts.length, 1);
});

test("an unavailable integration is reported instead of appearing healthy", () => {
  const result = assessDelivery(fulfilled(goodGit), { status: "rejected", reason: new Error("Not authenticated") });
  assert.equal(result.vercel.error, "Not authenticated");
  assert.equal(result.alerts.length, 1);
  assert.equal(result.github.sha, "new");
});
