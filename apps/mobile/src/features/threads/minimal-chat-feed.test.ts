import {
  CommandId,
  EnvironmentId,
  MessageId,
  RunId,
  RuntimeRequestId,
  ThreadId,
  TurnItemId,
  type OrchestrationV2ProjectedTurnItem,
  type OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { expect, it } from "vite-plus/test";
import { buildThreadFeed, deriveThreadFeedPresentation } from "../../lib/threadActivity";
import { appendRunStatusLine, minimalChatFeed, runStatusActivity } from "./minimal-chat-feed";
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

it("keeps the final reply and live text while removing run details and redundant thinking", () => {
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
  const settled = minimalChatFeed(deriveThreadFeedPresentation(feed(items), null));
  expect(settled.map((entry) => entry.id)).toEqual(["user", "final"]);
  const live = minimalChatFeed(
    deriveThreadFeedPresentation(
      feed(items),
      { runId, status: "running", startedAt: at, completedAt: null },
      at,
    ),
  );
  expect(live.map((entry) => entry.type)).toEqual(["message", "message", "message"]);
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
});

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
  const minimal = minimalChatFeed(presented);
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
  activeWorkStartedAt: null,
  runlessWorkActive: false,
  dispatchingMessageId: null,
} as const;

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
});

it("hands the last slot between the status line and the reply footer as the run settles", () => {
  const slot = (latestRun: typeof running | typeof completed) => {
    const workStartedAt = latestRun === running ? at : null;
    const presented = deriveThreadFeedPresentation(
      feed([userMessage, reply]),
      latestRun,
      workStartedAt,
    );
    const rows = appendRunStatusLine(minimalChatFeed(presented), {
      ...idle,
      activity: runStatusActivity(presented),
      latestRun,
      activeWorkStartedAt: workStartedAt,
    });
    return {
      last: rows.at(-1),
      footer: resolveFooterMessageIds(rows, latestRun === running ? runId : null).assistant,
    };
  };
  expect(slot(running)).toMatchObject({
    last: { type: "thinking", label: "Working", createdAt: at, runId },
    footer: null,
  });
  expect(slot(completed)).toMatchObject({ last: { id: "reply" }, footer: "reply" });
  expect(slot(running).last).toBe(slot(running).last);
});

it("keeps the slot as a still end line when a run stops or fails without its reply last", () => {
  const endedAt = "2026-11-03T10:00:42.000Z";
  const failure: OrchestrationV2TurnItem = {
    ...base("failure"),
    type: "error",
    status: "failed",
    failure: { class: "provider_error", message: "Please retry", code: null, retryable: true },
  };
  const last = (items: OrchestrationV2TurnItem[], status: "interrupted" | "failed") => {
    const latestRun = { runId, status, startedAt: at, completedAt: endedAt };
    const presented = deriveThreadFeedPresentation(feed(items), latestRun);
    return appendRunStatusLine(minimalChatFeed(presented), {
      ...idle,
      activity: runStatusActivity(presented),
      latestRun,
    }).at(-1);
  };
  const ended = { type: "thinking", id: "run-status-line", createdAt: at, endedAt, runId };
  expect(last([userMessage], "interrupted")).toMatchObject({ ...ended, label: "Stopped" });
  expect(last([userMessage, failure], "failed")).toMatchObject({ ...ended, label: "Failed" });
  // A stopped run's partial reply takes the slot with its footer, as a finished reply does.
  expect(last([userMessage, reply], "interrupted")).toMatchObject({ id: "reply" });
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
    label: "Working · Running pwd",
    createdAt: sentAt,
  });
  // A provider-finished run still captures its checkpoint before the reply's footer appears.
  expect(last({ latestRun: { ...running, status: "waiting" } })).toMatchObject({
    label: "Working · Running pwd",
    createdAt: at,
  });
});
