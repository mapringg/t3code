import type { MenuAction } from "@react-native-menu/menu";
import { Pressable } from "react-native";

import { AndroidAnchoredMenu } from "../../components/ui/AndroidAnchoredMenu";
import { useAndroidControlSizing } from "../../components/ui/useAndroidControlSizing";
import { SymbolView } from "../../components/ui/AppSymbol";
import type { ComposerAttachmentButtonProps } from "./ComposerAttachmentButton";

const ATTACHMENT_MENU_ACTIONS: MenuAction[] = [
  { id: "photos", title: "Photo Library", image: "photo" },
  { id: "files", title: "Choose files", image: "folder" },
];

export function ComposerAttachmentButton(props: ComposerAttachmentButtonProps) {
  const { scale } = useAndroidControlSizing();
  const renderButton = (onPress: () => void) => (
    <Pressable
      accessibilityLabel="Add attachment"
      accessibilityRole="button"
      accessibilityState={{ disabled: props.disabled }}
      className="size-[44px] shrink-0 items-center justify-center rounded-full active:opacity-70 disabled:opacity-50"
      disabled={props.disabled}
      onPress={onPress}
    >
      <SymbolView
        name="plus"
        size={Math.round((props.size === "large" ? 26 : 20) * scale)}
        weight="regular"
        tintColorClassName="accent-icon"
        type="monochrome"
      />
    </Pressable>
  );

  if (props.disabled || !props.supportsFiles) {
    return renderButton(() => void props.onPickMedia());
  }

  return (
    <AndroidAnchoredMenu
      // Keep the picker handoff in the activity window rather than a focusable popup window.
      inWindow
      actions={ATTACHMENT_MENU_ACTIONS}
      onPressAction={({ nativeEvent }) => {
        if (nativeEvent.event === "photos") {
          void props.onPickMedia();
        } else if (nativeEvent.event === "files") {
          void props.onPickFiles();
        }
      }}
    >
      {renderButton}
    </AndroidAnchoredMenu>
  );
}
