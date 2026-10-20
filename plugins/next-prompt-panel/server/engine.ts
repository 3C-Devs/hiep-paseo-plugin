import { createHash } from "node:crypto";
import type { Candidate, Scope, Snapshot } from "../shared/contracts";
import { gitAction, joinPrompts, parsePrompts } from "../shared/prompts";
import { selectionAllowed } from "../shared/next-prompts";
import { Store } from "./store";

export type Row = {
  type: string;
  text?: string;
  id: string;
  messageId?: string;
  timestamp: number;
};
export type Current = { busy: boolean; epoch: string; rows: Row[]; complete: boolean };
export type Driver = {
  read(scope: Scope): Promise<Current>;
  send(scope: Scope, text: string, id: string, canSend: () => boolean): Promise<void>;
  /** Creates a separate conversation with the source conversation's settings. */
  start(scope: Scope, text: string, id: string): Promise<void>;
};
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export class Engine {
  private locks = new Set<string>();
  private generations = new Map<string, number>();
  private notes = new Map<string, { generation: number; text: string }>();
  private stopped = false;
  constructor(
    readonly store: Store,
    private driver: Driver,
  ) {}

  private gen(id: string) {
    return this.generations.get(id) ?? 0;
  }
  // A note describes one turn. Stamping the turn it was computed for keeps a late
  // acknowledgement, which can land after the next turn already started, from surfacing there.
  private note(id: string, text: string, generation = this.gen(id)) {
    this.notes.set(id, { generation, text });
  }

  private candidates(scope: Scope, current: Current): Candidate[] {
    const user = current.rows.findLastIndex((r) => r.type === "user_message");
    if (user < 0 || !current.complete) return [];
    // Only the last assistant response can offer a continuation, never tool output.
    const row = current.rows.findLast((r, i) => i > user && r.type === "assistant_message");
    if (!row?.text) return [];
    return parsePrompts(row.text).flatMap(
      ({ block, prompts, whys, threads, suggestions, declaration }, b) =>
        prompts.map((text, p) => {
          const identity = [scope.agentId, current.epoch, row.id, b, p, text];
          if (declaration) identity.push(block);
          const key = hash(JSON.stringify(identity));
          return {
            key,
            block,
            text,
            why: whys[p] || undefined,
            source: row.text!,
            timestamp: row.timestamp,
            after: current.rows[user].timestamp,
            state: this.store.get(scope.agentId).handled[key] ?? "ready",
            ...(threads[p] ? { thread: "new" as const } : {}),
            ...(suggestions?.[p] ? { suggestion: true } : {}),
            ...(declaration?.goal ? { goal: declaration.goal } : {}),
            ...(declaration
              ? {
                  selection: {
                    id: declaration.prompts[p].id,
                    blockKey: hash(
                      JSON.stringify([scope.agentId, current.epoch, row.id, b, block]),
                    ),
                    exclusiveGroups: declaration.exclusiveGroups,
                    allowedCombinations: declaration.allowedCombinations,
                  },
                }
              : {}),
          };
        }),
    );
  }

  async inspect(scope: Scope): Promise<Snapshot> {
    const current = await this.driver.read(scope);
    const note = this.notes.get(scope.agentId);
    return {
      busy: current.busy || this.locks.has(scope.agentId),
      note: note?.generation === this.gen(scope.agentId) ? note.text : "",
      candidates: this.candidates(scope, current),
    };
  }
  private invalidate(id: string) {
    // The note describes one turn only; it must never outlive it on a later prompt block.
    this.notes.delete(id);
    this.generations.set(id, (this.generations.get(id) ?? 0) + 1);
  }
  started(id: string) {
    if (this.store.data[id]) this.invalidate(id);
  }

  async send(scope: Scope, key: string | string[]): Promise<boolean> {
    const keys = typeof key === "string" ? [key] : key;
    if (this.stopped || this.locks.has(scope.agentId)) throw new Error("Send already in progress.");
    this.locks.add(scope.agentId);
    try {
      const sourceGeneration = this.generations.get(scope.agentId);
      const current = await this.driver.read(scope);
      if (sourceGeneration !== this.generations.get(scope.agentId))
        throw new Error("Conversation changed.");
      const entry = this.store.get(scope.agentId);
      const all = this.candidates(scope, current);
      const picked = all.filter((c) => keys.includes(c.key) && c.state === "ready");
      if (
        current.busy ||
        !keys.length ||
        new Set(keys).size !== keys.length ||
        picked.length !== keys.length
      )
        throw new Error("Prompt is stale, busy, or already submitted.");
      // Only a manual Cmd-click sends an unrelated suggestion here, and only on its own.
      if (picked.some((c) => c.thread) && picked.length !== 1)
        throw new Error("Unrelated suggestions start in a new thread.");
      let text = joinPrompts(picked.map((c) => c.text));
      // Unrelated work sent here is a plain Send; only current-task Git actions become /commit.
      const actions = picked.map((candidate) =>
        candidate.thread ? null : gitAction(candidate.text),
      );
      if (actions.some(Boolean)) {
        if (picked.length !== 1)
          throw new Error("Git suggestions require an individual manual send.");
        text = actions[0]!.prompt;
      }
      if (!selectionAllowed(picked))
        throw new Error("Prompt combination is not declared or is mutually exclusive.");
      // Persist reservation before dispatch. An uncertain acknowledgement is never retried.
      for (const k of keys) entry.handled[k] = "sending";
      const messageId = `next-prompt-${keys.length === 1 ? keys[0] : hash(keys.join("\n"))}`;
      this.invalidate(scope.agentId);
      this.store.save();
      // The turn can start before the acknowledgement returns; this note belongs to the turn
      // the prompt was dispatched from, never to the one it launches.
      const stamp = this.gen(scope.agentId);
      try {
        const dispatchGeneration = this.generations.get(scope.agentId);
        await this.driver.send(
          scope,
          text,
          messageId,
          () => !this.stopped && dispatchGeneration === this.generations.get(scope.agentId),
        );
        for (const k of keys) entry.handled[k] = "sent";
        this.note(scope.agentId, "Prompt sent.", stamp);
        return true;
      } catch {
        for (const k of keys) entry.handled[k] = "unknown";
        this.note(
          scope.agentId,
          "Send acknowledgement unknown. Check the conversation; no automatic retry.",
          stamp,
        );
        return false;
      } finally {
        this.store.save();
      }
    } finally {
      this.locks.delete(scope.agentId);
    }
  }

  /** Starts a suggestion as a new conversation; this conversation stays unchanged. */
  async start(scope: Scope, key: string): Promise<boolean> {
    if (this.stopped || this.locks.has(scope.agentId)) throw new Error("Send already in progress.");
    this.locks.add(scope.agentId);
    try {
      const current = await this.driver.read(scope);
      const candidate = this.candidates(scope, current).find(
        (c) => c.key === key && c.state === "ready",
      );
      if (!candidate) throw new Error("Prompt is stale or already started.");
      // A current-task Git action needs this conversation's work; a new thread has none of it.
      // An unrelated suggestion carries its own context, so it may commit in its own thread.
      if (!candidate.thread && gitAction(candidate.text))
        throw new Error("Git suggestions require an individual manual send.");
      const entry = this.store.get(scope.agentId);
      // Persist reservation before dispatch. An uncertain acknowledgement is never retried.
      entry.handled[key] = "sending";
      this.store.save();
      try {
        await this.driver.start(scope, candidate.text, `next-prompt-${key}`);
        entry.handled[key] = "sent";
        this.note(scope.agentId, "Started in a new thread.");
        return true;
      } catch {
        entry.handled[key] = "unknown";
        this.note(
          scope.agentId,
          "New thread status unknown. Check the thread list; no automatic retry.",
        );
        return false;
      } finally {
        this.store.save();
      }
    } finally {
      this.locks.delete(scope.agentId);
    }
  }

  close() {
    this.stopped = true;
  }
}
