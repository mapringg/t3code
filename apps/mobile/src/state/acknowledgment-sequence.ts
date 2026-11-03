import type { ScopedThreadRef } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

import type { AcknowledgedThreadMessage } from "./thread-outbox-model";

export function createAcknowledgmentSequenceAtom(
  acknowledged: Atom.Atom<ReadonlyArray<AcknowledgedThreadMessage>>,
  sequence: Atom.Atom<number>,
  ref: ScopedThreadRef,
) {
  return Atom.make((get) => {
    const through = get(acknowledged).reduce(
      (latest, message) =>
        message.environmentId === ref.environmentId && message.threadId === ref.threadId
          ? Math.max(latest, message.sequence ?? 0)
          : latest,
      0,
    );
    // Retained receipts can outlive catch-up; later streamed events cannot satisfy them further.
    return through === 0 ? 0 : Math.min(get(sequence), through);
  }).pipe(Atom.setIdleTTL(0));
}
