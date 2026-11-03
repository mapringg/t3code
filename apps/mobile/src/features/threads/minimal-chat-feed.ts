import { isCompactionCommandMessage } from "@t3tools/contracts";
import type { ThreadFeedActivity, ThreadFeedEntry } from "../../lib/threadActivity";

function keepActivity(activity: ThreadFeedActivity) {
  const item = activity.projectedItem.item;
  switch (item.type) {
    case "approval_request":
      return (
        item.status !== "completed" && item.status !== "cancelled" && item.status !== "interrupted"
      );
    case "secret_request":
      return item.secretStatus === "pending";
    case "link_request":
      return item.linkStatus === "pending" || item.linkStatus === "failed";
    case "user_input_request":
    case "proposed_plan":
    case "error":
    case "system_notice":
      return true;
    default:
      return false;
  }
}

export function minimalChatFeed(feed: ReadonlyArray<ThreadFeedEntry>): ThreadFeedEntry[] {
  return feed.flatMap((entry): ThreadFeedEntry[] => {
    switch (entry.type) {
      case "message":
        return isCompactionCommandMessage(entry.message) ? [] : [entry];
      case "html-render":
      case "mcp-app":
        return [entry];
      case "activity-group": {
        const activities = entry.activities.filter(keepActivity);
        if (activities.length === 0) return [];
        return [activities.length === entry.activities.length ? entry : { ...entry, activities }];
      }
      default:
        return [];
    }
  });
}
