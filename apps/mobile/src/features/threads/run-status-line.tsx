import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Pressable } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import { formatElapsed } from "./run-elapsed";
import { useVisibleSecondClock } from "./use-visible-second-clock";

const firstShownByRun = new Map<string, number>();

// The only part that ticks, so the feed and its rows stay put each second.
function RunStatusText(props: {
  readonly label: string;
  readonly runId: string | null;
  readonly startedAt: string;
  readonly endedAt: string | undefined;
  readonly untimed: boolean;
}) {
  const nowMs = useVisibleSecondClock(props.endedAt === undefined && !props.untimed);
  // Counting starts when the line first shows a send; the server picking it up keeps that origin,
  // and only a different run starts again.
  const [origin, setOrigin] = useState(() => ({ runId: props.runId, sinceMs: nowMs }));
  if (origin.runId !== props.runId) {
    setOrigin({ runId: props.runId, sinceMs: origin.runId === null ? origin.sinceMs : nowMs });
  }
  // A recycled or remounted line keeps the origin the run first showed with.
  const shownSinceMs =
    (props.runId === null ? undefined : firstShownByRun.get(props.runId)) ??
    (origin.runId === props.runId ? origin.sinceMs : nowMs);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- records the run's first-shown time outside the row, which list recycling remounts
  useEffect(() => {
    if (props.runId === null || firstShownByRun.has(props.runId)) return;
    if (firstShownByRun.size >= 16) firstShownByRun.delete(firstShownByRun.keys().next().value!);
    firstShownByRun.set(props.runId, shownSinceMs);
  }, [props.runId, shownSinceMs]);
  const elapsed = props.untimed
    ? null
    : props.endedAt === undefined
      ? formatElapsed(props.startedAt, nowMs, shownSinceMs)
      : formatElapsed(props.startedAt, Date.parse(props.endedAt));
  return (
    <Text
      numberOfLines={1}
      className="shrink font-t3-medium text-xs tabular-nums text-foreground-secondary"
    >
      {elapsed === null ? props.label : `${props.label} · ${elapsed}`}
    </Text>
  );
}

/** Shares its slot and text style with the newest reply's footer, which replaces it in place. */
export function RunStatusLine(props: {
  readonly label: string;
  readonly runId: string | null;
  readonly untimed: boolean;
  readonly startedAt: string;
  readonly endedAt: string | undefined;
  readonly height: number;
  readonly onOpen: (() => void) | null;
}) {
  const onOpen = props.onOpen;
  return (
    <Pressable
      accessibilityRole={onOpen ? "button" : "text"}
      accessibilityLabel={props.label}
      accessibilityHint={onOpen ? "Opens this run's work" : undefined}
      disabled={onOpen === null}
      onPress={
        onOpen
          ? () => {
              void Haptics.selectionAsync();
              onOpen();
            }
          : undefined
      }
      hitSlop={8}
      className="mb-1 max-w-full flex-row items-center self-start px-1 active:opacity-70"
      style={{ minHeight: props.height }}
    >
      <RunStatusText
        label={props.label}
        runId={props.runId}
        startedAt={props.startedAt}
        endedAt={props.endedAt}
        untimed={props.untimed}
      />
    </Pressable>
  );
}
