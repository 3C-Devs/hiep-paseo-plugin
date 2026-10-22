import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
export const stateSchema = z
  .object({
    spaces: z
      .array(z.object({ id: z.string().min(1), name: z.string().min(1) }))
      .min(1)
      .default([{ id: "space-1", name: "Workspace 1" }]),
    members: z.record(z.string(), z.string()).default({}),
  })
  .refine(
    (s) =>
      new Set(s.spaces.map((x) => x.id)).size === s.spaces.length &&
      Object.values(s.members).every((id) => s.spaces.some((x) => x.id === id)),
    "Invalid Space membership",
  );
export type SpacesState = z.infer<typeof stateSchema>;
export const preferences = defineSettings({
  id: "spaces",
  scope: "host",
  version: 1,
  schema: stateSchema,
});
// Membership keys. A checkout key holds where one project on one host was last moved. For a repo
// (Paseo's projectKey, shared by every checkout on every host), the repo key holds its latest move
// of any kind, used by checkouts never moved themselves, and the whole-repo key holds its latest
// move as one sidebar group, which competes with checkout moves by recency.
export const checkoutMember = (serverId: string, projectId: string) =>
  JSON.stringify(["checkout", serverId, projectId]);
export const repoMember = (projectKey: string) => JSON.stringify(["repo", projectKey]);
export const wholeRepoMember = (projectKey: string) => JSON.stringify(["whole", projectKey]);
export function addSpace(state: SpacesState): SpacesState {
  const number = Math.max(...state.spaces.map((s) => Number(s.id.slice(6)) || 0)) + 1;
  return stateSchema.parse({
    ...state,
    spaces: [...state.spaces, { id: `space-${number}`, name: `Workspace ${number}` }],
  });
}
export function renameSpace(state: SpacesState, id: string, name: string): SpacesState {
  if (!state.spaces.some((space) => space.id === id))
    throw new Error("Workspace no longer exists. Refresh first.");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Enter a workspace name.");
  return stateSchema.parse({
    ...state,
    spaces: state.spaces.map((space) => (space.id === id ? { ...space, name: trimmed } : space)),
  });
}
export function adjacent(ids: string[], current: string, direction: number): string {
  const index = Math.max(0, ids.indexOf(current));
  return ids[Math.max(0, Math.min(ids.length - 1, index + direction))];
}

export function removalTarget(state: SpacesState, id: string): string {
  const index = state.spaces.findIndex((space) => space.id === id);
  if (index < 0) throw new Error("Workspace no longer exists. Refresh first.");
  if (state.spaces.length === 1) throw new Error("Keep at least one workspace.");
  return state.spaces[index > 0 ? index - 1 : 1].id;
}
export function removeSpace(state: SpacesState, id: string): SpacesState {
  const target = removalTarget(state, id);
  return stateSchema.parse({
    spaces: state.spaces.filter((space) => space.id !== id),
    members: Object.fromEntries(
      Object.entries(state.members).map(([key, value]) => [key, value === id ? target : value]),
    ),
  });
}
