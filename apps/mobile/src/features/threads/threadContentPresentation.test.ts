import { describe, expect, it } from "@effect/vitest";

import { nextThreadSyncLabel, projectThreadContentPresentation } from "./threadContentPresentation";

describe("thread content presentation", () => {
  it("renders cached detail while its environment reconnects", () => {
    expect(
      projectThreadContentPresentation({
        hasDetail: true,
        detailError: null,
        detailDeleted: false,
        connectionState: "reconnecting",
      }),
    ).toEqual({ kind: "ready" });
  });

  it("explains uncached detail while disconnected instead of loading forever", () => {
    expect(
      projectThreadContentPresentation({
        hasDetail: false,
        detailError: null,
        detailDeleted: false,
        connectionState: "error",
      }),
    ).toEqual({
      kind: "unavailable",
      title: "Messages not cached",
      detail: "Reconnect this environment to load the conversation.",
    });
  });

  it("keeps one sync label from loading through the first synced render", () => {
    const loading = nextThreadSyncLabel(null, {
      syncStatus: "synchronizing",
      contentKind: "loading",
    });
    expect(loading).toBe("Loading messages...");
    expect(
      nextThreadSyncLabel(loading, { syncStatus: "synchronizing", contentKind: "ready" }),
    ).toBe("Loading messages...");
    expect(nextThreadSyncLabel(loading, { syncStatus: "live", contentKind: "ready" })).toBe(null);
    expect(nextThreadSyncLabel(null, { syncStatus: "cached", contentKind: "ready" })).toBe(
      "Syncing messages...",
    );
    expect(nextThreadSyncLabel(null, { syncStatus: "empty", contentKind: "unavailable" })).toBe(
      null,
    );
  });
});
