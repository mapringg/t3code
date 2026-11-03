import { Pressable, View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";

import { AppText as Text } from "../../components/ui/AppText";
import { ControlPill } from "../../components/ui/ControlPill";
import type { FloatingWorkingControl as IosFloatingWorkingControl } from "./floating-working-control";

export const FLOATING_WORKING_CONTROL_COVERAGE = 48.5;

export function FloatingWorkingControl(props: Parameters<typeof IosFloatingWorkingControl>[0]) {
  const lift = props.lift;
  const liftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -(lift?.value ?? 0) }],
  }));
  const status = props.status;
  // The stop button in the composer already shows a running turn.
  const label =
    status === null || status.kind === "working"
      ? null
      : status.kind === "compacting"
        ? "Compacting…"
        : status.label;
  const onPressStatus =
    status?.kind === "connection" || status?.kind === "child-input" || status?.kind === "background"
      ? status.onPress
      : undefined;
  const action =
    status?.kind === "background" || status?.kind === "lifecycle" || status?.kind === "stop"
      ? status.action
      : null;

  if (label === null && props.queuedCount === 0 && !props.showScrollToEnd) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      className="absolute left-0 right-0 z-20 items-center"
      style={[{ top: -40.5 }, liftStyle]}
    >
      <View pointerEvents="box-none" className="max-w-full flex-row items-center gap-2">
        {label !== null || props.queuedCount > 0 ? (
          <View className="min-h-11 min-w-0 shrink flex-row items-center bg-screen">
            {label !== null ? (
              onPressStatus ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    status?.kind === "child-input" || status?.kind === "background"
                      ? status.accessibilityLabel
                      : label
                  }
                  onPress={onPressStatus}
                  className="min-h-11 min-w-0 shrink justify-center px-3 active:opacity-70"
                >
                  <Text className="text-[13px] text-foreground-muted" numberOfLines={1}>
                    {label}
                  </Text>
                </Pressable>
              ) : (
                <Text
                  className="min-w-0 shrink px-3 text-[13px] text-foreground-muted"
                  numberOfLines={1}
                >
                  {label}
                </Text>
              )
            ) : null}
            {action !== null ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={action.accessibilityLabel}
                accessibilityState={{ disabled: action.disabled }}
                disabled={action.disabled}
                onPress={action.onPress}
                className="min-h-11 justify-center px-3 active:opacity-70"
              >
                <Text className="text-[13px] text-foreground">{action.label}</Text>
              </Pressable>
            ) : null}
            {props.queuedCount > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open queue, ${props.queuedCount} messages`}
                onPress={props.onOpenQueue}
                className="min-h-11 justify-center px-3 active:opacity-70"
              >
                <Text className="text-[13px] text-foreground-muted">
                  {props.queuedCount} queued
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {props.showScrollToEnd ? (
          <ControlPill
            accessibilityLabel="Scroll to end"
            activateOnPressIn
            variant="floating"
            icon={{ ios: "chevron.down", android: "keyboard_arrow_down" }}
            onPress={props.onScrollToEnd}
          />
        ) : null}
      </View>
    </Animated.View>
  );
}
