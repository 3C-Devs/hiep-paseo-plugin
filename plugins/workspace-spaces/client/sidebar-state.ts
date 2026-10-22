import { settingsRpc } from "@getpaseo/plugin";
import type { PluginClientContext, PluginCommandCapabilities } from "@getpaseo/plugin/client";
import {
  addSpace,
  checkoutMember,
  removeSpace,
  renameSpace,
  repoMember,
  stateSchema,
  wholeRepoMember,
  type SpacesState,
} from "../shared/spaces";

export type SidebarSnapshot = {
  state: SpacesState;
  busy: boolean;
  error: string;
};
// One host's projects (projectId -> Paseo projectKey) and workspaces (workspaceId -> projectId).
export type HostCatalog = { projects: Map<string, string>; workspaces: Map<string, string> };
export type Catalogs = Map<string, HostCatalog>;
type HostApi = Pick<PluginCommandCapabilities["paseo"], "projects" | "workspaces">;

// Paseo names a sidebar project group by its projectKey while each host has one checkout of it,
// and by [serverId, projectId] (or ["placement", serverId, projectId, n]) otherwise. That name
// changes whenever a second checkout appears or a remote moves, so membership is stored per
// checkout and per repo instead. Workspace rows use [serverId, workspaceId].
function hostPair(key: string): [string, string] | null {
  if (!key.startsWith("[")) return null;
  try {
    const value: unknown = JSON.parse(key);
    if (!Array.isArray(value)) return null;
    const [a, b, c] = value;
    if (a === "placement" && typeof b === "string" && typeof c === "string") return [b, c];
    if (value.length === 2 && typeof a === "string" && typeof b === "string") return [a, b];
  } catch {
    /* Not a host-scoped key. */
  }
  return null;
}
function hostOf(key: string) {
  return hostPair(key)?.[0] ?? /^host:([^:]+):/.exec(key)?.[1];
}
// The checkouts a sidebar group stands for, as far as the loaded catalogs know.
function checkoutsOf(catalogs: Catalogs, key: string) {
  const pair = hostPair(key);
  if (pair) return [pair];
  const checkouts: [string, string][] = [];
  for (const [serverId, catalog] of catalogs)
    for (const [projectId, repo] of catalog.projects)
      if (repo === key) checkouts.push([serverId, projectId]);
  return checkouts;
}
function repoOf(catalogs: Catalogs, key: string) {
  const pair = hostPair(key);
  return pair ? catalogs.get(pair[0])?.projects.get(pair[1]) : key;
}
// Members are kept in move order, oldest first, so the newest of several entries wins.
function newest(state: SpacesState, keys: string[]) {
  const order = Object.keys(state.members);
  let best = -1;
  for (const key of keys) best = Math.max(best, order.indexOf(key));
  return best < 0 ? undefined : state.members[order[best]];
}
export function viewSpace(state: SpacesState, catalogs: Catalogs, key: string): string {
  const repo = repoOf(catalogs, key);
  const moved = checkoutsOf(catalogs, key)
    .map((checkout) => checkoutMember(...checkout))
    .filter((member) => Object.hasOwn(state.members, member));
  // A moved checkout is where it or its whole repo was last moved; others follow the repo.
  if (moved.length) return newest(state, repo ? [...moved, wholeRepoMember(repo)] : moved)!;
  const latest = repo && repoMember(repo);
  return latest && Object.hasOwn(state.members, latest)
    ? state.members[latest]
    : state.spaces[0].id;
}
// Undefined leaves rows whose project is unknown visible.
export function workspaceSpace(state: SpacesState, catalogs: Catalogs, key: string) {
  const pair = hostPair(key);
  const projectId = pair && catalogs.get(pair[0])?.workspaces.get(pair[1]);
  if (!pair || !projectId) return undefined;
  return viewSpace(state, catalogs, JSON.stringify([pair[0], projectId]));
}
export function moveView(
  state: SpacesState,
  catalogs: Catalogs,
  key: string,
  target: string,
): SpacesState {
  if (!state.spaces.some((s) => s.id === target))
    throw new Error("Workspace no longer exists. Refresh and try again.");
  const members = { ...state.members };
  const latest = (member: string) => {
    delete members[member];
    members[member] = target;
  };
  const repo = repoOf(catalogs, key);
  if (repo) members[repoMember(repo)] = target;
  const checkout = hostPair(key);
  if (checkout) latest(checkoutMember(...checkout));
  else {
    if (repo) latest(wholeRepoMember(repo));
    for (const pair of checkoutsOf(catalogs, key)) latest(checkoutMember(...pair));
  }
  return stateSchema.parse({ ...state, members });
}

export function createSidebarController(
  client: Pick<PluginClientContext, "rpc">,
  connect: (serverId: string) => HostApi,
) {
  const contract = settingsRpc("spaces");
  const catalogs: Catalogs = new Map();
  const loads = new Map<string, Promise<void>>();
  const unreachable = new Set<string>();
  let snapshot: SidebarSnapshot | null = null;
  let loadError = "";
  let revision = "",
    stopped = false,
    loading = false;
  const listeners = new Set<() => void>();
  const emit = () => {
    if (!stopped) for (const listener of listeners) listener();
  };
  async function fetchCatalog(serverId: string) {
    try {
      const paseo = connect(serverId);
      const { projects } = await paseo.projects.list();
      const workspaces = new Map<string, string>();
      const seen = new Set<string>();
      let cursor: string | undefined;
      do {
        const page = await paseo.workspaces.list({
          page: { limit: 200, ...(cursor ? { cursor } : {}) },
        });
        for (const workspace of page.entries) workspaces.set(workspace.id, workspace.projectId);
        cursor = page.pageInfo.hasMore ? (page.pageInfo.nextCursor ?? undefined) : undefined;
        if (cursor && seen.has(cursor)) break;
        if (cursor) seen.add(cursor);
      } while (cursor);
      if (stopped) return;
      catalogs.set(serverId, {
        projects: new Map(
          projects.flatMap((p) => (p.projectKey ? [[p.projectId, p.projectKey] as const] : [])),
        ),
        workspaces,
      });
      unreachable.delete(serverId);
      emit();
    } catch {
      // An offline host keeps its last catalog and is retried on the next refresh.
      unreachable.add(serverId);
    }
  }
  function loadCatalog(serverId: string) {
    let load = loads.get(serverId);
    if (!load) {
      load = fetchCatalog(serverId).finally(() => loads.delete(serverId));
      loads.set(serverId, load);
    }
    return load;
  }
  // Hosts are learned from the sidebar keys that name them.
  function watchHost(key: string) {
    const serverId = hostOf(key);
    if (serverId && !catalogs.has(serverId) && !unreachable.has(serverId))
      void loadCatalog(serverId);
    return catalogs;
  }
  async function refresh() {
    if (stopped || loading || snapshot?.busy) return;
    loading = true;
    for (const serverId of new Set([...catalogs.keys(), ...unreachable]))
      void loadCatalog(serverId);
    try {
      const saved = await client.rpc(contract.read, {});
      if (stopped) return;
      if (saved.status !== "ready") throw new Error(saved.error);
      revision = saved.revision;
      loadError = "";
      snapshot = { state: stateSchema.parse(saved.values), busy: false, error: "" };
    } catch (e) {
      loadError = e instanceof Error ? e.message : "Host unavailable";
      if (snapshot) snapshot = { ...snapshot, error: loadError };
    } finally {
      loading = false;
      emit();
    }
  }
  async function save(change: (s: SpacesState) => SpacesState) {
    if (!snapshot || snapshot.busy || loading || stopped) return false;
    snapshot = { ...snapshot, busy: true, error: "" };
    emit();
    try {
      const result = await client.rpc(contract.write, { revision, values: change(snapshot.state) });
      if (stopped) return false;
      if (result.status !== "saved") throw new Error(result.error);
      revision = result.revision;
      snapshot = { ...snapshot, state: stateSchema.parse(result.values), busy: false };
      emit();
      return true;
    } catch (e) {
      if (!stopped) {
        snapshot = {
          ...snapshot,
          busy: false,
          error: e instanceof Error ? e.message : "Save failed",
        };
        emit();
      }
      return false;
    }
  }
  return {
    get: () => snapshot,
    getLoadError: () => loadError,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    refresh,
    watchHost,
    spaceOfView: (state: SpacesState, key: string) => viewSpace(state, watchHost(key), key),
    spaceOfWorkspace: (state: SpacesState, key: string) =>
      workspaceSpace(state, watchHost(key), key),
    create: () => save(addSpace),
    rename: (id: string, name: string) => save((state) => renameSpace(state, id, name)),
    remove: (id: string) => save((state) => removeSpace(state, id)),
    async moveView(key: string, target: string) {
      // Wait for the catalogs that say which checkouts and repo this group stands for.
      const serverId = hostOf(key);
      await Promise.all(
        serverId && !catalogs.has(serverId) ? [loadCatalog(serverId)] : [...loads.values()],
      );
      return save((state) => moveView(state, catalogs, key, target));
    },
    stop() {
      stopped = true;
      listeners.clear();
    },
  };
}
export type SidebarController = ReturnType<typeof createSidebarController>;
