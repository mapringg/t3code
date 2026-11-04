import { describe, expect, it } from "vite-plus/test";

import { rescaleEditorContentHeight } from "./composerEditorHeight";

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
