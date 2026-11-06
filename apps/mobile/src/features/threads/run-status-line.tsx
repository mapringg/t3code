import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Pressable } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import { formatElapsed } from "./run-elapsed";
import { useVisibleSecondClock } from "./use-visible-second-clock";

const firstShownByRunStart = new Map<string, number>();

// The only part that ticks, so the feed and its rows stay put each second.
function RunStatusText(props: {
  readonly label: string;
  readonly startedAt: string;
  readonly endedAt: string | undefined;
}) {
  const nowMs = useVisibleSecondClock(props.endedAt === undefined);
  // Keyed by run start: a line that stays mounted into the next run starts counting again.
  const [shown, setShown] = useState(() => ({ startedAt: props.startedAt, sinceMs: nowMs }));
  if (shown.startedAt !== props.startedAt) {
    setShown({ startedAt: props.startedAt, sinceMs: nowMs });
  }
  // A recycled or remounted line keeps the origin the run first showed with.
  const shownSinceMs =
    firstShownByRunStart.get(props.startedAt) ??
    (shown.startedAt === props.startedAt ? shown.sinceMs : nowMs);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- records the run's first-shown time outside the row, which list recycling remounts
  useEffect(() => {
    if (firstShownByRunStart.has(props.startedAt)) return;
    if (firstShownByRunStart.size >= 16) {
      firstShownByRunStart.delete(firstShownByRunStart.keys().next().value!);
    }
    firstShownByRunStart.set(props.startedAt, shownSinceMs);
  }, [props.startedAt, shownSinceMs]);
  const elapsed =
    props.endedAt === undefined
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
      <RunStatusText label={props.label} startedAt={props.startedAt} endedAt={props.endedAt} />
    </Pressable>
  );
}
