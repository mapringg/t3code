import { describe, expect, it } from "@effect/vitest";

import {
  feedAwaitsThreadCatchUp,
  lockThreadSyncLabel,
  projectThreadContentPresentation,
  threadSyncLabel,
} from "./threadContentPresentation";

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

  it("labels a sync by whether content is already on screen", () => {
    expect(threadSyncLabel({ syncStatus: "synchronizing", contentKind: "loading" })).toBe(
      "Loading messages…",
    );
    expect(threadSyncLabel({ syncStatus: "cached", contentKind: "ready" })).toBe(
      "Syncing messages…",
    );
    expect(threadSyncLabel({ syncStatus: "live", contentKind: "ready" })).toBe(null);
    expect(threadSyncLabel({ syncStatus: "empty", contentKind: "unavailable" })).toBe(null);
  });

  it("keeps the sync pill's first shown label until the pill hides", () => {
    // Not shown yet: a cached thread whose content lands during the show delay says Syncing.
    expect(lockThreadSyncLabel(null, "Syncing messages…", false)).toBe(null);
    const shown = lockThreadSyncLabel(null, "Loading messages…", true);
    expect(shown).toBe("Loading messages…");
    expect(lockThreadSyncLabel(shown, "Syncing messages…", true)).toBe("Loading messages…");
    // The minimum hold outlives the sync itself.
    expect(lockThreadSyncLabel(shown, null, true)).toBe("Loading messages…");
    expect(lockThreadSyncLabel(shown, null, false)).toBe(null);
  });

  it("holds the feed through a live catch-up but never through an offline or failed one", () => {
    const catchUp = { detailError: null, connectionState: "connected" } as const;
    expect(feedAwaitsThreadCatchUp({ ...catchUp, syncStatus: "cached" })).toBe(true);
    expect(feedAwaitsThreadCatchUp({ ...catchUp, syncStatus: "synchronizing" })).toBe(true);
    expect(
      feedAwaitsThreadCatchUp({ ...catchUp, syncStatus: "cached", connectionState: "connecting" }),
    ).toBe(true);
    expect(feedAwaitsThreadCatchUp({ ...catchUp, syncStatus: "live" })).toBe(false);
    // Cached rows are the only content while the environment is unreachable.
    expect(
      feedAwaitsThreadCatchUp({
        ...catchUp,
        syncStatus: "cached",
        connectionState: "reconnecting",
      }),
    ).toBe(false);
    expect(
      feedAwaitsThreadCatchUp({ ...catchUp, syncStatus: "cached", detailError: "Stream failed" }),
    ).toBe(false);
  });
});
