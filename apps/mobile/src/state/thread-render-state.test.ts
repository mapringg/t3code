import {
  EnvironmentId,
  MessageId,
  TurnItemId,
  type OrchestrationV2ThreadProjection,
  type OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import {
  createEnvironmentThreadDetailAtoms,
  EMPTY_ENVIRONMENT_THREAD_STATE,
  type EnvironmentThreadState,
} from "@t3tools/client-runtime/state/threads";
import * as Option from "effect/Option";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";
import { expect, it } from "vite-plus/test";

import {
  v2Now,
  v2Projection,
  v2ThreadId,
} from "../../../../packages/client-runtime/src/state/orchestrationV2TestFixtures";
import { createThreadRenderStateAtom } from "./thread-render-state";

it("keeps the chat snapshot stable through streaming while text and control states stay live", () => {
  const assistant: OrchestrationV2TurnItem = {
    id: TurnItemId.make("assistant"),
    threadId: v2ThreadId,
    runId: null,
    nodeId: null,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal: 1,
    status: "running",
    title: null,
    startedAt: v2Now,
    completedAt: null,
    updatedAt: v2Now,
    type: "assistant_message",
    messageId: MessageId.make("assistant-message"),
    text: "First",
    streaming: true,
  };
  const projection = (item: OrchestrationV2TurnItem): OrchestrationV2ThreadProjection => ({
    ...v2Projection,
    messages:
      item.type === "assistant_message"
        ? [
            {
              id: item.messageId!,
              threadId: v2ThreadId,
              runId: null,
              nodeId: null,
              role: "assistant",
              createdBy: "agent",
              creationSource: "provider",
              text: item.text,
              attachments: [],
              streaming: item.streaming,
              createdAt: v2Now,
              updatedAt: item.updatedAt,
            },
          ]
        : [],
    turnItems: [item],
    visibleTurnItems: [
      {
        position: 0,
        visibility: "local",
        sourceThreadId: v2ThreadId,
        sourceItemId: item.id,
        item,
      },
    ],
  });
  const state = Atom.make(AsyncResult.success(EMPTY_ENVIRONMENT_THREAD_STATE));
  const details = createEnvironmentThreadDetailAtoms(() => state);
  const ref = { environmentId: EnvironmentId.make("environment"), threadId: v2ThreadId };
  const render = createThreadRenderStateAtom(state);
  const text = details.assistantMessageTextAtom(ref, assistant.id);
  const timeline = details.timelineVisibleTurnItemsAtom(ref);
  const registry = AtomRegistry.make();
  const push = (next: EnvironmentThreadState) => registry.set(state, AsyncResult.success(next));
  const live: EnvironmentThreadState = {
    ...EMPTY_ENVIRONMENT_THREAD_STATE,
    status: "live",
    data: Option.some(projection(assistant)),
    sequence: 1,
  };
  try {
    registry.mount(render);
    registry.mount(text);
    registry.mount(timeline);
    expect(registry.get(render)).toBe(EMPTY_ENVIRONMENT_THREAD_STATE);
    push({ ...live, status: "synchronizing" });
    expect(registry.get(render).status).toBe("synchronizing");
    push(live);
    const first = registry.get(render);
    const firstTimeline = registry.get(timeline);
    const streamed = projection({ ...assistant, text: "More" });
    push({
      ...live,
      sequence: 2,
      data: Option.some({
        ...projection(assistant),
        messages: streamed.messages,
      }),
    });
    expect(registry.get(render)).toBe(first);
    push({ ...live, sequence: 3, data: Option.some(streamed) });
    expect(registry.get(render)).toBe(first);
    expect(registry.get(timeline)).toBe(firstTimeline);
    expect(registry.get(text)).toBe("More");
    expect(registry.get(details.sequenceAtom(ref))).toBe(3);

    const messageFinished = {
      ...streamed,
      messages: streamed.messages.map((message) => ({ ...message, streaming: false })),
    };
    push({ ...live, data: Option.some(messageFinished) });
    expect(Option.getOrNull(registry.get(render).data)?.messages[0]?.streaming).toBe(false);
    const fallback = { ...streamed, turnItems: [], visibleTurnItems: [] };
    push({ ...live, data: Option.some(fallback) });
    push({
      ...live,
      data: Option.some({
        ...fallback,
        messages: fallback.messages.map((message) => ({ ...message, text: "Message only" })),
      }),
    });
    expect(Option.getOrNull(registry.get(render).data)?.messages[0]?.text).toBe("Message only");

    push({ ...live, error: Option.some("Disconnected") });
    expect(Option.getOrNull(registry.get(render).error)).toBe("Disconnected");
    const history = { ...live.history, loading: true };
    push({ ...live, history });
    expect(registry.get(render).history).toBe(history);
    push({
      ...live,
      data: Option.some(
        projection({ ...assistant, streaming: false, status: "completed", text: "Done" }),
      ),
    });
    expect(Option.getOrNull(registry.get(render).data)?.turnItems[0]).toMatchObject({
      streaming: false,
      status: "completed",
      text: "Done",
    });
    push({ ...EMPTY_ENVIRONMENT_THREAD_STATE, status: "deleted" });
    expect(registry.get(render).status).toBe("deleted");
    expect(registry.get(text)).toBeNull();
    push(EMPTY_ENVIRONMENT_THREAD_STATE);
    expect(registry.get(render)).toBe(EMPTY_ENVIRONMENT_THREAD_STATE);
  } finally {
    registry.dispose();
  }
});
