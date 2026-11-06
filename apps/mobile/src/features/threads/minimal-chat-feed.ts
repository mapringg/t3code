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

const END_LABELS: Partial<Record<string, string>> = {
  interrupted: "Stopped",
  cancelled: "Stopped",
  failed: "Failed",
};

/** What a run's status says about how it ended, if it stopped or failed. */
export function runEndLabel(status: string): string | undefined {
  return END_LABELS[status];
}

function rowRunId(row: PendingThreadFeedEntry): RunId | null {
  if (row.type === "message") return row.message.runId ?? null;
  if (row.type === "activity-group") return row.activities.at(-1)?.projectedItem.item.runId ?? null;
  if (row.type === "html-render" || row.type === "mcp-app") return row.runId ?? null;
  return null;
}

function rowShowsError(row: PendingThreadFeedEntry, runId: RunId) {
  return (
    row.type === "activity-group" &&
    row.activities.some(
      ({ projectedItem: { item } }) => item.type === "error" && item.runId === runId,
    )
  );
}

const runEndRows = new Map<string, RunStatusRow>();
const NO_ENDED_RUNS: ReadonlyMap<RunId, string> = new Map();

/**
 * Older stopped or failed turns keep a still line saying so after their last row, as the
 * newest turn's status line said while it was last. An error row already says it.
 */
function withOlderRunEnds(
  rows: ReadonlyArray<PendingThreadFeedEntry>,
  endedRuns: ReadonlyMap<RunId, string>,
  latestRunId: RunId | null,
): ReadonlyArray<PendingThreadFeedEntry> {
  if (endedRuns.size === 0) return rows;
  const lastIndexByRun = new Map<RunId, number>();
  const errorShown = new Set<RunId>();
  rows.forEach((row, index) => {
    const runId = rowRunId(row);
    if (runId === null || runId === latestRunId || !endedRuns.has(runId)) return;
    lastIndexByRun.set(runId, index);
    if (rowShowsError(row, runId)) errorShown.add(runId);
  });
  if (lastIndexByRun.size === 0) return rows;
  return rows.flatMap((row, index) => {
    const runId = rowRunId(row);
    if (runId === null || lastIndexByRun.get(runId) !== index || errorShown.has(runId)) {
      return [row];
    }
    const label = endedRuns.get(runId)!;
    const key = `${runId}\t${label}\t${row.createdAt}`;
    let end = runEndRows.get(key);
    if (end === undefined) {
      end = {
        type: "thinking",
        id: `run-end:${runId}`,
        createdAt: row.createdAt,
        runId,
        label,
        untimed: true,
      };
      runEndRows.set(key, end);
    }
    return [row, end];
  });
}

/**
 * Android's one-line run status, always the last row once a run has started. It names the step
 * while the run works, then says how the run ended if it stopped or failed, or goes blank, so the
 * feed never loses a row under the reader.
 */
export function appendRunStatusLine(
  feedRows: ReadonlyArray<PendingThreadFeedEntry>,
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
    /** How each stopped or failed run ended, for the turns before the latest. */
    readonly endedRuns?: ReadonlyMap<RunId, string>;
  },
): ReadonlyArray<PendingThreadFeedEntry> {
  const last = feedRows.at(-1);
  const sending =
    last?.type === "message" &&
    last.pendingMessage !== undefined &&
    (last.acknowledged === true || last.pendingMessage.messageId === input.dispatchingMessageId)
      ? last
      : null;
  const run = threadFeedRunIsUnsettled(input.latestRun) ? input.latestRun : null;
  const runless = input.runlessWorkActive && input.activeWorkStartedAt !== null;
  // Once a new turn is on its way, the latest run is an older turn: it keeps its end line.
  const newTurn = input.setupStep !== null || sending !== null || runless;
  const rows = withOlderRunEnds(
    feedRows,
    input.endedRuns ?? NO_ENDED_RUNS,
    newTurn && run === null ? null : (input.latestRun?.runId ?? null),
  );
  if (input.setupStep !== null) {
    const { label, startedAt } = input.setupStep;
    return [...rows, runStatusRow(startedAt, null, label, undefined)];
  }
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
  if (!ended || ended.startedAt === null) return rows;
  // A kept error row already says the run failed.
  const errorShown = rows.some(
    (row) =>
      row.type === "activity-group" &&
      row.activities.some(
        ({ projectedItem: { item } }) => item.type === "error" && item.runId === ended.runId,
      ),
  );
  const label = errorShown ? "" : (END_LABELS[ended.status] ?? "");
  // The line stays once the run settles: removing the row would shrink the list and clamp its
  // offset, dropping the turn the send anchored.
  return [...rows, runStatusRow(ended.startedAt, ended.runId, label, undefined, true)];
}

/**
 * File steps name only their file, so the line stays short. Commands, searches and URLs stay
 * as written: shortening `rm -rf /x/build` would misstate what it touches.
 */
export function briefStep(step: string): string {
  // A search or listing is scoped by its path, so the path is what the step says.
  if (/^(?:Running|Search|Find|Grep|Glob|List)/.test(step)) return step;
  return step.replace(
    /(^|\s)(?:~|\.{1,2})?\/?(?:[^\s/]+\/)+([^\s/]+)/g,
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
