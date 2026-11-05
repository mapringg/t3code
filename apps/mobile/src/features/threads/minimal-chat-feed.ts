import {
  isCompactionCommandMessage,
  worktreeSetupStageLabel,
  type MessageId,
  type RunId,
  type WorktreeSetupSnapshot,
} from "@t3tools/contracts";
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

/**
 * A run shows only its latest reply, live or settled, so ending a run never folds text away.
 * Earlier replies stay in the run sheet.
 */
export function minimalChatFeed(feed: ReadonlyArray<ThreadFeedEntry>): ThreadFeedEntry[] {
  const latestReplyByRun = new Map<RunId, string>();
  for (const entry of feed) {
    if (entry.type === "message" && entry.message.role === "assistant" && entry.message.runId) {
      latestReplyByRun.set(entry.message.runId, entry.id);
    }
  }
  return feed.flatMap((entry): ThreadFeedEntry[] => {
    switch (entry.type) {
      case "message":
        if (isCompactionCommandMessage(entry.message)) return [];
        if (
          entry.message.role === "assistant" &&
          entry.message.runId &&
          latestReplyByRun.get(entry.message.runId) !== entry.id
        ) {
          return [];
        }
        return [entry];
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

/** The setup step the status line names until the thread's first turn starts. */
export function worktreeSetupRunStep(
  setup: { readonly snapshot: WorktreeSetupSnapshot; readonly turnStarted: boolean } | null,
): { readonly label: string; readonly startedAt: string } | null {
  if (setup === null || setup.turnStarted) return null;
  const { snapshot } = setup;
  if (snapshot.phase === "failed" || snapshot.phase === "cancelled") return null;
  const stage = snapshot.stages.find((candidate) => candidate.status === "running");
  const label =
    stage === undefined
      ? "Setting up worktree"
      : stage.id === "setup-script"
        ? (snapshot.setupScript?.name ?? worktreeSetupStageLabel(stage.id))
        : worktreeSetupStageLabel(stage.id);
  return { label, startedAt: snapshot.startedAt };
}

type RunStatusRow = Extract<ThreadFeedEntry, { readonly type: "thinking" }>;
let cachedRunStatusRow: RunStatusRow | null = null;

const END_LABELS: Partial<Record<ThreadFeedLatestRun["status"], string>> = {
  interrupted: "Stopped",
  cancelled: "Stopped",
  failed: "Failed",
};

/**
 * Android's one-line run status. It is the last row from send until the run settles, the same
 * moment the newest reply gains its footer, so the slot changes owner instead of the feed moving.
 * A run that stops or fails without its reply last keeps the slot as a still end line.
 */
export function appendRunStatusLine(
  rows: ReadonlyArray<PendingThreadFeedEntry>,
  input: {
    readonly activity: string | null;
    /** Subagents of this thread still working; named on the line only while it is live. */
    readonly liveSubagents: number;
    readonly latestRun: ThreadFeedLatestRun | null;
    readonly activeWorkStartedAt: string | null;
    readonly runlessWorkActive: boolean;
    readonly dispatchingMessageId: MessageId | null;
    readonly setupStep: { readonly label: string; readonly startedAt: string } | null;
  },
): ReadonlyArray<PendingThreadFeedEntry> {
  if (input.setupStep !== null) {
    const { label, startedAt } = input.setupStep;
    return [...rows, runStatusRow(startedAt, null, `Working · ${label}`, undefined)];
  }
  const last = rows.at(-1);
  const sending =
    last?.type === "message" &&
    last.pendingMessage !== undefined &&
    (last.acknowledged === true || last.pendingMessage.messageId === input.dispatchingMessageId)
      ? last
      : null;
  const run = threadFeedRunIsUnsettled(input.latestRun) ? input.latestRun : null;
  const runless = input.runlessWorkActive && input.activeWorkStartedAt !== null;
  if (run !== null || runless || sending !== null) {
    const startedAt =
      input.activeWorkStartedAt ?? run?.startedAt ?? sending?.createdAt ?? last?.createdAt ?? "";
    const step =
      input.liveSubagents > 0
        ? `${input.liveSubagents} ${input.liveSubagents === 1 ? "agent" : "agents"}`
        : input.activity;
    const label = step ? `Working · ${step}` : "Working";
    return [...rows, runStatusRow(startedAt, run?.runId ?? null, label, undefined)];
  }

  const ended = input.latestRun;
  const endLabel = ended ? END_LABELS[ended.status] : undefined;
  const replyIsLast =
    last?.type === "message" &&
    last.message.role === "assistant" &&
    last.message.runId === ended?.runId;
  if (!ended || endLabel === undefined || replyIsLast || ended.startedAt === null) return rows;
  return [
    ...rows,
    runStatusRow(ended.startedAt, ended.runId, endLabel, ended.completedAt ?? ended.startedAt),
  ];
}

function runStatusRow(
  startedAt: string,
  runId: RunId | null,
  label: string,
  endedAt: string | undefined,
): RunStatusRow {
  if (
    cachedRunStatusRow?.createdAt !== startedAt ||
    cachedRunStatusRow.runId !== runId ||
    cachedRunStatusRow.label !== label ||
    cachedRunStatusRow.endedAt !== endedAt
  ) {
    cachedRunStatusRow = {
      type: "thinking",
      id: "run-status-line",
      createdAt: startedAt,
      runId,
      label,
      ...(endedAt === undefined ? {} : { endedAt }),
    };
  }
  return cachedRunStatusRow;
}
