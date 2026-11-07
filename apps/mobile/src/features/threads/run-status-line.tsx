import { AppText as Text } from "../../components/ui/AppText";
import { cn } from "../../lib/cn";

/** Android's live work line: what the agent is doing, in one quiet line, as Gemini shows it. */
export function RunStatusLine(props: {
  readonly label: string;
  readonly height: number;
  readonly endsTurn?: boolean;
}) {
  return (
    <Text
      numberOfLines={1}
      accessibilityLiveRegion="polite"
      className={cn(
        "px-1 font-t3-medium text-xs text-foreground-secondary",
        props.endsTurn ? "mb-5" : "mb-1",
      )}
      // Exactly the slot finished replies keep, so the line handing over moves nothing.
      style={{ height: props.height, textAlignVertical: "center" }}
    >
      {props.label}
    </Text>
  );
}
