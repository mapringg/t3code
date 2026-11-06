import { expect, it } from "vite-plus/test";
import { sameRowValue } from "./feed-row-equality";

it("keeps a row whose context was rebuilt with the same data, and re-renders it for new data", () => {
  const context = {
    footerAssistantMessageId: "reply",
    failedRunIds: new Set(["run"]),
    labels: new Map([["entry", { title: "Compacted" }]]),
    sizing: { estimatedRowHeight: 28, textSizeKey: "m" },
    onOpenRun: () => undefined,
  };
  const rebuilt = {
    footerAssistantMessageId: "reply",
    failedRunIds: new Set(["run"]),
    labels: new Map([["entry", { title: "Compacted" }]]),
    sizing: { estimatedRowHeight: 28, textSizeKey: "m" },
    onOpenRun: () => undefined,
  };
  expect(sameRowValue(context, rebuilt, 2)).toBe(true);
  expect(sameRowValue(context, { ...rebuilt, footerAssistantMessageId: "next" }, 2)).toBe(false);
  expect(sameRowValue(context, { ...rebuilt, failedRunIds: new Set(["other"]) }, 2)).toBe(false);
  expect(
    sameRowValue(context, { ...rebuilt, labels: new Map([["entry", { title: "Compacting" }]]) }, 2),
  ).toBe(false);
  expect(
    sameRowValue(context, { ...rebuilt, sizing: { ...rebuilt.sizing, textSizeKey: "l" } }, 2),
  ).toBe(false);
  // A handler appearing or going away changes what the row offers.
  expect(sameRowValue(context, { ...rebuilt, onOpenRun: null }, 2)).toBe(false);
});
