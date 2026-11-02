import { describe, expect, it } from "@effect/vitest";

import {
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
});
