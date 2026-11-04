import { describe, expect, it } from "vite-plus/test";

import { rescaleEditorContentHeight } from "./composerEditorHeight";

describe("rescaleEditorContentHeight", () => {
  it("lands dictated text on its full-width height when it was measured in the compact slot", () => {
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
