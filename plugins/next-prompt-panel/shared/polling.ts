/** A closed runtime is at rest: Send resumes it. */
export function agentBusy(
  agent: { status: string; attentionReason: string | null } | null,
): boolean {
  if (!agent) return false;
  return !["idle", "closed"].includes(agent.status) || agent.attentionReason === "permission";
}

export function inspectionActivity(agent: { status: string; lastActivityAt: string }) {
  return {
    status: agent.status,
    lastActivityAt: agent.status === "running" ? null : agent.lastActivityAt,
  };
}
