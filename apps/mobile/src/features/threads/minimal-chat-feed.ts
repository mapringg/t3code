import { isCompactionCommandMessage, type MessageId, type RunId } from "@t3tools/contracts";
import {
  threadFeedRunIsUnsettled,
  type ThreadFeedActivity,
  type ThreadFeedEntry,
  type ThreadFeedLatestRun,
} from "../../lib/threadActivity";
import type { PendingThreadFeedEntry } from "./pending-thread-feed";

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

/** The step the presented feed's live work row names, if the provider reported one. */
export function runStatusActivity(presented: ReadonlyArray<ThreadFeedEntry>): string | null {
  for (let index = presented.length - 1; index >= 0; index--) {
    const row = presented[index]!;
    if (row.type === "work-toggle" && row.live) {
      // A finished thought is no step; the next one has not started.
      return row.summaryKind === "reasoning" && row.summary !== "Thinking" ? null : row.summary;
    }
    if (row.type === "activity-group" && row.activities[0]?.live) {
      return row.activities[0].groupStandIn?.label ?? null;
    }
    if (row.type === "thinking") return null;
  }
  return null;
}

type RunStatusRow = Extract<ThreadFeedEntry, { readonly type: "thinking" }>;
let cachedRunStatusRow: RunStatusRow | null = null;

/**
 * Android's one-line run status. It is the last row from send until the run settles, the same
 * moment the newest reply gains its footer, so the slot changes owner instead of the feed moving.
 */
export function appendRunStatusLine(
  rows: ReadonlyArray<PendingThreadFeedEntry>,
  input: {
    readonly activity: string | null;
    readonly latestRun: ThreadFeedLatestRun | null;
    readonly activeWorkStartedAt: string | null;
    readonly runlessWorkActive: boolean;
    readonly dispatchingMessageId: MessageId | null;
  },
): ReadonlyArray<PendingThreadFeedEntry> {
  const last = rows.at(-1);
  const sending =
    last?.type === "message" &&
    last.pendingMessage !== undefined &&
    (last.acknowledged === true || last.pendingMessage.messageId === input.dispatchingMessageId)
      ? last
      : null;
  const run = threadFeedRunIsUnsettled(input.latestRun) ? input.latestRun : null;
  const runless = input.runlessWorkActive && input.activeWorkStartedAt !== null;
  if (run === null && !runless && sending === null) return rows;

  const runId: RunId | null = run?.runId ?? null;
  const startedAt =
    input.activeWorkStartedAt ?? run?.startedAt ?? sending?.createdAt ?? last?.createdAt ?? "";
  const label = input.activity ? `Working · ${input.activity}` : "Working";
  if (
    cachedRunStatusRow?.createdAt !== startedAt ||
    cachedRunStatusRow.runId !== runId ||
    cachedRunStatusRow.label !== label
  ) {
    cachedRunStatusRow = {
      type: "thinking",
      id: "run-status-line",
      createdAt: startedAt,
      runId,
      label,
    };
  }
  return [...rows, cachedRunStatusRow];
}
