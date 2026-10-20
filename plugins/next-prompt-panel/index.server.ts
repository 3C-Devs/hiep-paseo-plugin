import type { PluginServerContext } from "@getpaseo/plugin/server";
import type { PaseoApi } from "@getpaseo/client";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { inspectRpc, scopeRpc, sendRpc, startRpc } from "./shared/contracts";
import { Engine } from "./server/engine";
import { Store } from "./server/store";
import { createDriver } from "./server/paseo";

export default function contribute(server: PluginServerContext) {
  const home = process.env.PASEO_HOME || path.join(homedir(), ".paseo");
  const serverId = readFileSync(path.join(home, "server-id"), "utf8").trim();
  let api: PaseoApi | undefined;
  const engine = new Engine(
    new Store(path.join(home, "plugin-data/next-prompt-panel/state.json")),
    createDriver(() => {
      if (!api) throw new Error("SDK unavailable.");
      return api;
    }, serverId),
  );
  server.handle(scopeRpc, async ({ agentId }, context) => {
    api = context.paseo;
    const handle = context.paseo.agents.ref(agentId);
    await handle.refresh();
    if (!handle.workspaceId) throw new Error("Conversation unavailable.");
    return { serverId, agentId, workspaceId: handle.workspaceId };
  });
  server.handle(inspectRpc, (input, context) => {
    api = context.paseo;
    return engine.inspect(input);
  });
  server.handle(sendRpc, async (input, context) => {
    api = context.paseo;
    return { sent: await engine.send(input, input.key) };
  });
  server.handle(startRpc, async (input, context) => {
    api = context.paseo;
    return { started: await engine.start(input, input.key) };
  });
  // A new turn drops the note of the turn before it.
  const started = server.on("agent.turn_started", ({ agent }, context) => {
    api = context.paseo;
    engine.started(agent.id);
  });
  return () => {
    engine.close();
    started();
  };
}
