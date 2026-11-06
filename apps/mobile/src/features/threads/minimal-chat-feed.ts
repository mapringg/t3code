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

/**
 * The requests the cards above the composer show. Item status is not used: an async question's
 * item completes before its request, and an orphaned pending item has no card to answer it.
 */
export type OpenRequests = {
  readonly approval: string | null;
  readonly userInput: string | null;
};

const NO_OPEN_REQUESTS: OpenRequests = { approval: null, userInput: null };

function isOpenRequest(
  activity: ThreadFeedActivity,
  type: "approval_request" | "user_input_request",
  open: OpenRequests,
) {
  const item = activity.projectedItem.item;
  if (item.type !== type) return false;
  const openId = type === "approval_request" ? open.approval : open.userInput;
  return openId !== null && item.requestId === openId;
}

function keepActivity(activity: ThreadFeedActivity, open: OpenRequests) {
  const item = activity.projectedItem.item;
  switch (item.type) {
    case "approval_request":
      // The open approval is its card above the composer.
      if (isOpenRequest(activity, "approval_request", open)) return false;
      return (
        item.status !== "completed" && item.status !== "cancelled" && item.status !== "interrupted"
      );
    case "secret_request":
      return item.secretStatus === "pending";
    case "link_request":
      return item.linkStatus === "pending" || item.linkStatus === "failed";
    case "user_input_request":
      // The open question is the card above the composer; the feed keeps it once answered.
      return !isOpenRequest(activity, "user_input_request", open);
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
 * A settled run keeps one line above it that opens the run sheet with its earlier replies and work.
 */
export function minimalChatFeed(
  feed: ReadonlyArray<ThreadFeedEntry>,
  open: OpenRequests = NO_OPEN_REQUESTS,
): ThreadFeedEntry[] {
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
      case "run-fold":
        return [entry];
      case "activity-group": {
        const activities = entry.activities.filter((activity) => keepActivity(activity, open));
        if (activities.length === 0) return [];
        return [activities.length === entry.activities.length ? entry : { ...entry, activities }];
      }
      default:
        return [];
    }
  });
}

type RunFoldRow = Extract<ThreadFeedEntry, { readonly type: "run-fold" }>;

/**
 * The newest settled reply's footer carries its run line, taking the status line's slot, so
 * settling a run adds nothing above the reply. Older replies keep the line above them.
 */
export function takeFooterRunFold<Row extends ThreadFeedEntry>(
  rows: ReadonlyArray<Row>,
  footerAssistantMessageId: MessageId | null,
): { readonly rows: ReadonlyArray<Row>; readonly fold: RunFoldRow | null } {
  if (footerAssistantMessageId === null) return { rows, fold: null };
  let runId: RunId | null = null;
  for (const row of rows) {
    if (row.type === "message" && row.message.id === footerAssistantMessageId) {
      runId = row.message.runId;
    }
  }
  const fold = rows.find(
    (row): row is Row & RunFoldRow => row.type === "run-fold" && row.runId === runId,
  );
  return fold === undefined
    ? { rows, fold: null }
    : { rows: rows.filter((row) => row !== fold), fold };
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

/** What a live run waits on from the reader: the request its card above the composer shows. */
export function runWaitingLabel(open: OpenRequests): string | null {
  if (open.userInput !== null) return "Waiting for your answer";
  if (open.approval !== null) return "Waiting for approval";
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
    /** A question or approval the run waits on; it replaces the step and elapsed-time wording. */
    readonly waiting?: string | null;
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
    if (input.waiting) {
      return [...rows, runStatusRow(startedAt, run?.runId ?? null, input.waiting, undefined, true)];
    }
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
    // The end line opens the same run sheet, so the run's fold line would only repeat it.
    ...rows.filter((row) => row.type !== "run-fold" || row.runId !== ended.runId),
    runStatusRow(ended.startedAt, ended.runId, endLabel, ended.completedAt ?? ended.startedAt),
  ];
}

function runStatusRow(
  startedAt: string,
  runId: RunId | null,
  label: string,
  endedAt: string | undefined,
  untimed = false,
): RunStatusRow {
  if (
    cachedRunStatusRow?.createdAt !== startedAt ||
    cachedRunStatusRow.runId !== runId ||
    cachedRunStatusRow.label !== label ||
    cachedRunStatusRow.endedAt !== endedAt ||
    (cachedRunStatusRow.untimed ?? false) !== untimed
  ) {
    cachedRunStatusRow = {
      type: "thinking",
      id: "run-status-line",
      createdAt: startedAt,
      runId,
      label,
      ...(endedAt === undefined ? {} : { endedAt }),
      ...(untimed ? { untimed } : {}),
    };
  }
  return cachedRunStatusRow;
}
