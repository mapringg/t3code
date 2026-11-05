import type {
  EnvironmentId,
  OrchestrationV2Subagent,
  OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import { View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import { SymbolView } from "../../components/ui/AppSymbol";
import { cn } from "../../lib/cn";
import { useEnvironments } from "../../state/environments";
import { subagentCardElapsed } from "./subagent-card-presentation";
import { resolveSubagentRowPresentation, subagentThreadTarget } from "./threadAgentsPresentation";
import { useOpenLinkedThread } from "./useOpenLinkedThread";
import { useVisibleSecondClock } from "./use-visible-second-clock";
import { WorkLogIconSlot, WorkLogPressable } from "./work-log-layout";

type SubagentItem = Extract<OrchestrationV2TurnItem, { readonly type: "subagent" }>;

// Only a failure takes colour; working and settled differ by weight and the ticking time.
const DOT_CLASS = {
  working: "bg-foreground",
  completed: "bg-foreground-muted",
  stopped: "bg-foreground-muted",
  failed: "bg-adaptive-rose-600-400",
} as const;

function Elapsed(props: {
  readonly agent: Pick<OrchestrationV2Subagent, "status" | "startedAt" | "completedAt">;
  readonly live: boolean;
}) {
  const nowMs = useVisibleSecondClock(props.live);
  const elapsed = subagentCardElapsed([props.agent], nowMs);
  return elapsed ? (
    <Text className="shrink-0 text-xs tabular-nums text-foreground-muted">{elapsed}</Text>
  ) : null;
}

/** A subagent in the run sheet: one line that opens its thread, where its details live. */
export function ThreadRunSubagentRow(props: {
  readonly environmentId: EnvironmentId;
  readonly item: SubagentItem;
  /** The projection's record, whose status runs ahead of the turn item's. */
  readonly live: OrchestrationV2Subagent | undefined;
  readonly onOpen: () => void;
}) {
  const { presentationById } = useEnvironments();
  const openLinkedThread = useOpenLinkedThread();
  const agent = {
    title: props.live?.title ?? props.item.title,
    prompt: props.item.prompt,
    status: props.live?.status ?? props.item.status,
    startedAt: props.live?.startedAt ?? props.item.startedAt,
    completedAt: props.live?.completedAt ?? props.item.completedAt,
    childThreadId: props.item.childThreadId,
    remoteChild: props.item.remoteChild,
  };
  const target = subagentThreadTarget(agent, props.environmentId, (id) => presentationById.has(id));
  const presentation = resolveSubagentRowPresentation(agent, target !== null);
  return (
    <WorkLogPressable
      accessibilityRole={target === null ? "text" : "link"}
      accessibilityLabel={`${presentation.title}, ${presentation.statusLabel}`}
      accessibilityHint={target === null ? undefined : "Opens this agent's thread"}
      disabled={target === null}
      onPress={() => {
        if (target === null) return;
        props.onOpen();
        openLinkedThread({
          environmentId: String(target.environmentId),
          threadId: String(target.threadId),
        });
      }}
    >
      <WorkLogIconSlot>
        <View className={cn("h-2 w-2 rounded-full", DOT_CLASS[presentation.tone])} />
      </WorkLogIconSlot>
      <Text
        selectable={false}
        numberOfLines={1}
        className={cn(
          "min-w-0 flex-1 text-sm",
          presentation.live ? "text-foreground-secondary" : "text-foreground-muted",
        )}
      >
        {presentation.title}
      </Text>
      <Elapsed agent={agent} live={presentation.live} />
      {target !== null ? (
        <SymbolView name="chevron.right" size={12} tintColorClassName="accent-icon-subtle" />
      ) : null}
    </WorkLogPressable>
  );
}
