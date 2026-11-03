import { CommandId, EnvironmentId, MessageId, ThreadId } from "@t3tools/contracts";
import { Atom, AtomRegistry } from "effect/reactivity";
import { expect, it } from "vite-plus/test";

import { createAcknowledgmentSequenceAtom } from "./acknowledgment-sequence";
import type { AcknowledgedThreadMessage } from "./thread-outbox-model";

it("stops emitting streaming sequences once retained receipts are caught up", () => {
  const ref = { environmentId: EnvironmentId.make("env"), threadId: ThreadId.make("thread") };
  const receipt: AcknowledgedThreadMessage = {
    ...ref,
    messageId: MessageId.make("message"),
    commandId: CommandId.make("command"),
    text: "Hello",
    attachments: [],
    createdAt: "2026-11-03T00:00:00.000Z",
    sequence: 3,
  };
  const acknowledged = Atom.make<ReadonlyArray<AcknowledgedThreadMessage>>([receipt]);
  const sequence = Atom.make(1);
  const watermark = createAcknowledgmentSequenceAtom(acknowledged, sequence, ref);
  const registry = AtomRegistry.make();
  const emissions: number[] = [];
  const unsubscribe = registry.subscribe(watermark, (value) => emissions.push(value));
  try {
    expect(registry.get(watermark)).toBe(1);
    registry.set(sequence, 2);
    expect(registry.get(watermark)).toBe(2);
    registry.set(sequence, 3);
    expect(registry.get(watermark)).toBe(3);
    const caughtUpEmissions = emissions.length;
    registry.set(sequence, 4);
    registry.set(sequence, 5);
    expect(registry.get(watermark)).toBe(3);
    expect(emissions).toHaveLength(caughtUpEmissions);

    registry.set(acknowledged, [{ ...receipt, sequence: 7 }]);
    expect(registry.get(watermark)).toBe(5);
    registry.set(sequence, 7);
    expect(registry.get(watermark)).toBe(7);
    registry.set(acknowledged, [{ ...receipt, threadId: ThreadId.make("other") }]);
    expect(registry.get(watermark)).toBe(0);
    const { sequence: _sequence, ...legacyReceipt } = receipt;
    registry.set(acknowledged, [legacyReceipt]);
    expect(registry.get(watermark)).toBe(0);
  } finally {
    unsubscribe();
    registry.dispose();
  }
});
