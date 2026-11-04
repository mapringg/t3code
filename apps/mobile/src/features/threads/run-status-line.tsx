import * as Haptics from "expo-haptics";
import { Pressable } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import { useVisibleSecondClock } from "./use-visible-second-clock";

function formatElapsed(startedAt: string, nowMs: number): string | null {
  const startedAtMs = Date.parse(startedAt);
  if (!Number.isFinite(startedAtMs)) return null;
  const seconds = Math.max(0, Math.floor((nowMs - startedAtMs) / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

// The only part that ticks, so the feed and its rows stay put each second.
function RunStatusText(props: {
  readonly label: string;
  readonly startedAt: string;
  readonly endedAt: string | undefined;
}) {
  const nowMs = useVisibleSecondClock(props.endedAt === undefined);
  const elapsed = formatElapsed(
    props.startedAt,
    props.endedAt === undefined ? nowMs : Date.parse(props.endedAt),
  );
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
