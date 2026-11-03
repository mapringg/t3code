import { useAtomValue } from "@effect/atom-react";
import type { PendingThreadRequests } from "@t3tools/client-runtime/state/thread-requests";
import type { EnvironmentThreadStructure } from "@t3tools/client-runtime/state/models";
import type { EnvironmentThread } from "@t3tools/client-runtime/state/shell";
import type {
  EnvironmentId,
  OrchestrationV2ThreadProjection,
  ScopedThreadRef,
  ThreadId,
} from "@t3tools/contracts";
import { Atom } from "effect/reactivity";
import { parseThreadKey, threadKey } from "@t3tools/client-runtime/state/entities";
import { Platform } from "react-native";

import { environmentThreadDetails, environmentThreads, useEnvironmentThread } from "./threads";
import { useThreadSelection } from "./use-thread-selection";
import { createThreadRenderStateAtom } from "./thread-render-state";
import { EMPTY_ENVIRONMENT_THREAD_STATE } from "@t3tools/client-runtime/state/threads";
import * as Option from "effect/Option";

const EMPTY_THREAD_PROJECTION_ATOM = Atom.make<EnvironmentThread | null>(null).pipe(
  Atom.withLabel("mobile-thread-projection:empty"),
);
const EMPTY_THREAD_STRUCTURE_ATOM = Atom.make<EnvironmentThreadStructure | null>(null).pipe(
  Atom.withLabel("mobile-thread-structure:empty"),
);
const EMPTY_VISIBLE_TURN_ITEMS_ATOM = Atom.make<
  OrchestrationV2ThreadProjection["visibleTurnItems"]
>(Object.freeze([])).pipe(Atom.withLabel("mobile-thread-visible-turn-items:empty"));
const EMPTY_ASSISTANT_MESSAGE_TEXT_ATOM = Atom.make<string | null>(null);
const EMPTY_RENDER_STATE_ATOM = Atom.make(EMPTY_ENVIRONMENT_THREAD_STATE);

const threadRenderStateFamily = Atom.family((key: string) => {
  const ref = parseThreadKey(key);
  return createThreadRenderStateAtom(
    environmentThreads.stateAtom(ref.environmentId, ref.threadId),
    environmentThreadDetails.quietThreadAtom(ref),
  );
});
const threadRenderProjectionFamily = Atom.family((key: string) =>
  Atom.map(threadRenderStateFamily(key), (state): EnvironmentThread | null => {
    const projection = Option.getOrNull(state.data);
    return projection === null
      ? null
      : { environmentId: parseThreadKey(key).environmentId, projection };
  }),
);

export interface ThreadDetailTarget {
  readonly environmentId: EnvironmentId | null;
  readonly threadId: ThreadId | null;
}

export function useSelectedThreadDetailState() {
  const { selectedThreadDetailRef } = useThreadSelection();
  const renderState = useAtomValue(
    Platform.OS !== "android" || selectedThreadDetailRef === null
      ? EMPTY_RENDER_STATE_ATOM
      : threadRenderStateFamily(threadKey(selectedThreadDetailRef)),
  );
  const fullState = useEnvironmentThread(
    Platform.OS !== "android" ? (selectedThreadDetailRef?.environmentId ?? null) : null,
    Platform.OS !== "android" ? (selectedThreadDetailRef?.threadId ?? null) : null,
  );
  return Platform.OS === "android" ? renderState : fullState;
}

export function useThreadAssistantMessageText(
  ref: ScopedThreadRef | null,
  itemId: string | undefined,
): string | null {
  return useAtomValue(
    ref === null || itemId === undefined
      ? EMPTY_ASSISTANT_MESSAGE_TEXT_ATOM
      : environmentThreadDetails.assistantMessageTextAtom(ref, itemId),
  );
}

export function useSelectedThreadRenderProjection() {
  const { selectedThreadDetailRef } = useThreadSelection();
  const renderProjection = useAtomValue(
    Platform.OS !== "android" || selectedThreadDetailRef === null
      ? EMPTY_THREAD_PROJECTION_ATOM
      : threadRenderProjectionFamily(threadKey(selectedThreadDetailRef)),
  );
  const fullProjection = useThreadProjection({
    environmentId:
      Platform.OS !== "android" ? (selectedThreadDetailRef?.environmentId ?? null) : null,
    threadId: Platform.OS !== "android" ? (selectedThreadDetailRef?.threadId ?? null) : null,
  });
  return Platform.OS === "android" ? renderProjection : fullProjection;
}

function useThreadProjection(target: ThreadDetailTarget): EnvironmentThread | null {
  return useAtomValue(
    target.environmentId === null || target.threadId === null
      ? EMPTY_THREAD_PROJECTION_ATOM
      : environmentThreadDetails.threadAtom({
          environmentId: target.environmentId,
          threadId: target.threadId,
        }),
  );
}

/** Keeps its value through streamed text; runs, sessions, and item status still update. */
export function useQuietThreadStructure(
  ref: ScopedThreadRef | null,
): EnvironmentThreadStructure | null {
  return useAtomValue(
    ref === null ? EMPTY_THREAD_STRUCTURE_ATOM : environmentThreadDetails.quietThreadAtom(ref),
  );
}

export function useSelectedThreadProjection(): EnvironmentThread | null {
  const { selectedThreadDetailRef } = useThreadSelection();
  return useThreadProjection({
    environmentId: selectedThreadDetailRef?.environmentId ?? null,
    threadId: selectedThreadDetailRef?.threadId ?? null,
  });
}

function useThreadVisibleTurnItems(
  target: ThreadDetailTarget,
): OrchestrationV2ThreadProjection["visibleTurnItems"] {
  return useAtomValue(
    target.environmentId === null || target.threadId === null
      ? EMPTY_VISIBLE_TURN_ITEMS_ATOM
      : (Platform.OS === "android"
          ? environmentThreadDetails.timelineVisibleTurnItemsAtom
          : environmentThreadDetails.visibleTurnItemsAtom)({
          environmentId: target.environmentId,
          threadId: target.threadId,
        }),
  );
}

export function useSelectedThreadVisibleTurnItems(): OrchestrationV2ThreadProjection["visibleTurnItems"] {
  const { selectedThreadDetailRef } = useThreadSelection();
  return useThreadVisibleTurnItems({
    environmentId: selectedThreadDetailRef?.environmentId ?? null,
    threadId: selectedThreadDetailRef?.threadId ?? null,
  });
}

const EMPTY_WORKTREE_PATH_ATOM = Atom.make<string | null>(null);
const EMPTY_PENDING_REQUESTS_ATOM = Atom.make<PendingThreadRequests | null>(null);

export function useThreadWorktreePath(ref: ScopedThreadRef | null) {
  return useAtomValue(
    ref === null ? EMPTY_WORKTREE_PATH_ATOM : environmentThreadDetails.worktreePathAtom(ref),
  );
}

export function useSelectedThreadWorktreePath() {
  const { selectedThreadDetailRef } = useThreadSelection();
  return useThreadWorktreePath(selectedThreadDetailRef);
}

export function useSelectedThreadPendingRequests() {
  const { selectedThreadDetailRef } = useThreadSelection();
  return useAtomValue(
    selectedThreadDetailRef === null
      ? EMPTY_PENDING_REQUESTS_ATOM
      : environmentThreadDetails.pendingRequestsAtom(selectedThreadDetailRef),
  );
}
