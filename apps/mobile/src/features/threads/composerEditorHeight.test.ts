import { describe, expect, it } from "vite-plus/test";

import { estimateUnmeasuredEditorText, rescaleEditorContentHeight } from "./composerEditorHeight";

describe("rescaleEditorContentHeight", () => {
  it("never expands dictated text past its full-width height when it was measured in the compact slot", () => {
    // Phone trace: 51 characters wrapped to two compact lines (41.7 at 255 wide), one line at 362.
    expect(
      rescaleEditorContentHeight({
        contentHeight: 41.68,
        lineHeight: 23,
        measuredWidth: 255,
        width: 362,
      }),
    ).toBe(23);
    expect(
      rescaleEditorContentHeight({
        contentHeight: 5 * 22,
        lineHeight: 22,
        measuredWidth: 600,
        width: 1000,
      }),
    ).toBe(3 * 22);
  });

  it("keeps a height measured at the current width or a single line", () => {
    const measured = { lineHeight: 22, measuredWidth: 600, width: 600 };
    expect(rescaleEditorContentHeight({ ...measured, contentHeight: 110 })).toBe(110);
    expect(rescaleEditorContentHeight({ ...measured, contentHeight: 22, width: 1000 })).toBe(22);
  });
});

describe("estimateUnmeasuredEditorText", () => {
  it("expands a paste to its full height before the editor re-measures it", () => {
    // Phone: 6.3 per char from a single-line measurement; this paste wraps to three lines at 362.
    const text =
      "The New thread image send still jumps a little in this build. C2 is fixing that next, so you don't need to test it yet.";
    expect(
      estimateUnmeasuredEditorText({
        text,
        charWidth: 6.31,
        compactWidth: 255,
        expandedWidth: 362,
        lineHeight: 23,
      }),
    ).toEqual({ overflowsCompact: true, height: 3 * 23 });
  });

  it("keeps a short chunk in the compact row", () => {
    expect(
      estimateUnmeasuredEditorText({
        text: "ok, thanks",
        charWidth: 6.31,
        compactWidth: 255,
        expandedWidth: 362,
        lineHeight: 23,
      }).overflowsCompact,
    ).toBe(false);
  });
});
