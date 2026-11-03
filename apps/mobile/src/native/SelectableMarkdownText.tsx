import { createContext, use } from "react";
import { Platform } from "react-native";
import type {
  MarkdownSelectionMenuItem,
  SelectableMarkdownTextProps,
} from "./SelectableMarkdownText.types";

import { MobileEnrichedMarkdownText } from "./EnrichedMarkdownText";
import { themeColorWithAlpha } from "../lib/mobileTheme";
import { useUniwindTheme } from "../lib/useUniwindTheme";

export type {
  MarkdownFileContextMenu,
  MarkdownFileContextMenuAction,
  MarkdownImageRenderer,
  MarkdownImageRequest,
  MarkdownImageSourceResolver,
  MarkdownLinkCustomization,
  MarkdownSelectionMenuItem,
  NativeMarkdownTextStyle,
  SelectableMarkdownSkill,
} from "./SelectableMarkdownText.types";

/** Selection toolbar items for every markdown block of one message. Keep the value stable. */
export const MarkdownSelectionMenuContext = createContext<
  ReadonlyArray<MarkdownSelectionMenuItem> | undefined
>(undefined);

export function SelectableMarkdownText(props: SelectableMarkdownTextProps) {
  const selectionMenuItems = use(MarkdownSelectionMenuContext);
  const theme = useUniwindTheme();
  const selectionColor = themeColorWithAlpha(theme["--color-focus"], 0.32);
  const selectionHandleColor = theme["--color-focus"];
  const textStyle =
    Platform.OS === "android"
      ? { selectionColor, selectionHandleColor, ...props.textStyle }
      : props.textStyle;
  return (
    <MobileEnrichedMarkdownText
      selectionMenuItems={selectionMenuItems}
      {...props}
      textStyle={textStyle}
    />
  );
}
