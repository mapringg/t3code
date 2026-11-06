import { AppText as Text } from "../../components/ui/AppText";

/** Android's live work line: what the agent is doing, in one quiet line, as Gemini shows it. */
export function RunStatusLine(props: { readonly label: string; readonly height: number }) {
  return (
    <Text
      numberOfLines={1}
      accessibilityLiveRegion="polite"
      className="mb-1 px-1 font-t3-medium text-xs text-foreground-secondary"
      style={{ minHeight: props.height, textAlignVertical: "center" }}
    >
      {props.label}
    </Text>
  );
}
