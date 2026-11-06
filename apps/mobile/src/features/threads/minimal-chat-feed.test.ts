import {
  CommandId,
  EnvironmentId,
  MessageId,
  RunId,
  RuntimeRequestId,
  ThreadId,
  TurnItemId,
  type WorktreeSetupSnapshot,
  type OrchestrationV2ProjectedTurnItem,
  type OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { expect, it } from "vite-plus/test";
import { buildThreadFeed, deriveThreadFeedPresentation } from "../../lib/threadActivity";
import {
  appendRunStatusLine,
  minimalChatFeed,
  briefStep,
  runStatusActivity,
  runWaitingLabel,
  worktreeSetupRunStep,
} from "./minimal-chat-feed";
import { resolveFooterMessageIds } from "./pending-thread-feed";

const threadId = ThreadId.make("thread");
const runId = RunId.make("run");
const at = "2026-11-03T10:00:00.000Z";

function base(id: string) {
  const timestamp = DateTime.makeUnsafe(at);
  return {
    id: TurnItemId.make(id),
    threadId,
    runId,
    nodeId: null,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal: 0,
    status: "completed" as const,
    title: null,
    startedAt: timestamp,
    completedAt: timestamp,
    updatedAt: timestamp,
  };
}

function feed(items: ReadonlyArray<OrchestrationV2TurnItem>) {
  return buildThreadFeed(
    items.map((item, position): OrchestrationV2ProjectedTurnItem => ({
      position,
      visibility: "local",
      sourceThreadId: threadId,
      sourceItemId: item.id,
      item,
    })),
  );
}

const command = {
  ...base("command"),
  type: "command_execution" as const,
  input: "pwd",
  output: "/workspace",
  exitCode: 0,
};

it("keeps every reply of a run in order, live and settled, without run details or thinking", () => {
  const items: OrchestrationV2TurnItem[] = [
    {
      ...base("user"),
      type: "user_message",
      messageId: MessageId.make("user"),
      createdBy: "user",
      creationSource: "mobile",
      inputIntent: "turn_start",
      text: "Check the workspace",
      attachments: [],
    },
    {
      ...base("intermediate"),
      type: "assistant_message",
      messageId: MessageId.make("intermediate"),
      text: "I will check it.",
      streaming: false,
    },
    command,
    {
      ...base("final"),
      type: "assistant_message",
      messageId: MessageId.make("final"),
      text: "The workspace is ready.",
      streaming: false,
    },
  ];
  // The feed is the unfolded conversation; run state does not change which replies show.
  const settled = minimalChatFeed(feed(items));
  expect(settled.map((entry) => entry.id)).toEqual(["user", "intermediate", "final"]);
  const live = minimalChatFeed(feed(items));
  expect(live.map((entry) => entry.id)).toEqual(["user", "intermediate", "final"]);
});

it("keeps provider failures while removing adjacent tool activity", () => {
  const failure: OrchestrationV2TurnItem = {
    ...base("failure"),
    type: "error",
    status: "failed",
    failure: { class: "provider_error", message: "Please retry", code: null, retryable: true },
  };
  const entries = feed([command, failure]);
  const errorGroup = entries.find((entry) => entry.type === "activity-group");
  if (errorGroup?.type !== "activity-group") throw new Error("Expected activity group");
  const mixed = {
    ...errorGroup,
    activities: entries.flatMap((entry) =>
      entry.type === "activity-group" ? entry.activities : [],
    ),
  };
  const minimal = minimalChatFeed([mixed]);
  expect(minimal).toMatchObject([
    { type: "activity-group", activities: [{ projectedItem: { item: failure } }] },
  ]);
  // A provider that also wrote the failure as its reply shows it once, as the reply.
  const echoed: OrchestrationV2TurnItem = {
    ...base("echo"),
    type: "assistant_message",
    messageId: MessageId.make("echo"),
    text: "API Error: Please retry",
    streaming: false,
  };
  expect(minimalChatFeed(feed([echoed, failure])).map((entry) => entry.id)).toEqual(["echo"]);
});

const openQuestion: OrchestrationV2TurnItem = {
  ...base("question"),
  type: "user_input_request",
  status: "waiting",
  completedAt: null,
  requestId: RuntimeRequestId.make("question"),
  questions: [],
};

it("preserves requests and generated content when tool details are hidden", () => {
  const source = feed([
    {
      ...base("approved"),
      type: "approval_request",
      requestId: RuntimeRequestId.make("approved"),
      requestKind: "file-change",
    },
    {
      ...base("saved"),
      type: "secret_request",
      label: "Old API key",
      reason: "Already connected",
      secretStatus: "saved",
    },
    {
      ...base("linked"),
      type: "link_request",
      reason: "Already linked",
      linkStatus: "linked",
    },
    {
      ...base("stopped"),
      type: "run_interrupt_result",
      message: "Stopped",
    },
    {
      ...base("waiting"),
      type: "approval_request",
      status: "waiting",
      completedAt: null,
      requestId: RuntimeRequestId.make("waiting"),
      requestKind: "file-change",
    },
    openQuestion,
    {
      ...base("secret"),
      type: "secret_request",
      label: "API key",
      reason: "Needed to connect",
      secretStatus: "pending",
    },
    {
      ...base("link"),
      type: "link_request",
      reason: "Connect the environment",
      linkStatus: "pending",
    },
    {
      ...base("visual"),
      type: "dynamic_tool",
      toolName: "html_render",
      input: {},
      output: { htmlRender: { attachmentId: "visual", title: "Preview", height: 200 } },
    },
    {
      ...base("app"),
      type: "dynamic_tool",
      toolName: "example.preview",
      input: {},
      output: {
        t3McpApp: {
          attachmentId: "app",
          server: "example",
          tool: "preview",
          resourceUri: "ui://example/preview",
        },
      },
    },
  ]);
  const presented = source;
  const minimal = minimalChatFeed(presented, { approval: null, userInput: "question" });
  expect(minimal).toMatchObject([
    {
      type: "activity-group",
      activities: [{ projectedItem: { item: { type: "approval_request", status: "waiting" } } }],
    },
    {
      type: "activity-group",
      activities: [{ projectedItem: { item: { type: "secret_request" } } }],
    },
    { type: "activity-group", activities: [{ projectedItem: { item: { type: "link_request" } } }] },
    { type: "html-render", render: { attachmentId: "visual" } },
    { type: "mcp-app", app: { attachmentId: "app" } },
  ]);
  expect(minimal[3]).toBe(presented.find((entry) => entry.type === "html-render"));
  expect(minimal[4]).toBe(presented.find((entry) => entry.type === "mcp-app"));
  // Open requests are the ones their cards show; those step out of the feed, and the status line
  // says what the run awaits.
  const open = { approval: "waiting", userInput: "question" };
  expect(runWaitingLabel({ approval: null, userInput: null })).toBeNull();
  expect(runWaitingLabel({ approval: "waiting", userInput: null })).toBe("Waiting for approval");
  expect(
    minimalChatFeed(presented, open).some(
      (entry) =>
        entry.type === "activity-group" &&
        entry.activities.some(
          ({ projectedItem }) => projectedItem.item.type === "approval_request",
        ),
    ),
  ).toBe(false);
  // An async question's item completes before its request is answered.
  const asyncQuestion = feed([
    { ...openQuestion, status: "completed", completedAt: base("x").startedAt },
  ]);
  expect(minimalChatFeed(asyncQuestion, open)).toEqual([]);
  expect(runWaitingLabel(open)).toBe("Waiting for your answer");
});

const userMessage: OrchestrationV2TurnItem = {
  ...base("user"),
  type: "user_message",
  messageId: MessageId.make("user"),
  createdBy: "user",
  creationSource: "mobile",
  inputIntent: "turn_start",
  text: "Run the tests",
  attachments: [],
};
const reply: OrchestrationV2TurnItem = {
  ...base("reply"),
  type: "assistant_message",
  messageId: MessageId.make("reply"),
  text: "All green.",
  streaming: false,
};
const running = { runId, status: "running", startedAt: at, completedAt: null } as const;
const completed = { runId, status: "completed", startedAt: at, completedAt: at } as const;
const idle = {
  liveSubagents: 0,
  activeWorkStartedAt: null,
  runlessWorkActive: false,
  dispatchingMessageId: null,
  setupStep: null,
} as const;

it("keeps a step to one short line by naming files, not paths", () => {
  expect(briefStep("Read /home/me/code/t3/package.json")).toBe("Read package.json");
  expect(briefStep("/home/me/code/t3/src/math.ts")).toBe("math.ts");
  expect(briefStep("Edit ./src/a.ts and ../b/c.ts")).toBe("Edit a.ts and c.ts");
  expect(briefStep("Edit src/features/a.ts")).toBe("Edit a.ts");
  expect(briefStep("Searching /usr/lib/node")).toBe("Searching /usr/lib/node");
  expect(briefStep("Running vp test")).toBe("Running vp test");
  // Commands and URLs keep what they act on.
  expect(briefStep("Running rm -rf /x/build")).toBe("Running rm -rf /x/build");
  expect(briefStep("Fetch https://example.com/a/b")).toBe("Fetch https://example.com/a/b");
});

it("names the live step, and none when the provider reports no step", () => {
  const { output: _output, exitCode: _exitCode, ...pending } = command;
  const runningCommand: OrchestrationV2TurnItem = {
    ...pending,
    status: "running",
    completedAt: null,
  };
  const step = deriveThreadFeedPresentation(feed([userMessage, runningCommand]), running, at);
  expect(runStatusActivity(step)).toBe("Running pwd");
  const thinking = deriveThreadFeedPresentation(feed([userMessage]), running, at);
  expect(runStatusActivity(thinking)).toBeNull();
  // Waiting on the reader is no work in progress, so the line drops its running time.
  expect(
    appendRunStatusLine(minimalChatFeed(thinking), {
      ...idle,
      activity: null,
      waiting: "Waiting for your answer",
      latestRun: running,
      activeWorkStartedAt: at,
    }).at(-1),
  ).toMatchObject({ label: "Waiting for your answer", untimed: true });
});

it("keeps the last row in place as the run settles, blank or naming how it ended", () => {
  const previousRunId = RunId.make("previous");
  const previousTurn: OrchestrationV2TurnItem[] = [
    {
      ...userMessage,
      id: TurnItemId.make("prev-user"),
      messageId: MessageId.make("prev-user"),
      runId: previousRunId,
    },
    {
      ...reply,
      id: TurnItemId.make("prev-reply"),
      messageId: MessageId.make("prev-reply"),
      runId: previousRunId,
    },
  ];
  const intermediate: OrchestrationV2TurnItem = {
    ...base("intermediate"),
    type: "assistant_message",
    messageId: MessageId.make("intermediate"),
    text: "Running them now.",
    streaming: false,
  };
  const turn = [...previousTurn, userMessage, intermediate, command, reply];
  const interrupted = { ...completed, status: "interrupted" } as const;
  const slot = (latestRun: typeof running | typeof completed | typeof interrupted) => {
    const workStartedAt = latestRun === running ? at : null;
    const presented = deriveThreadFeedPresentation(feed(turn), latestRun, workStartedAt);
    const rows = appendRunStatusLine(minimalChatFeed(feed(turn)), {
      ...idle,
      activity: runStatusActivity(presented),
      latestRun,
      activeWorkStartedAt: workStartedAt,
    });
    return {
      above: rows
        .slice(
          0,
          rows.findIndex((row) => row.id === "reply"),
        )
        .map((row) => row.id),
      last: rows.at(-1),
      footer: resolveFooterMessageIds(rows, latestRun === running ? runId : null).assistant,
    };
  };
  // Nothing above the final reply changes when the run ends: earlier replies stay put.
  const above = ["prev-user", "prev-reply", "user", "intermediate"];
  expect(slot(running)).toMatchObject({
    above,
    last: { type: "thinking", label: "Working…", createdAt: at, runId },
    footer: null,
  });
  // Removing the line would shrink the list and clamp the anchored turn's offset.
  const line = { id: "run-status-line", runId };
  expect(slot(completed)).toMatchObject({ above, last: { ...line, label: "" }, footer: "reply" });
  expect(slot(interrupted)).toMatchObject({
    above,
    last: { ...line, label: "Stopped" },
    footer: "reply",
  });
  expect(slot(running).last).toBe(slot(running).last);
});

it("says once how a stopped or failed run ended", () => {
  const endedAt = "2026-11-03T10:00:42.000Z";
  const failure: OrchestrationV2TurnItem = {
    ...base("failure"),
    type: "error",
    status: "failed",
    failure: { class: "provider_error", message: "Please retry", code: null, retryable: true },
  };
  const rows = (items: OrchestrationV2TurnItem[], status: "interrupted" | "failed") => {
    const latestRun = { runId, status, startedAt: at, completedAt: endedAt };
    const presented = deriveThreadFeedPresentation(feed(items), latestRun);
    return appendRunStatusLine(minimalChatFeed(feed(items)), {
      ...idle,
      activity: runStatusActivity(presented),
      latestRun,
    });
  };
  const last = (items: OrchestrationV2TurnItem[], status: "interrupted" | "failed") =>
    rows(items, status).at(-1);
  const ended = { type: "thinking", id: "run-status-line", createdAt: at, runId };
  expect(last([userMessage], "interrupted")).toMatchObject({ ...ended, label: "Stopped" });
  expect(last([userMessage, reply], "interrupted")).toMatchObject({ ...ended, label: "Stopped" });
  expect(last([userMessage, reply], "failed")).toMatchObject({ ...ended, label: "Failed" });
  // The error row already says the run failed; the line stays, blank.
  expect(last([userMessage, failure], "failed")).toMatchObject({ ...ended, label: "" });
  expect(last([userMessage, reply, failure], "failed")).toMatchObject({ ...ended, label: "" });
  expect(rows([userMessage, command], "interrupted").map((row) => row.id)).toEqual([
    "user",
    "run-status-line",
  ]);
  // An older turn keeps how it ended once a newer one starts, unless its error row says so.
  const previous = RunId.make("previous");
  const earlier = (id: string, item: OrchestrationV2TurnItem): OrchestrationV2TurnItem =>
    ({ ...item, id: TurnItemId.make(id), runId: previous }) as OrchestrationV2TurnItem;
  const later = (olderItems: OrchestrationV2TurnItem[]) =>
    appendRunStatusLine(minimalChatFeed(feed([...olderItems, userMessage, reply])), {
      ...idle,
      activity: null,
      latestRun: completed,
      endedRuns: new Map([[previous, "Stopped"]]),
    }).map((row) => row.id);
  expect(
    later([
      earlier("prev-user", { ...userMessage, messageId: MessageId.make("prev-user") }),
      earlier("prev-reply", { ...reply, messageId: MessageId.make("prev-reply") }),
    ]),
  ).toEqual(["prev-user", "prev-reply", "run-end:previous", "user", "reply", "run-status-line"]);
  expect(
    later([
      earlier("prev-user", { ...userMessage, messageId: MessageId.make("prev-user") }),
      earlier("prev-failure", failure),
    ]),
  ).not.toContain("run-end:previous");
});

it("shows the status line from send, below pending messages, until the run settles", () => {
  const rows = minimalChatFeed(deriveThreadFeedPresentation(feed([userMessage]), null));
  const sentAt = "2026-11-03T10:01:00.000Z";
  const pendingMessage = {
    environmentId: EnvironmentId.make("local"),
    threadId,
    messageId: MessageId.make("sent"),
    commandId: CommandId.make("command"),
    text: "Another",
    attachments: [],
    createdAt: sentAt,
  };
  const pending = {
    type: "message" as const,
    id: pendingMessage.messageId,
    createdAt: sentAt,
    pendingMessage,
    message: {
      id: pendingMessage.messageId,
      role: "user" as const,
      text: pendingMessage.text,
      attachments: [],
      createdAt: sentAt,
      updatedAt: sentAt,
      runId: null,
      streaming: false,
      visibility: "local" as const,
      sourceThreadId: threadId,
    },
  };
  const last = (input: Partial<Parameters<typeof appendRunStatusLine>[1]>) =>
    appendRunStatusLine([...rows, pending], {
      ...idle,
      activity: "Running pwd",
      latestRun: null,
      ...input,
    }).at(-1);
  expect(last({})).toBe(pending);
  expect(last({ dispatchingMessageId: pendingMessage.messageId })).toMatchObject({
    type: "thinking",
    label: "Running pwd",
    createdAt: sentAt,
  });
  // A provider-finished run still captures its checkpoint before the reply's footer appears.
  expect(last({ latestRun: { ...running, status: "waiting" } })).toMatchObject({
    label: "Running pwd",
    createdAt: at,
  });
  expect(last({ latestRun: running, liveSubagents: 1 })).toMatchObject({
    label: "1 agent working",
  });
  expect(last({ latestRun: running, liveSubagents: 2 })).toMatchObject({
    label: "2 agents working",
  });
  expect(last({ latestRun: completed, liveSubagents: 2 })).toMatchObject({ label: "" });
});

it("names the worktree setup step on the status line until the first turn starts", () => {
  const setupAt = "2026-11-03T09:59:50.000Z";
  const stage = (
    id: WorktreeSetupSnapshot["stages"][number]["id"],
    status: "running" | "done",
  ) => ({
    id,
    status,
    startedAt: setupAt,
    endedAt: null,
    percent: null,
    detail: null,
    tail: [],
  });
  const snapshot: WorktreeSetupSnapshot = {
    threadId,
    sequence: 1,
    phase: "running",
    startedAt: setupAt,
    endedAt: null,
    branch: "feature",
    baseRef: "main",
    worktreePath: null,
    setupScript: { name: "Setup Worktree", command: "node setup.ts", terminalId: "setup" },
    stages: [],
    error: null,
  };
  const step = (input: Partial<WorktreeSetupSnapshot>, turnStarted = false) =>
    worktreeSetupRunStep({ snapshot: { ...snapshot, ...input }, turnStarted })?.label ?? null;
  expect(step({})).toBe("Setting up worktree");
  expect(step({ stages: [stage("fetch", "done"), stage("checkout", "running")] })).toBe(
    "Check out files",
  );
  expect(step({ stages: [stage("setup-script", "running")] })).toBe("Setup Worktree");
  expect(step({ stages: [stage("setup-script", "running")], setupScript: null })).toBe(
    "Run setup script",
  );
  // Setup that finished before the turn starts keeps the line until the agent takes it over.
  expect(step({ phase: "done", stages: [stage("agent", "running")] })).toBe("Start agent");
  expect(step({ phase: "failed" })).toBeNull();
  expect(step({ phase: "cancelled" })).toBeNull();
  expect(step({ stages: [stage("setup-script", "running")] }, true)).toBeNull();

  const rows = minimalChatFeed(deriveThreadFeedPresentation(feed([userMessage]), null));
  const line = appendRunStatusLine(rows, {
    ...idle,
    activity: null,
    latestRun: { ...running, status: "preparing", startedAt: null },
    setupStep: worktreeSetupRunStep({ snapshot, turnStarted: false }),
  }).at(-1);
  expect(line).toMatchObject({
    type: "thinking",
    id: "run-status-line",
    label: "Setting up worktree",
    createdAt: setupAt,
    runId: null,
  });
});
