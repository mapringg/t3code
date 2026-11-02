import { describe, expect, it } from "vite-plus/test";

import { createThreadFeedRowSizeMemory } from "./threadFeedRowSizes";

describe("createThreadFeedRowSizeMemory", () => {
  it("keeps sizes per geometry and forgets the least recently opened feed", () => {
    const sizesFor = createThreadFeedRowSizeMemory(2);
    sizesFor("a:390").set("row", 120);
    expect(sizesFor("a:600").get("row")).toBeUndefined();
    sizesFor("a:390");
    sizesFor("b:390");
    expect(sizesFor("a:390").get("row")).toBe(120);
    expect(sizesFor("a:600").size).toBe(0);
    sizesFor("c:390");
    expect(sizesFor("a:390").get("row")).toBeUndefined();
  });
});
