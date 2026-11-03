import type { EnvironmentThreadStructure } from "@t3tools/client-runtime/state/models";
import {
  EMPTY_ENVIRONMENT_THREAD_STATE,
  type EnvironmentThreadState,
} from "@t3tools/client-runtime/state/threads";
import { AsyncResult, Atom } from "effect/reactivity";

// Chat chrome reads structure; streamed text and commit sequences have their own atoms.
export function createThreadRenderStateAtom<E>(
  state: Atom.Atom<AsyncResult.AsyncResult<EnvironmentThreadState, E>>,
  structure: Atom.Atom<EnvironmentThreadStructure | null>,
) {
  let previous: Omit<EnvironmentThreadState, "sequence"> | undefined;
  let previousStructure: EnvironmentThreadStructure | null | undefined;
  return Atom.make((get): Omit<EnvironmentThreadState, "sequence"> => {
    const next = AsyncResult.getOrElse(get(state), () => EMPTY_ENVIRONMENT_THREAD_STATE);
    const nextStructure = get(structure);
    if (
      previous === undefined ||
      nextStructure !== previousStructure ||
      next.status !== previous.status ||
      next.error !== previous.error ||
      next.history !== previous.history
    ) {
      previous = next;
      previousStructure = nextStructure;
    }
    return previous;
  }).pipe(Atom.setIdleTTL(0));
}
