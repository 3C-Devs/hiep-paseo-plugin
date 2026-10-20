import { test } from "node:test";
import assert from "node:assert/strict";
import { Engine, type Current } from "../server/engine";
import { Store } from "../server/store";
import { readFileSync, unlinkSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

const scope = { serverId: "host", workspaceId: "workspace", agentId: "agent" };

test("persisted reservations survive restart without replay or public file permissions", () => {
  const file = path.join(tmpdir(), `npa-test-${randomUUID()}.json`);
  try {
    const store = new Store(file);
    store.get("agent").handled.pending = "sending";
    store.save();
    const restored = new Store(file);
    assert.equal(restored.get("agent").handled.pending, "unknown");
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.ok(JSON.parse(readFileSync(file, "utf8")));
  } finally {
    unlinkSync(file);
  }
});
function fixture() {
  let current: Current = {
    epoch: "one",
    busy: false,
    complete: true,
    rows: [
      {
        type: "user_message",
        text: "Report test results. Do not commit or push.",
        id: "0",
        timestamp: 1,
      },
      {
        type: "assistant_message",
        text: "## Next Steps\n```\nprompt: Report results.\n```",
        id: "1",
        timestamp: 2,
      },
    ],
  };
  const sent: { text: string; id: string }[] = [];
  const started: { text: string; id: string }[] = [];
  let rejectSend = false;
  let duringSend: (() => void) | undefined;
  const store = new Store();
  const driver = {
    async read() {
      return structuredClone(current);
    },
    async send(_scope: unknown, text: string, id: string) {
      sent.push({ text, id });
      duringSend?.();
      if (rejectSend) throw new Error("connection lost");
    },
    async start(_scope: unknown, text: string, id: string) {
      started.push({ text, id });
      if (rejectSend) throw new Error("connection lost");
    },
  };
  const engine = new Engine(store, driver);
  return {
    engine,
    store,
    sent,
    started,
    driver,
    get current() {
      return current;
    },
    set current(value) {
      current = value;
    },
    failSend() {
      rejectSend = true;
    },
    onSend(callback: () => void) {
      duringSend = callback;
    },
  };
}
test("manual sends preserve exact text, and concurrent requests submit once", async () => {
  const f = fixture();
  const key = (await f.engine.inspect(scope)).candidates[0].key;
  const results = await Promise.allSettled([f.engine.send(scope, key), f.engine.send(scope, key)]);
  assert.deepEqual(
    results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
    [true],
  );
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].text, "Report results.");
  await assert.rejects(f.engine.send(scope, key));
});
test("legacy multiple prompts require individual sends", async () => {
  const f = fixture();
  f.current.rows[1].text =
    "## Next Steps\n```\nprompt: One\nwhy: Reason.\nprompt: Two\n  line\n```";
  const { candidates } = await f.engine.inspect(scope);
  assert.deepEqual(
    candidates.map((c) => c.why),
    ["Reason.", undefined],
  );
  const keys = candidates.map((c) => c.key);
  await assert.rejects(f.engine.send(scope, [keys[0], keys[0]]));
  await assert.rejects(f.engine.send(scope, keys), /combination/);
  assert.deepEqual(f.sent, []);
  await f.engine.send(scope, keys[0]);
  const states = (await f.engine.inspect(scope)).candidates.map((c) => c.state);
  assert.deepEqual(states, ["sent", "ready"]);
  await assert.rejects(f.engine.send(scope, keys[0]));
});
test("manual Git sends resolve their action server-side and share Send reservations", async () => {
  const f = fixture();
  f.current.rows[1].text =
    "## Next Steps\n```\nprompt: Commit the fix. Do not push.\nwhy: Save changes.\nprompt: Run tests.\n```";
  const [commit, other] = (await f.engine.inspect(scope)).candidates;
  await assert.rejects(f.engine.send(scope, [commit.key, other.key]), /individual manual send/);
  f.current.busy = true;
  await assert.rejects(f.engine.send(scope, commit.key));
  f.current.busy = false;
  assert.equal(f.sent.length, 0);
  assert.equal(await f.engine.send(scope, commit.key), true);
  assert.equal(
    f.sent[0].text,
    "/commit --no-push\nCommit the fix. Do not push.\nCommit only the described changes. Preserve unrelated work.",
  );
  await assert.rejects(f.engine.send(scope, commit.key));
  assert.equal(f.sent.length, 1);
});
test("Commit does not duplicate an existing skill and uncertain sends cannot retry", async () => {
  const f = fixture();
  f.current.rows[1].text = "## Next Steps\n```\nprompt: /commit only the fix\n```";
  const { key } = (await f.engine.inspect(scope)).candidates[0];
  f.failSend();
  assert.equal(await f.engine.send(scope, key), false);
  assert.equal(
    f.sent[0].text,
    "/commit --no-push only the fix\nCommit only the described changes. Preserve unrelated work.",
  );
  assert.equal(f.store.get(scope.agentId).handled[key], "unknown");
  await assert.rejects(f.engine.send(scope, key));
  assert.equal(f.sent.length, 1);
});
test("commit and push uses the skill; pushing an existing commit preserves the plain prompt", async () => {
  for (const text of [
    "Commit and push only the fix.",
    "Commit the button fixes and push.",
    "Push commit abc123 to origin/main.",
  ]) {
    const f = fixture();
    f.current.rows[1].text = `## Next Steps\n\`\`\`\nprompt: ${text}\n\`\`\``;
    const { key } = (await f.engine.inspect(scope)).candidates[0];
    await f.engine.send(scope, key);
    assert.equal(
      f.sent[0].text,
      text.startsWith("Commit")
        ? `/commit\n${text}\nCommit only the described changes. Preserve unrelated work.`
        : text,
    );
  }
});
test("review constraints across commas never inject the commit skill", async () => {
  for (const text of [
    "Review commit abc123. Không sửa code, commit hoặc push.",
    "Review the change. Do not edit, commit or push.",
    "Review buttons named Commit, Push.",
    "Review các nút có nhãn Commit, Push.",
    "Do not edit unrelated files, commit changes, or push them.",
    "Không sửa WIP khác, commit hoặc push.",
  ]) {
    const f = fixture();
    f.current.rows[1].text = `## Next Steps\n\`\`\`\nprompt: ${text}\n\`\`\``;
    try {
      const { key } = (await f.engine.inspect(scope)).candidates[0];
      await f.engine.send(scope, key);
      assert.deepEqual(
        f.sent.map(({ text }) => text),
        [text],
      );
    } finally {
      f.engine.close();
    }
  }
});
test("new-thread suggestions start once in a new thread and never send here", async () => {
  const f = fixture();
  f.current.rows[1].text =
    "## Next Steps\n```\nprompt: Report results.\nprompt: Audit the logs.\nthread: new\n```";
  const [here, other] = (await f.engine.inspect(scope)).candidates;
  assert.equal(here.thread, undefined);
  assert.equal(other.thread, "new");
  assert.equal(here.state, "ready");
  // A busy conversation does not block an independent thread.
  f.current.busy = true;
  assert.equal(await f.engine.start(scope, other.key), true);
  await assert.rejects(f.engine.start(scope, other.key));
  assert.deepEqual(f.started, [{ text: "Audit the logs.", id: `next-prompt-${other.key}` }]);
  assert.deepEqual(f.sent, []);
  const inspected = await f.engine.inspect(scope);
  assert.equal(inspected.candidates[1].state, "sent");
  assert.equal(inspected.note, "Started in a new thread.");
});
test("a current-task suggestion can start once in a new thread, except Git actions", async () => {
  const f = fixture();
  f.current.rows[1].text = "## Next Steps\n```\nprompt: Report results.\nprompt: Commit.\n```";
  const [here, commit] = (await f.engine.inspect(scope)).candidates;
  await assert.rejects(f.engine.start(scope, commit.key), /Git/);
  assert.equal(await f.engine.start(scope, here.key), true);
  await assert.rejects(f.engine.send(scope, here.key), /stale/);
  assert.deepEqual(f.started, [{ text: "Report results.", id: `next-prompt-${here.key}` }]);
  assert.deepEqual(f.sent, []);
});
test("an unrelated Git suggestion starts in a new thread with its own text", async () => {
  const f = fixture();
  f.current.rows[1].text =
    "## Next Steps\n```\nprompt: Report results.\nprompt: Review the janitor changes. If tests pass, commit and push only plugins/thread-janitor.\nthread: new\n```";
  const [, other] = (await f.engine.inspect(scope)).candidates;
  assert.equal(other.thread, "new");
  assert.equal(await f.engine.start(scope, other.key), true);
  assert.deepEqual(f.started, [{ text: other.text, id: `next-prompt-${other.key}` }]);
  assert.deepEqual(f.sent, []);
});
test("an unrelated Git suggestion sent here is a plain send, not /commit", async () => {
  const f = fixture();
  f.current.rows[1].text =
    "## Next Steps\n```\nprompt: Report results.\nprompt: Review the janitor changes. If tests pass, commit and push only plugins/thread-janitor.\nthread: new\n```";
  const [, other] = (await f.engine.inspect(scope)).candidates;
  assert.equal(await f.engine.send(scope, other.key), true);
  assert.deepEqual(
    f.sent.map((s) => s.text),
    [other.text],
  );
});
test("a new-thread suggestion can be sent here once by a manual send", async () => {
  const f = fixture();
  f.current.rows[1].text =
    "## Next Steps\n```\nprompt: Report results.\nprompt: Audit the logs.\nthread: new\n```";
  const [here, other] = (await f.engine.inspect(scope)).candidates;
  await assert.rejects(f.engine.send(scope, [here.key, other.key]), /new thread/);
  assert.equal(await f.engine.send(scope, other.key), true);
  await assert.rejects(f.engine.start(scope, other.key), /stale/);
  assert.deepEqual(
    f.sent.map((s) => s.text),
    ["Audit the logs."],
  );
  assert.deepEqual(f.started, []);
});
test("an uncertain new-thread start is never retried", async () => {
  const f = fixture();
  f.current.rows[1].text = "## Next Steps\n```\nprompt: Audit the logs.\nthread: new\n```";
  f.failSend();
  const { key } = (await f.engine.inspect(scope)).candidates[0];
  assert.equal(await f.engine.start(scope, key), false);
  assert.equal(f.store.get("agent").handled[key], "unknown");
  await assert.rejects(f.engine.start(scope, key));
  assert.equal(f.started.length, 1);
});
for (const [name, text] of [
  ["button names", "Commit sửa nút Edit, Push và Send."],
  ["scoped exclusion", "Commit plugin changes. Không commit WIP khác."],
  ["Push last in button list", "Commit sửa nút Edit, Send và Push."],
  ["command after comma", "Kiểm tra diff, commit phần sửa lỗi."],
  ["coordinated negation", "Commit và push bản sửa. Không commit WIP khác hay push."],
  ["command after button tests", "Run button tests, commit."],
  ["command after Vietnamese button tests", "Chạy test cho các nút, commit."],
  ["English named buttons", "Commit changes to buttons named Commit and Push."],
  ["Vietnamese named buttons", "Commit sửa các nút có nhãn Commit, Push."],
  ["English scoped edit restriction", "Without changing unrelated files, commit the fix."],
  ["Vietnamese scoped edit restriction", "Không sửa WIP khác, commit bản sửa."],
]) {
  test(`Git regression: ${name} keeps no-push payload and requires an individual send`, async () => {
    const f = fixture();
    try {
      f.current.rows[1].text = `## Next Steps\n\`\`\`\nprompt: ${text}\nprompt: Run tests.\n\`\`\``;
      const keys = (await f.engine.inspect(scope)).candidates.map((candidate) => candidate.key);
      await assert.rejects(f.engine.send(scope, keys), /individual manual send/);
      assert.equal(f.sent.length, 0);
      await f.engine.send(scope, keys[0]);
      assert.equal(
        f.sent[0].text,
        `/commit --no-push\n${text}\nCommit only the described changes. Preserve unrelated work.`,
      );
    } finally {
      f.engine.close();
    }
  });
}
test("a new turn drops the previous turn's note", async () => {
  const f = fixture();
  await f.engine.send(scope, (await f.engine.inspect(scope)).candidates[0].key);
  assert.equal((await f.engine.inspect(scope)).note, "Prompt sent.");
  f.engine.started("agent");
  f.current.rows.push(
    { type: "user_message", text: "Report results.", id: "2", timestamp: 3 },
    {
      type: "assistant_message",
      text: "## Next Steps\n```\nprompt: Report the next results.\n```",
      id: "3",
      timestamp: 4,
    },
  );
  const snapshot = await f.engine.inspect(scope);
  assert.equal(snapshot.note, "");
  assert.equal(snapshot.candidates.length, 1);
  assert.equal(snapshot.candidates[0].state, "ready");
});
test("a turn starting before the send acknowledgement leaves no note behind", async () => {
  const f = fixture();
  // The daemon starts the turn while handle.send is still awaiting its acknowledgement.
  f.onSend(() => f.engine.started("agent"));
  const key = (await f.engine.inspect(scope)).candidates[0].key;
  await f.engine.send(scope, key);
  assert.equal(f.sent.length, 1);
  assert.equal(f.store.get("agent").handled[key], "sent");
  assert.equal((await f.engine.inspect(scope)).note, "");
  f.current.rows.push(
    { type: "user_message", text: "Report results.", id: "2", timestamp: 3 },
    {
      type: "assistant_message",
      text: "## Next Steps\n```\nprompt: Report the next results.\n```",
      id: "3",
      timestamp: 4,
    },
  );
  const snapshot = await f.engine.inspect(scope);
  assert.equal(snapshot.note, "");
  assert.equal(snapshot.candidates.length, 1);
  assert.equal(snapshot.candidates[0].state, "ready");
});
test("reject stale, busy, incomplete, and non-assistant suggestions", async () => {
  const f = fixture();
  const key = (await f.engine.inspect(scope)).candidates[0].key;
  f.current.busy = true;
  await assert.rejects(f.engine.send(scope, key));
  f.current.busy = false;
  f.current.rows.push({ type: "user_message", text: "Stop.", id: "2", timestamp: 3 });
  await assert.rejects(f.engine.send(scope, key));
  assert.equal(f.sent.length, 0);
  f.current.rows.pop();
  f.current.complete = false;
  assert.equal((await f.engine.inspect(scope)).candidates.length, 0);
  f.current.complete = true;
  f.current.rows[1].type = "tool_call";
  assert.equal((await f.engine.inspect(scope)).candidates.length, 0);
});
test("ambiguous send is retained and cannot retry after engine recreation", async () => {
  const f = fixture();
  f.failSend();
  const key = (await f.engine.inspect(scope)).candidates[0].key;
  await f.engine.send(scope, key);
  assert.equal(f.store.get("agent").handled[key], "unknown");
  const restarted = new Engine(f.store, f.driver);
  await assert.rejects(restarted.send(scope, key));
  assert.equal(f.sent.length, 1);
});
