import { THREAD_WORK_LOG_END_GAP } from "../../lib/layout";
import {
  isContextCompactionActivityGroup,
  isContextHandoffActivityGroup,
  type ThreadFeedEntry,
} from "../../lib/threadActivity";

const WORK_ROW_GAP = 1;

/**
 * The height of a one-line feed row, built from the same row height and `mb-3` gap the row
 * draws with. Cards and messages return undefined: LegendList measures them instead.
 */
export function resolveThreadFeedFixedItemSize(
  entry: ThreadFeedEntry,
  fixedRowHeight: number | undefined,
): number | undefined {
  if (fixedRowHeight === undefined) return undefined;
  switch (entry.type) {
    case "run-fold":
      return fixedRowHeight + THREAD_WORK_LOG_END_GAP;
    case "work-toggle":
      // The latest thought takes a line of its own above the group's line.
      return (entry.thought ? 2 : 1) * fixedRowHeight + THREAD_WORK_LOG_END_GAP;
    case "thinking":
      return fixedRowHeight;
    case "activity-group":
      if (
        entry.activities.length === 0 ||
        isContextCompactionActivityGroup(entry) ||
        isContextHandoffActivityGroup(entry) ||
        entry.activities.some(
          (activity) =>
            activity.prominent ||
            (activity.projectedItem.item.type === "error" &&
              activity.projectedItem.item.status === "failed"),
        )
      ) {
        return undefined;
      }
      return (
        (entry.continuesWorkLog ? 0 : THREAD_WORK_LOG_END_GAP) +
        entry.activities.length * fixedRowHeight +
        (entry.activities.length - 1) * WORK_ROW_GAP
      );
    default:
      return undefined;
  }
}
