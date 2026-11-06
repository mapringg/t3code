import { AppText as Text } from "../../components/ui/AppText";
import { cn } from "../../lib/cn";
import type { ComponentProps, ReactNode } from "react";
import { Platform, Pressable, View } from "react-native";
import { THREAD_WORK_ROW_MIN_HEIGHT, type deriveThreadWorkLogSizing } from "../../lib/layout";

export function WorkLogBlock({
  children,
  layout = "standalone",
  continues = false,
}: {
  children: ReactNode;
  layout?: "standalone" | "group-header" | "collapsed-group-header";
  continues?: boolean | undefined;
}) {
  return (
    <View
      className={cn(
        "-mx-1 px-1",
        (layout === "collapsed-group-header" || (layout === "standalone" && !continues)) && "mb-3",
      )}
    >
      {children}
    </View>
  );
}

export function WorkLogRows({ children }: { children: ReactNode }) {
  return <View className="gap-px">{children}</View>;
}

export function WorkLogIconSlot({ children }: { children: ReactNode }) {
  return <View className="relative h-6 w-6 shrink-0 items-center justify-center">{children}</View>;
}

export function WorkLogPressable({
  children,
  rowSizing,
  ...props
}: Omit<ComponentProps<typeof Pressable>, "children" | "className" | "style" | "hitSlop"> & {
  children: ReactNode;
  rowSizing?: ReturnType<typeof deriveThreadWorkLogSizing>;
}) {
  return (
    <Pressable
      {...props}
      hitSlop={4}
      android_ripple={{ borderless: false, foreground: true }}
      className="rounded-md px-0.5 py-0 active:bg-subtle"
    >
      <View
        className="flex-row items-center gap-1.5"
        style={{ minHeight: rowSizing?.estimatedRowHeight ?? THREAD_WORK_ROW_MIN_HEIGHT }}
      >
        {children}
      </View>
    </Pressable>
  );
}

export function WorkLogLabel({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "danger" | "warning";
}) {
  return (
    <Text
      selectable={false}
      numberOfLines={1}
      ellipsizeMode="tail"
      className={cn(
        "min-w-0 flex-1 text-sm",
        // Android rows live in the run sheet, where they are the content, not metadata.
        Platform.OS === "android" ? "text-foreground" : "text-foreground-muted",
        tone === "danger" && "font-t3-medium text-adaptive-rose-600-400",
        tone === "warning" && "font-t3-medium text-warning-foreground",
      )}
    >
      {children}
    </Text>
  );
}
