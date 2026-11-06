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

function keepActivity(
  activity: ThreadFeedActivity,
  open: OpenRequests,
  replyTexts: ReadonlyMap<RunId, ReadonlyArray<string>>,
) {
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
    case "error": {
      // Providers often write the failure as the run's reply too; it reads once, not twice.
      const message = item.failure.message.trim();
      const replies = item.runId === null ? undefined : replyTexts.get(item.runId);
      return message === "" || !replies?.some((text) => text.includes(message));
    }
    case "proposed_plan":
    case "system_notice":
      return true;
    default:
      return false;
  }
}

/**
 * Android's chat is messages in order: every reply a run writes stays where it appeared, and
 * its tool work stays out of the feed. Built from the unfolded feed, so nothing read is taken back.
 */
export function minimalChatFeed(
  feed: ReadonlyArray<ThreadFeedEntry>,
  open: OpenRequests = NO_OPEN_REQUESTS,
): ThreadFeedEntry[] {
  const replyTexts = new Map<RunId, string[]>();
  for (const entry of feed) {
    if (entry.type !== "message" || entry.message.role !== "assistant") continue;
    const runId = entry.message.runId;
    if (runId === null || runId === undefined) continue;
    replyTexts.set(runId, [...(replyTexts.get(runId) ?? []), entry.message.text]);
  }
  return feed.flatMap((entry): ThreadFeedEntry[] => {
    switch (entry.type) {
      case "message":
        if (isCompactionCommandMessage(entry.message)) return [];
        return [entry];
      case "html-render":
      case "mcp-app":
        return [entry];
      case "activity-group": {
        const activities = entry.activities.filter((activity) =>
          keepActivity(activity, open, replyTexts),
        );
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
    return [...rows, runStatusRow(startedAt, null, label, undefined)];
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
        ? `${input.liveSubagents} ${input.liveSubagents === 1 ? "agent" : "agents"} working`
        : input.activity;
    if (input.waiting) {
      return [...rows, runStatusRow(startedAt, run?.runId ?? null, input.waiting, undefined, true)];
    }
    // The step alone, as Gemini names what it is doing; no step reads as plain work.
    const label = step ? briefStep(step) : "Working…";
    return [...rows, runStatusRow(startedAt, run?.runId ?? null, label, undefined)];
  }

  const ended = input.latestRun;
  const endLabel = ended ? END_LABELS[ended.status] : undefined;
  // A run with a reply already says how it ended in that reply's slot.
  const runHasReply = rows.some(
    (row) =>
      row.type === "message" &&
      row.message.role === "assistant" &&
      row.message.runId === ended?.runId,
  );
  if (!ended || endLabel === undefined || runHasReply || ended.startedAt === null) return rows;
  return [
    // The end line opens the same run sheet, so the run's fold line would only repeat it.
    ...rows.filter((row) => row.type !== "run-fold" || row.runId !== ended.runId),
    runStatusRow(ended.startedAt, ended.runId, endLabel, ended.completedAt ?? ended.startedAt),
  ];
}

/**
 * File steps name only their file, so the line stays short. Commands and URLs stay as written:
 * shortening `rm -rf /x/build` would misstate what it touches.
 */
export function briefStep(step: string): string {
  if (/^Running\b/.test(step)) return step;
  return step.replace(
    /(^|\s)(?:~|\.{1,2})?\/(?:[^\s/]+\/)+([^\s/]+)/g,
    (_match, lead: string, file: string) => `${lead}${file}`,
  );
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
