import {
  EMPTY_ENVIRONMENT_THREAD_STATE,
  sameThreadStructure,
  type EnvironmentThreadState,
} from "@t3tools/client-runtime/state/threads";
import {
  OrchestrationV2ConversationMessage,
  type OrchestrationV2ThreadProjection,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { getProjectionArrayReplacementIndex } from "@t3tools/client-runtime/state/orchestration-v2-projection";
import { AsyncResult, Atom } from "effect/reactivity";

const sameMessage = Schema.toEquivalence(OrchestrationV2ConversationMessage);

function sameRenderProjection(
  previous: OrchestrationV2ThreadProjection | null,
  next: OrchestrationV2ThreadProjection | null,
) {
  if (previous === null || next === null) return previous === next;
  if (previous.messages === next.messages) return sameThreadStructure(previous, next);
  if (
    previous.messages.length !== next.messages.length ||
    !sameThreadStructure({ ...previous, messages: next.messages }, next)
  )
    return false;
  const sameAtIndex = (index: number) => {
    const before = previous.messages[index]!;
    const after = next.messages[index]!;
    if (before === after) return true;
    // Only turn-item-backed replies have a live text subscription outside the snapshot.
    return (
      before.role === "assistant" &&
      after.role === "assistant" &&
      before.streaming &&
      after.streaming &&
      before.id === after.id &&
      next.visibleTurnItems.findLast(
        ({ item }) =>
          item.type === "assistant_message" && item.streaming && item.messageId === after.id,
      ) !== undefined &&
      sameMessage(before, { ...after, text: before.text, updatedAt: before.updatedAt })
    );
  };
  const replacedIndex = getProjectionArrayReplacementIndex(previous.messages, next.messages);
  return replacedIndex === undefined
    ? previous.messages.every((_, index) => sameAtIndex(index))
    : sameAtIndex(replacedIndex);
}

// Chat chrome reads structure; streamed text and commit sequences have their own atoms.
export function createThreadRenderStateAtom<E>(
  state: Atom.Atom<AsyncResult.AsyncResult<EnvironmentThreadState, E>>,
) {
  let previous: Omit<EnvironmentThreadState, "sequence"> | undefined;
  let previousProjection: OrchestrationV2ThreadProjection | null = null;
  return Atom.make((get): Omit<EnvironmentThreadState, "sequence"> => {
    const next = AsyncResult.getOrElse(get(state), () => EMPTY_ENVIRONMENT_THREAD_STATE);
    const nextProjection = Option.getOrNull(next.data);
    const structureChanged = !sameRenderProjection(previousProjection, nextProjection);
    if (
      previous === undefined ||
      structureChanged ||
      next.status !== previous.status ||
      next.error !== previous.error ||
      next.history !== previous.history
    ) {
      previous = next;
    }
    previousProjection = nextProjection;
    return previous;
  }).pipe(Atom.setIdleTTL(0));
}
