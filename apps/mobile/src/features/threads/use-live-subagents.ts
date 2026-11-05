import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentThread } from "@t3tools/client-runtime/state/shell";
import type { ThreadTurnSubagents } from "@t3tools/client-runtime/state/thread-subagents";
import type { OrchestrationV2Subagent, ScopedThreadRef } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import { environmentThreadDetails } from "../../state/threads";

const NO_THREAD_ATOM = Atom.make<EnvironmentThread | null>(null);
const NO_TURN_SUBAGENTS_ATOM = Atom.make<ThreadTurnSubagents | null>(null);
const NO_SUBAGENTS: ReadonlyArray<OrchestrationV2Subagent> = [];

/** Selected as a number so subagent progress updates don't re-render the feed. */
export function useLiveSubagentCount(ref: ScopedThreadRef | null): number {
  return useAtomValue(
    ref === null ? NO_TURN_SUBAGENTS_ATOM : environmentThreadDetails.turnSubagentsAtom(ref),
    (turn) => turn?.liveCount ?? 0,
  );
}

/** The projection's subagents, whose status runs ahead of the feed's turn items. */
export function useThreadSubagents(
  ref: ScopedThreadRef | null,
): ReadonlyArray<OrchestrationV2Subagent> {
  return useAtomValue(
    ref === null ? NO_THREAD_ATOM : environmentThreadDetails.threadAtom(ref),
    (thread) => thread?.projection.subagents ?? NO_SUBAGENTS,
  );
}
