import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { TaskManager } from "./tasks.mjs";

async function setup(t, codex, extra = {}) {
  const stateDir = await mkdtemp(path.join(tmpdir(), "chatbot-mcp-test-"));
  const manager = new TaskManager({ codex, projectRoot: path.resolve("."), stateDir, ...extra });
  t.after(async () => {
    await manager.close();
    assert.equal(path.dirname(stateDir), path.resolve(tmpdir()));
    assert.ok(path.basename(stateDir).startsWith("chatbot-mcp-test-"));
    await rm(stateDir, { recursive: true, force: true });
  });
  return manager;
}
const finishedThread = {
  async runStreamed() {
    return { events: (async function* () {
      yield { type: "thread.started", thread_id: "session-1" };
      yield { type: "item.completed", item: { type: "file_change", status: "completed", changes: [{ path: "app/page.tsx" }] } };
      yield { type: "item.completed", item: { type: "agent_message", text: "Cambio verificado." } };
      yield { type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } };
    })() };
  },
};

test("persists results and resumes only a task from the same project", async (t) => {
  let options;
  const codex = {
    startThread(value) { options = value; return finishedThread; },
    resumeThread(id, value) { assert.equal(id, "session-1"); options = value; return finishedThread; },
  };
  const manager = await setup(t, codex);
  const started = await manager.start("Revisar el proyecto", "revisar");
  await manager.active.done;
  assert.equal(options.sandboxMode, "read-only");
  const result = await manager.get(started.id);
  assert.equal(result.status, "completed");
  assert.equal(result.result, "Cambio verificado.");
  assert.deepEqual(result.files, ["app/page.tsx"]);
  const restarted = new TaskManager({ codex, projectRoot: manager.projectRoot, stateDir: manager.stateDir });
  await restarted.continue(started.id, "Continuar revisión");
  await restarted.active.done;
  assert.equal(options.workingDirectory, manager.projectRoot);
  assert.equal(options.sandboxMode, "read-only");
  await assert.rejects(manager.get("../../otro-proyecto"), /inválido/);
  const other = new TaskManager({ codex, projectRoot: path.join(manager.projectRoot, "other"), stateDir: manager.stateDir });
  await assert.rejects(other.get(started.id), /otro proyecto/);
});

test("rejects concurrent work and cancels the running turn", async (t) => {
  const codex = { startThread() { return {
    async runStreamed(_prompt, { signal }) {
      return { events: (async function* () {
        yield { type: "thread.started", thread_id: "cancel-session" };
        await new Promise((resolve) => {
          if (signal.aborted) resolve();
          else signal.addEventListener("abort", resolve, { once: true });
        });
        throw new Error("Aborted");
      })() };
    },
  }; } };
  const manager = await setup(t, codex);
  const first = manager.start("Implementar una tarea", "programar");
  await assert.rejects(manager.start("Otra tarea simultánea", "programar"), /ejecución/);
  const task = await first;
  const done = manager.active.done;
  await manager.cancel(task.id);
  await done;
  assert.equal((await manager.get(task.id)).status, "canceled");
  assert.equal(manager.active, null);
});

test("does not report success when the agent stream ends without completion", async (t) => {
  const codex = { startThread() { return { async runStreamed() { return { events: (async function* () { yield { type: "thread.started", thread_id: "incomplete" }; })() }; } }; } };
  const manager = await setup(t, codex);
  const task = await manager.start("Tarea que se interrumpe", "programar");
  await manager.active.done;
  assert.equal((await manager.get(task.id)).status, "failed");
});
