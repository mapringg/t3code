import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentThread } from "@t3tools/client-runtime/state/shell";
import { RunId, type ScopedThreadRef } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import { environmentThreadDetails } from "../../state/threads";
import { runEndLabel } from "./minimal-chat-feed";

const NO_THREAD_ATOM = Atom.make<EnvironmentThread | null>(null);

/**
 * How each stopped or failed run ended, from the thread's run history, so older turns keep the
 * outcome they showed. Selected as a string so streaming updates don't re-render the feed.
 */
export function useEndedRuns(ref: ScopedThreadRef | null): ReadonlyMap<RunId, string> {
  const key = useAtomValue(
    ref === null ? NO_THREAD_ATOM : environmentThreadDetails.threadAtom(ref),
    (thread) =>
      (thread?.projection.runs ?? [])
        .flatMap((run) => {
          const label = runEndLabel(run.status);
          return label === undefined ? [] : [`${run.id}\t${label}`];
        })
        .join("\n"),
  );
  return new Map(
    key === ""
      ? []
      : key.split("\n").map((line) => {
          const [id, label] = line.split("\t") as [string, string];
          return [RunId.make(id), label];
        }),
  );
}
