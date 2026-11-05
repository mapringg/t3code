import type { MenuAction, MenuComponentProps } from "@react-native-menu/menu";
import type { ReactNode } from "react";
import { use, useRef, useState } from "react";
import type { StyleProp, ViewInstance, ViewStyle } from "react-native";
import { Pressable, ScrollView, View } from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";
import Animated, { FadeIn } from "react-native-reanimated";

import { useHardwareBack } from "../../lib/backHandler";
import { resolveScaledTextRole } from "../../lib/appearancePreferences";
import { deriveMenuHorizontalPlacement } from "../../lib/menu-placement";
import { useAppearancePreferences } from "../../features/settings/appearance/AppearancePreferencesProvider";
import { WindowHingeContext } from "../../native/window-hinge-context";
import { OverlayPortal } from "./OverlayPortal";
import { useAndroidControlSizing } from "./useAndroidControlSizing";
import { MenuPopup } from "./MenuPopup";

const SCREEN_MARGIN = 12;
const ANCHOR_GAP = 6;
const MAX_VISIBLE_ITEMS = 6;

// Freeze both snapshots at opening so keyboard and screen reflows cannot flip menu direction.
type AnchorSnapshot = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly keyboardWasVisible: boolean;
};

type OverlayFrame = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type AndroidAnchoredMenuProps = {
  readonly actions: readonly MenuAction[];
  readonly title?: string;
  readonly onPressAction?: MenuComponentProps["onPressAction"];
  readonly className?: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly inWindow?: boolean;
  readonly children: ReactNode | ((open: () => void) => ReactNode);
};

export function AndroidAnchoredMenu(props: AndroidAnchoredMenuProps) {
  const { scale, menuWidth: desiredMenuWidth, menuItemHeight } = useAndroidControlSizing();
  const [anchor, setAnchor] = useState<AnchorSnapshot | null>(null);
  const [path, setPath] = useState<readonly MenuAction[]>([]);
  const [rootHeight, setRootHeight] = useState<number | null>(null);
  const [overlay, setOverlay] = useState<OverlayFrame | null>(null);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const { appearance } = useAppearancePreferences();
  const windowHinge = use(WindowHingeContext);
  // State, not a ref: `open` reaches render-prop children, and the compiler
  // bails out of the whole component when a ref might be read during render.
  const [anchorNode, setAnchorNode] = useState<ViewInstance | null>(null);
  const overlayRef = useRef<ViewInstance>(null);

  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const keyboardHeight = useKeyboardState((state) => state.height);
  const close = () => {
    setAnchor(null);
    setPath([]);
    setOverlay(null);
    setRootHeight(null);
    setContentHeight(null);
  };

  const open = () => {
    anchorNode?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height, keyboardWasVisible: keyboardVisible });
    });
  };

  const measureOverlay = () => {
    overlayRef.current?.measureInWindow((x, y, width, height) => {
      setOverlay({ x, y, width, height });
      setRootHeight(height);
    });
  };

  const parent = path[path.length - 1] ?? null;
  const levelActions = (parent?.subactions ?? props.actions).filter(
    (action) => !(action.attributes?.hidden ?? false),
  );
  // Expo's native popup cannot cap its height, so long menus use the scrollable in-window view.
  const inWindow =
    anchor?.keyboardWasVisible ||
    props.inWindow === true ||
    levelActions.length + Number(parent !== null) > MAX_VISIBLE_ITEMS;

  useHardwareBack(anchor !== null && inWindow, () => {
    if (path.length > 0) {
      setPath((current) => current.slice(0, -1));
    } else {
      close();
    }
    return true;
  });

  const local =
    anchor === null || overlay === null
      ? null
      : {
          x: anchor.x - overlay.x,
          y: anchor.y - overlay.y,
          width: anchor.width,
          height: anchor.height,
        };
  const { left, width: menuWidth } =
    local === null || overlay === null
      ? { left: 0, width: desiredMenuWidth }
      : deriveMenuHorizontalPlacement({
          anchorX: local.x,
          anchorWidth: local.width,
          overlayWidth: overlay.width,
          desiredWidth: desiredMenuWidth,
          margin: SCREEN_MARGIN,
          hinge: windowHinge && { x: windowHinge.x - overlay.x, width: windowHinge.width },
        });
  // This in-window menu preserves keyboard focus; subtract the IME area so its items remain tappable.
  const usableBottom =
    overlay === null ? 0 : overlay.height - (keyboardVisible ? keyboardHeight : 0);
  const spaceBelow =
    local === null || overlay === null
      ? 0
      : usableBottom - (local.y + local.height) - ANCHOR_GAP - SCREEN_MARGIN;
  const spaceAbove = local === null ? 0 : local.y - ANCHOR_GAP - SCREEN_MARGIN;
  const opensDown = spaceBelow >= 280 || spaceBelow >= spaceAbove;
  const maxHeight = Math.max(
    0,
    Math.min(opensDown ? spaceBelow : spaceAbove, menuItemHeight * MAX_VISIBLE_ITEMS + 14 * scale),
  );
  const menuPadding = 7 * scale;
  const headerHeight =
    parent !== null
      ? menuItemHeight
      : props.title
        ? 16 * scale + resolveScaledTextRole("caption", appearance.baseFontSize).lineHeight
        : 0;
  // The Compose host's matchContents size does not stick here; Yoga falls back to the RN icon
  // views inside it. Size the host and panel from Compose's reported content height instead.
  const listHeight = contentHeight ?? headerHeight + levelActions.length * menuItemHeight;
  const menuHeight = Math.min(listHeight + menuPadding * 2, maxHeight);
  const placeable = local !== null && rootHeight !== null;

  const onPressItem = (action: MenuAction) => {
    if ((action.subactions?.length ?? 0) > 0) {
      setPath((current) => [...current, action]);
      return;
    }
    close();
    if (action.id !== undefined) {
      props.onPressAction?.({
        nativeEvent: { event: action.id },
      } as Parameters<NonNullable<MenuComponentProps["onPressAction"]>>[0]);
    }
  };

  return (
    <>
      {typeof props.children === "function" ? (
        <View
          ref={setAnchorNode}
          collapsable={false}
          className={props.className}
          style={props.style}
        >
          {props.children(open)}
        </View>
      ) : (
        <Pressable
          ref={setAnchorNode}
          accessibilityRole="button"
          className={props.className}
          collapsable={false}
          style={props.style}
          onPress={open}
        >
          <View pointerEvents="none">{props.children}</View>
        </Pressable>
      )}
      {anchor === null ? null : (
        <OverlayPortal>
          <View
            ref={overlayRef}
            collapsable={false}
            className="absolute inset-0"
            onLayout={measureOverlay}
          >
            <Pressable accessible={false} className="absolute inset-0" onPress={close} />
            {!placeable || local === null ? null : !inWindow ? (
              <MenuPopup
                anchor={{
                  x: left,
                  y: local.y - ANCHOR_GAP,
                  width: menuWidth,
                  height: local.height + ANCHOR_GAP * 2,
                }}
                menuWidth={menuWidth}
                actions={levelActions}
                title={props.title}
                parent={parent}
                onPress={onPressItem}
                onBack={() => setPath((current) => current.slice(0, -1))}
                onClose={close}
              />
            ) : (
              <Animated.View
                entering={FadeIn.duration(120)}
                className="absolute overflow-hidden bg-card-alt shadow-md"
                style={{
                  left,
                  height: menuHeight,
                  width: menuWidth,
                  borderRadius: 4 * scale,
                  ...(opensDown
                    ? { top: local.y + local.height + ANCHOR_GAP }
                    : { bottom: (rootHeight ?? 0) - local.y + ANCHOR_GAP }),
                }}
              >
                {/* Compose DropdownMenu takes focus; in-window editor menus preserve the keyboard. */}

                {/* The first item tap must act while the keyboard is open. */}
                <ScrollView
                  contentContainerStyle={{ paddingVertical: menuPadding }}
                  bounces={false}
                  keyboardShouldPersistTaps="always"
                  showsVerticalScrollIndicator={false}
                >
                  <MenuPopup
                    inline
                    inlineHeight={listHeight}
                    onInlineContentHeight={(height) => {
                      if (height > 0) setContentHeight(height);
                    }}
                    anchor={local}
                    menuWidth={menuWidth}
                    actions={levelActions}
                    title={props.title}
                    parent={parent}
                    onPress={onPressItem}
                    onBack={() => setPath((current) => current.slice(0, -1))}
                    onClose={close}
                  />
                </ScrollView>
              </Animated.View>
            )}
          </View>
        </OverlayPortal>
      )}
    </>
  );
}
