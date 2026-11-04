import type { ThreadId, WorktreeSetupSnapshot } from "@t3tools/contracts";

/** A subscription can close or replay an older value during the setup handoff. */
export function resolveWorktreeSetupSnapshot(
  threadId: ThreadId | null,
  latest: WorktreeSetupSnapshot | null | undefined,
  held: WorktreeSetupSnapshot | null,
): WorktreeSetupSnapshot | null {
  const current = latest?.threadId === threadId ? latest : null;
  const previous = held?.threadId === threadId ? held : null;
  return current && (!previous || current.sequence >= previous.sequence) ? current : previous;
}

/** Android's run status line reports setup in progress; the card stays for outcomes to act on. */
export function worktreeSetupCardVisible(snapshot: WorktreeSetupSnapshot): boolean {
  return (
    snapshot.phase === "failed" ||
    snapshot.phase === "cancelled" ||
    snapshot.stages.some((stage) => stage.status === "failed")
  );
}
