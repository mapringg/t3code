import { THREAD_WORK_LOG_END_GAP, THREAD_WORK_ROW_MIN_HEIGHT } from "../../lib/layout";
import type { ThreadFeedEntry } from "../../lib/threadActivity";

// Content-driven rows must be measured by LegendList: returning a fixed size
// makes the list skip native measurement entirely.
const WORK_GROUP_TOGGLE_HEIGHT = THREAD_WORK_ROW_MIN_HEIGHT;

export function resolveThreadFeedFixedItemSize(
  entry: Pick<ThreadFeedEntry, "type"> & { readonly expanded?: boolean },
): number | undefined {
  switch (entry.type) {
    case "run-fold":
      // An expanded fold can show a loading skeleton for its deferred history.
      return entry.expanded ? undefined : THREAD_WORK_ROW_MIN_HEIGHT + THREAD_WORK_LOG_END_GAP;
    case "work-toggle":
      return WORK_GROUP_TOGGLE_HEIGHT;
    case "activity-group":
    case "message":
      return undefined;
  }
}
