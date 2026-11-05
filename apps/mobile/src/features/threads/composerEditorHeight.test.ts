import { describe, expect, it } from "vite-plus/test";

import { estimateUnmeasuredEditorText } from "./composerEditorHeight";

describe("estimateUnmeasuredEditorText", () => {
  it("grows a paste to its full height before the editor re-measures it", () => {
    // Phone: 6.3 per char from a single-line measurement; this paste wraps to three lines at 255.
    const text =
      "The New thread image send still jumps a little in this build. C2 is fixing that next, so you don't need to test it yet.";
    expect(
      estimateUnmeasuredEditorText({ text, charWidth: 6.31, width: 255, lineHeight: 23 }),
    ).toEqual({ wraps: true, height: 3 * 23 });
  });

  it("keeps a short chunk on one line", () => {
    expect(
      estimateUnmeasuredEditorText({
        text: "ok, thanks",
        charWidth: 6.31,
        width: 255,
        lineHeight: 23,
      }).wraps,
    ).toBe(false);
  });
});
