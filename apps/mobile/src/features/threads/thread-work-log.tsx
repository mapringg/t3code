import { Button } from "../../components/ui/Button";
import { ProposedPlanCard } from "./ProposedPlanCard";
import {
  WorkLogLabel,
  WorkLogBlock,
  WorkLogRows,
  WorkLogIconSlot,
  WorkLogPressable,
} from "./work-log-layout";
import { QuestionAnswerHistory } from "./QuestionAnswerHistory";
import { ThreadCommandOutput, useCommandOutputStreaming } from "./thread-command-output";
import {
  getQuestionAnswerPreview,
  hasQuestionAnswer,
} from "@t3tools/client-runtime/work-log/user-input";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { type AppSymbolName, SymbolView } from "../../components/ui/AppSymbol";
import { MaskedView } from "@expo/ui/community/masked-view";
import { useIsFocused } from "@react-navigation/native";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  Animated as NativeAnimated,
  type ColorValue,
  Easing,
  Platform,
  ScrollView,
  StyleSheet,
  useAnimatedValue,
  View,
} from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import {
  ORCHESTRATION_V2_WORKSPACE_PREPARATION_FAILURE_CODE,
  type EnvironmentId,
  type RunId,
  type ThreadId,
  type ToolActivityIcon,
} from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { environmentThreadDetails, threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { toolActivityFaviconUrl } from "@t3tools/shared/favicon";
import { isJavaScriptReplTool } from "@t3tools/shared/toolActivity";
import { useMarkdownCodeHighlight } from "./markdownCodeHighlightState";

import { AppText as Text } from "../../components/ui/AppText";
import { T3Wordmark } from "../../components/T3Wordmark";
import { BrowserAppIcon } from "./BrowserAppIcon";
import { useAppActive, useReduceMotionEnabled } from "../../lib/appState";
import { cn } from "../../lib/cn";
import type { deriveThreadWorkLogSizing } from "../../lib/layout";
import {
  formatItemFullDetail,
  type ThreadFeedActivity,
  workEntryRowLabel,
  workEntryRowLabelIsCommand,
} from "../../lib/threadActivity";
import {
  toolCallLines,
  turnItemOutputImages,
  turnItemOutputText,
} from "@t3tools/client-runtime/work-log/item-detail";
import { useTurnItemDetail } from "../../state/queries";
import {
  resolveWorkEntryToolPresentation,
  toolGroupAction,
  type ToolGroupSummaryKind,
  workEntryViewedImagePath,
} from "@t3tools/client-runtime/work-log/presentation";
import { notificationChildThreadId } from "@t3tools/client-runtime/state/thread-execution";
import type { MarkdownImageRenderer } from "../../native/SelectableMarkdownText";
import type { FilePreviewSource } from "../../components/FilePreviewModal";
import { FilePreviewGallery } from "../../components/FilePreviewGallery";
import { ThreadMarkdownImage } from "./ThreadMarkdownImage";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useAssetUrl } from "../../state/assets";
import { PullRequestGlyph } from "../pull-requests/pullRequestGlyphs";
import { useOpenLinkedThread } from "./useOpenLinkedThread";

const SHIMMER_WIDTH = 72;
const SHIMMER_SWEEP_MS = 1_350;
const SHIMMER_PAUSE_MS = 1_450;
const SHIMMER_ICON_AND_GAP_WIDTH = 30;
const THREAD_DISCLOSURE_TRANSITION_MS = 180;
type WorkContentIcon =
  | AppSymbolName
  | "browser"
  | "computer"
  | "device"
  | "t3-code"
  | "pull-request";

function WorkLogIcon(props: {
  readonly icon: WorkContentIcon;
  readonly color: ColorValue;
  readonly colorClassName?: string;
  readonly highlighted?: boolean;
}) {
  const colorClassName = props.highlighted ? "accent-foreground" : props.colorClassName;
  if (props.icon === "t3-code") {
    return (
      <T3Wordmark height={10} {...(colorClassName ? { colorClassName } : { color: props.color })} />
    );
  }
  if (props.icon === "computer") {
    return (
      <BrowserAppIcon
        size={14}
        {...(colorClassName ? { colorClassName } : { color: props.color })}
      />
    );
  }
  return (
    <SymbolView
      name={
        props.icon === "pull-request"
          ? PullRequestGlyph.pullRequest
          : props.icon === "browser"
            ? { ios: "globe", android: "public" }
            : props.icon === "device"
              ? { ios: "iphone", android: "smartphone" }
              : props.icon
      }
      size={14}
      weight="medium"
      {...(colorClassName ? { tintColorClassName: colorClassName } : { tintColor: props.color })}
      type="monochrome"
    />
  );
}

export function ThreadDisclosureChevron(props: {
  readonly expanded: boolean;
  readonly collapsedDirection: "right" | "down";
  readonly size: number;
  readonly tintColor: ColorValue;
}) {
  const expandedAngle = props.collapsedDirection === "right" ? 90 : 180;
  const rotation = useSharedValue(props.expanded ? expandedAngle : 0);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- drives the chevron's Reanimated rotation value when the expanded state changes
  useLayoutEffect(() => {
    rotation.set(
      withTiming(props.expanded ? expandedAngle : 0, {
        duration: THREAD_DISCLOSURE_TRANSITION_MS,
        reduceMotion: ReduceMotion.System,
      }),
    );
  }, [expandedAngle, props.expanded, rotation]);

  const rotationStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[{ width: props.size, height: props.size }, rotationStyle]}
    >
      <SymbolView
        name={props.collapsedDirection === "right" ? "chevron.right" : "chevron.down"}
        size={props.size}
        tintColor={props.tintColor}
        type="monochrome"
      />
    </Animated.View>
  );
}

function ShimmerWorkContent(props: {
  readonly textClassName?: string;
  readonly compact?: boolean;
  readonly environmentId?: EnvironmentId;
  readonly highlighted: boolean;
  readonly icon: WorkContentIcon;
  readonly iconSubtleColor: ColorValue;
  readonly label: string;
  readonly onTextLayout?: ComponentProps<typeof Text>["onTextLayout"];
  readonly showIcon: boolean;
  readonly themeAppearance?: "light" | "dark";
  readonly toolIcon?: ToolActivityIcon;
}) {
  return (
    <View className="flex-row items-center gap-1.5">
      {props.showIcon ? (
        <View className="h-6 w-6 shrink-0 items-center justify-center">
          {props.toolIcon && props.environmentId ? (
            <ToolActivityIconView
              environmentId={props.environmentId}
              icon={props.toolIcon}
              fallback={props.icon}
              fallbackColor={props.iconSubtleColor}
              themeAppearance={props.themeAppearance ?? "light"}
            />
          ) : (
            <WorkLogIcon
              icon={props.icon}
              color={props.iconSubtleColor}
              highlighted={props.highlighted}
            />
          )}
        </View>
      ) : null}
      <Text
        className={cn(
          "min-w-0 shrink",
          props.compact ? "text-xs" : "text-sm",
          props.highlighted ? "text-foreground" : "text-foreground-muted",
          props.textClassName,
        )}
        numberOfLines={1}
        onTextLayout={props.onTextLayout}
      >
        {props.label}
      </Text>
    </View>
  );
}

export function ShimmeringWorkContent(props: Parameters<typeof AnimatedShimmeringWorkContent>[0]) {
  return Platform.OS === "android" ? (
    <View className={cn("min-w-0 flex-1 overflow-hidden", props.className)}>
      <ShimmerWorkContent {...props} highlighted={false} />
    </View>
  ) : (
    <AnimatedShimmeringWorkContent {...props} />
  );
}

function AnimatedShimmeringWorkContent(props: {
  readonly className?: string;
  readonly textClassName?: string;
  readonly compact?: boolean;
  readonly environmentId?: EnvironmentId;
  readonly icon: WorkContentIcon;
  readonly iconSubtleColor: ColorValue;
  readonly label: string;
  readonly showIcon: boolean;
  readonly themeAppearance?: "light" | "dark";
  readonly toolIcon?: ToolActivityIcon;
}) {
  const [availableWidth, setAvailableWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const appIsActive = useAppActive();
  const reducedMotion = useReduceMotionEnabled();
  const screenIsFocused = useIsFocused();
  const progress = useAnimatedValue(0);
  const gradientId = `work-shimmer-${useId().replaceAll(":", "")}`;
  const contentWidth = Math.min(
    availableWidth,
    (props.showIcon ? SHIMMER_ICON_AND_GAP_WIDTH : 0) + Math.ceil(textWidth),
  );

  // Runs on React Native's native driver instead of Reanimated, whose
  // per-frame commits starve React's while commit pausing is disabled
  // (package.json). See docs/internals/performance-regressions.md.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- starts the native-driver shimmer loop while visible and active, and stops it on cleanup
  useEffect(() => {
    progress.setValue(0);
    if (contentWidth <= 0 || reducedMotion || !appIsActive || !screenIsFocused) return;

    const loop = NativeAnimated.loop(
      NativeAnimated.timing(progress, {
        toValue: 1,
        duration: SHIMMER_SWEEP_MS + SHIMMER_PAUSE_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [appIsActive, contentWidth, progress, reducedMotion, screenIsFocused]);

  // One timing covers the sweep and the pause, so the native driver can loop it.
  // The React Compiler memoizes these, so re-renders don't rebuild the native
  // animation nodes.
  const inputRange = [0, SHIMMER_SWEEP_MS / (SHIMMER_SWEEP_MS + SHIMMER_PAUSE_MS), 1];
  const sweepTranslateX = progress.interpolate({
    inputRange,
    outputRange: [-SHIMMER_WIDTH, contentWidth, contentWidth],
  });
  const counterSweepTranslateX = progress.interpolate({
    inputRange,
    outputRange: [SHIMMER_WIDTH, -contentWidth, -contentWidth],
  });

  return (
    <View
      className={cn("min-w-0 flex-1 overflow-hidden", props.className)}
      onLayout={(event) => setAvailableWidth(event.nativeEvent.layout.width)}
    >
      <ShimmerWorkContent
        textClassName={props.textClassName}
        compact={props.compact}
        environmentId={props.environmentId}
        highlighted={false}
        icon={props.icon}
        iconSubtleColor={props.iconSubtleColor}
        label={props.label}
        showIcon={props.showIcon}
        themeAppearance={props.themeAppearance}
        toolIcon={props.toolIcon}
        onTextLayout={(event) => setTextWidth(event.nativeEvent.lines[0]?.width ?? 0)}
      />
      {!reducedMotion && appIsActive && screenIsFocused && contentWidth > 0 ? (
        <NativeAnimated.View
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            overflow: "hidden",
            width: SHIMMER_WIDTH,
            transform: [{ translateX: sweepTranslateX }],
          }}
        >
          <MaskedView
            style={StyleSheet.absoluteFill}
            maskElement={
              <Svg width="100%" height="100%">
                <Defs>
                  <LinearGradient id={gradientId} x1="0%" x2="100%" y1="0%" y2="0%">
                    <Stop offset="0" stopColor="white" stopOpacity={0} />
                    <Stop offset="0.15" stopColor="white" stopOpacity={0.12} />
                    <Stop offset="0.35" stopColor="white" stopOpacity={0.55} />
                    <Stop offset="0.5" stopColor="white" stopOpacity={1} />
                    <Stop offset="0.65" stopColor="white" stopOpacity={0.55} />
                    <Stop offset="0.85" stopColor="white" stopOpacity={0.12} />
                    <Stop offset="1" stopColor="white" stopOpacity={0} />
                  </LinearGradient>
                </Defs>
                <Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
              </Svg>
            }
          >
            <NativeAnimated.View
              style={{ width: availableWidth, transform: [{ translateX: counterSweepTranslateX }] }}
            >
              <ShimmerWorkContent
                textClassName={props.textClassName}
                compact={props.compact}
                environmentId={props.environmentId}
                highlighted
                icon={props.icon}
                iconSubtleColor={props.iconSubtleColor}
                label={props.label}
                showIcon={props.showIcon}
                themeAppearance={props.themeAppearance}
                toolIcon={props.toolIcon}
              />
            </NativeAnimated.View>
          </MaskedView>
        </NativeAnimated.View>
      ) : null}
    </View>
  );
}

function workRowSymbolName(icon: ThreadFeedActivity["icon"]): WorkContentIcon {
  switch (icon) {
    case "agent":
      return { ios: "sparkles", android: "auto_awesome" };
    case "alert":
      return { ios: "exclamationmark.triangle", android: "error" };
    case "browser":
      return { ios: "safari", android: "public" };
    case "check":
      return { ios: "checkmark", android: "check" };
    case "command":
      return { ios: "terminal", android: "terminal" };
    case "computer":
      return "computer";
    case "code":
      return "chevron.left.forwardslash.chevron.right";
    case "edit":
      return { ios: "square.and.pencil", android: "edit" };
    case "eye":
      return { ios: "eye", android: "visibility" };
    case "globe":
      return { ios: "globe", android: "public" };
    case "search":
      return "magnifyingglass";
    case "stop":
      return "stop.fill";
    case "hammer":
      return { ios: "hammer", android: "construction" };
    case "lock":
      return { ios: "lock", android: "lock" };
    case "message":
      return { ios: "bubble.left", android: "chat_bubble" };
    case "warning":
      return { ios: "xmark", android: "close" };
    case "wrench":
      return { ios: "wrench", android: "build" };
    case "zap":
      return { ios: "bolt", android: "bolt" };
  }
}

interface ThreadWorkLogProps {
  readonly continuesWorkLog?: boolean | undefined;
  readonly activities: ReadonlyArray<ThreadFeedActivity>;
  readonly environmentId: EnvironmentId;
  readonly workspaceRoot?: string | null | undefined;
  readonly copiedRowId: string | null;
  /** Rows expand in place, as in the run sheet; without it a press opens the row's run. */
  readonly expandedRows?: Readonly<Record<string, boolean>>;
  readonly iconSubtleColor: ColorValue;
  readonly themeAppearance: "light" | "dark";
  readonly onCopyRow: (rowId: string, value: string) => void;
  readonly onPressRow: (row: ThreadFeedActivity) => void;
  readonly renderImage: MarkdownImageRenderer;
  readonly renderReasoning: (text: string) => ReactNode;
  readonly onPressPreview: (source: FilePreviewSource) => void;
}

export function ThreadWorkLog(props: ThreadWorkLogProps) {
  if (props.activities.length === 0) {
    return null;
  }

  const plan = props.activities[0]?.projectedItem.item;
  if (plan?.type === "proposed_plan") {
    return (
      <ProposedPlanCard
        environmentId={props.environmentId}
        workspaceRoot={props.workspaceRoot}
        markdown={plan.markdown}
        renderMarkdown={props.renderReasoning}
      />
    );
  }

  return (
    <WorkLogBlock continues={props.continuesWorkLog}>
      <WorkLogRows>
        {props.activities.map((row) => (
          <ThreadWorkLogRow
            key={row.id}
            row={row}
            copied={props.copiedRowId === row.id}
            expanded={
              props.expandedRows === undefined ? null : (props.expandedRows[row.id] ?? false)
            }
            environmentId={props.environmentId}
            iconSubtleColor={props.iconSubtleColor}
            onCopyRow={props.onCopyRow}
            onPressRow={props.onPressRow}
            renderImage={props.renderImage}
            renderReasoning={props.renderReasoning}
            onPressPreview={props.onPressPreview}
            themeAppearance={props.themeAppearance}
          />
        ))}
      </WorkLogRows>
    </WorkLogBlock>
  );
}

function WorkspacePreparationRetryButton(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly runId: RunId;
}) {
  const retryable = useAtomValue(
    environmentThreadDetails.threadAtom(scopeThreadRef(props.environmentId, props.threadId)),
    (thread) => {
      const run = thread?.projection.runs.find((candidate) => candidate.id === props.runId);
      return run?.status === "failed" && run.workspacePreparation !== undefined;
    },
  );
  const retry = useAtomCommand(threadEnvironment.retryWorkspacePreparation, "retry setup");
  const [busy, setBusy] = useState(false);
  if (!retryable) return null;
  return (
    <View className="ml-7 mt-2">
      <Button
        label="Retry"
        tone="secondary"
        accessibilityLabel="Retry workspace preparation"
        disabled={busy}
        onPress={() => {
          setBusy(true);
          void Haptics.selectionAsync();
          void retry({
            environmentId: props.environmentId,
            input: { threadId: props.threadId, runId: props.runId },
          }).finally(() => setBusy(false));
        }}
        icon="arrow.clockwise"
      />
    </View>
  );
}

function ReplCodeText({
  code,
  theme,
}: {
  readonly code: string;
  readonly theme: "light" | "dark";
}) {
  const lines = useMarkdownCodeHighlight({ code, language: "typescript", theme, enabled: true });
  let offset = 0;
  const highlighted = lines?.flatMap((line, lineIndex) => {
    const separator = lineIndex > 0 ? "\n" : "";
    offset += separator.length;
    return [
      separator,
      ...line.map((token) => {
        const start = offset;
        offset += token.content.length;
        return (
          <Text key={start} style={token.color ? { color: token.color } : undefined}>
            {token.content}
          </Text>
        );
      }),
    ];
  });
  return (
    <Text selectable className="font-mono text-2xs leading-normal text-foreground">
      {highlighted ?? code}
    </Text>
  );
}

function ThreadWorkLogRow(
  props: Omit<
    ThreadWorkLogProps,
    "continuesWorkLog" | "activities" | "copiedRowId" | "expandedRows" | "workspaceRoot"
  > & {
    readonly row: ThreadFeedActivity;
    readonly copied: boolean;
    /** Null where the row opens its run instead of expanding. */
    readonly expanded: boolean | null;
  },
) {
  const { row } = props;
  const expanded = props.expanded === true;
  const opensRun = props.expanded === null;
  const openLinkedThread = useOpenLinkedThread();
  const streamsOutput =
    useCommandOutputStreaming(props.environmentId) &&
    row.projectedItem.item.type === "command_execution";
  const fetchedDetail = useTurnItemDetail(
    expanded && row.fetchesDetail && !streamsOutput
      ? { environmentId: props.environmentId, row: row.projectedItem }
      : null,
  );
  const failureItem = row.projectedItem.item;
  if (failureItem.type === "error" && failureItem.status === "failed") {
    const warning = failureItem.failure.class === "usage_limit";
    const timestamp = new Date(row.createdAt);
    const resetAt = failureItem.failure.resetAt;
    const resetTime = resetAt
      ? new Date(resetAt).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : null;
    const label = warning
      ? `Usage limit reached.${resetTime ? ` Retry after ${resetTime}.` : ""}`
      : row.summary;
    return (
      <WorkLogPressable
        accessibilityLabel={warning ? label : `${row.summary}: ${failureItem.failure.message}`}
        accessibilityHint="Long press to copy."
        onLongPress={() => props.onCopyRow(row.id, row.getCopyText())}
      >
        <View className="flex-1 py-1">
          <View className="flex-row items-center gap-1.5">
            <WorkLogIconSlot>
              <WorkLogIcon
                icon="exclamationmark.circle"
                color={props.iconSubtleColor}
                colorClassName={warning ? "accent-warning-foreground" : "accent-danger-foreground"}
              />
            </WorkLogIconSlot>
            <Text
              className={
                warning
                  ? "min-w-0 flex-1 font-t3-medium text-sm text-warning-foreground"
                  : "min-w-0 flex-1 font-t3-medium text-sm text-adaptive-rose-600-400"
              }
            >
              {label}
            </Text>
            {props.copied ? (
              <Text className="pr-1 font-t3-medium text-3xs text-adaptive-emerald-600-400">
                Copied
              </Text>
            ) : null}
            <Text
              accessibilityLabel={timestamp.toLocaleString()}
              className="shrink-0 text-xs text-foreground-tertiary"
            >
              {timestamp.toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </Text>
          </View>
          {!warning ? (
            <Text selectable className="ml-7 text-sm text-foreground">
              {failureItem.failure.message}
            </Text>
          ) : null}
          {failureItem.failure.code === ORCHESTRATION_V2_WORKSPACE_PREPARATION_FAILURE_CODE &&
          failureItem.runId !== null ? (
            <WorkspacePreparationRetryButton
              environmentId={props.environmentId}
              threadId={failureItem.threadId}
              runId={failureItem.runId}
            />
          ) : null}
        </View>
      </WorkLogPressable>
    );
  }
  const notifiedSubagentThreadId =
    row.projectedItem.item.type === "notification"
      ? notificationChildThreadId(row.projectedItem.item.source)
      : undefined;
  const canExpand = row.canExpand && notifiedSubagentThreadId === undefined;
  const reasoning = row.projectedItem.item.type === "reasoning" ? row.projectedItem.item : null;
  const fetchedItem = fetchedDetail.data?.item ?? null;
  const isRead = toolGroupAction(row.workEntry) === "read";
  const shownItem = fetchedItem ?? row.projectedItem.item;
  const call =
    expanded && !isRead && shownItem.type === "command_execution"
      ? toolCallLines({ command: shownItem.input })
      : expanded && !isRead && shownItem.type === "dynamic_tool"
        ? toolCallLines({ args: shownItem.input })
        : expanded && shownItem.type === "file_search"
          ? toolCallLines({ args: { pattern: shownItem.pattern } })
          : expanded && shownItem.type === "web_search"
            ? toolCallLines({ args: { query: shownItem.patterns?.join(", ") } })
            : null;
  const failedExitCode =
    call && shownItem.type === "command_execution" && shownItem.exitCode
      ? shownItem.exitCode
      : null;
  const fullDetail =
    expanded && !reasoning && !call
      ? fetchedItem && !isRead
        ? formatItemFullDetail(row.projectedItem, fetchedItem)
        : row.getFullDetail()
      : null;
  const outputImages = expanded && fetchedItem ? turnItemOutputImages(fetchedItem) : [];
  const viewedImagePath = workEntryViewedImagePath(row.workEntry);
  const fetchedOutput =
    !expanded || streamsOutput
      ? null
      : shownItem.type === "file_search" || shownItem.type === "web_search"
        ? turnItemOutputText(shownItem)
        : fetchedItem
          ? (turnItemOutputText(fetchedItem) ??
            (outputImages.length > 0 || viewedImagePath ? null : "No output."))
          : fetchedDetail.error
            ? `Couldn't load output: ${fetchedDetail.error}`
            : row.fetchesDetail
              ? fetchedDetail.data
                ? "Output is no longer available."
                : "Loading output…"
              : null;
  const exitLine =
    failedExitCode === null ? null : (
      <Text className="mt-1.5 font-mono text-2xs leading-normal text-danger-foreground">
        exit {failedExitCode}
      </Text>
    );
  const toolPresentation = resolveWorkEntryToolPresentation(row.workEntry);
  const previewText = row.groupStandIn?.label ?? workEntryRowLabel(row.workEntry);
  const answerPreview = row.workEntry.questionAnswer
    ? getQuestionAnswerPreview(row.workEntry.questionAnswer)
    : null;
  const accessiblePreview = [previewText, answerPreview].filter(Boolean).join(": ");
  const displayText = row.groupStandIn?.label ?? workEntryRowLabel(row.workEntry, expanded);
  const isSystemNotice = row.projectedItem.item.type === "system_notice";
  const isUsageLimit =
    row.projectedItem.item.type === "error" &&
    row.projectedItem.item.failure.class === "usage_limit" &&
    row.projectedItem.item.status !== "completed";
  const iconIsDestructive =
    !isSystemNotice && !isUsageLimit && (row.icon === "alert" || row.icon === "warning");
  const failed = row.status === "failure";
  const toolIcon = row.workEntry.toolIcon ?? row.workEntry.toolSource?.icon;
  const icon = reasoning ? "brain" : (toolPresentation?.icon ?? workRowSymbolName(row.icon));

  return (
    <View className="overflow-hidden">
      <WorkLogPressable
        accessibilityRole={
          notifiedSubagentThreadId !== undefined
            ? "link"
            : canExpand || opensRun
              ? "button"
              : undefined
        }
        accessibilityLabel={failed ? `${accessiblePreview}, tool call failed` : accessiblePreview}
        accessibilityHint={
          notifiedSubagentThreadId !== undefined
            ? "Opens this agent's thread. Long press to copy."
            : opensRun
              ? "Opens this run's work. Long press to copy."
              : canExpand
                ? `Double tap to ${expanded ? "hide" : "show"} full details. Long press to copy.`
                : "Long press to copy."
        }
        accessibilityState={canExpand && !opensRun ? { expanded } : undefined}
        onPress={() => {
          if (notifiedSubagentThreadId !== undefined) {
            openLinkedThread({
              environmentId: String(props.environmentId),
              threadId: String(notifiedSubagentThreadId),
            });
            return;
          }
          if (canExpand || opensRun) {
            void Haptics.selectionAsync();
            props.onPressRow(row);
          }
        }}
        onLongPress={() => props.onCopyRow(row.id, row.getCopyText())}
      >
        {row.live && !expanded ? (
          <ShimmeringWorkContent
            environmentId={props.environmentId}
            icon={icon}
            iconSubtleColor={props.iconSubtleColor}
            label={displayText}
            showIcon
            themeAppearance={props.themeAppearance}
            toolIcon={toolIcon}
          />
        ) : (
          <>
            <WorkLogIconSlot>
              {toolIcon ? (
                <ToolActivityIconView
                  environmentId={props.environmentId}
                  icon={toolIcon}
                  fallback={icon}
                  fallbackColor={props.iconSubtleColor}
                  themeAppearance={props.themeAppearance}
                />
              ) : (
                <WorkLogIcon
                  icon={icon}
                  color={props.iconSubtleColor}
                  colorClassName={
                    isUsageLimit
                      ? "accent-warning-foreground"
                      : iconIsDestructive
                        ? "accent-adaptive-rose-600-400"
                        : failed
                          ? "accent-danger-foreground"
                          : undefined
                  }
                />
              )}
            </WorkLogIconSlot>
            <WorkLogLabel
              tone={isUsageLimit ? "warning" : iconIsDestructive ? "danger" : "default"}
              mono={
                Platform.OS === "android" &&
                row.groupStandIn === undefined &&
                workEntryRowLabelIsCommand(row.workEntry, expanded)
              }
            >
              {displayText}
              {answerPreview ? (
                <Text
                  className={
                    !expanded &&
                    row.workEntry.questionAnswer &&
                    hasQuestionAnswer(row.workEntry.questionAnswer)
                      ? "text-foreground"
                      : "text-foreground-tertiary"
                  }
                >{`  ${answerPreview}`}</Text>
              ) : null}
            </WorkLogLabel>
          </>
        )}

        <View className="shrink-0 flex-row items-center gap-px">
          {props.copied ? (
            <Text className="pr-1 font-t3-medium text-3xs text-adaptive-emerald-600-400">
              Copied
            </Text>
          ) : null}
          {failed && toolIcon !== undefined ? (
            <View
              className="h-4 w-4 items-center justify-center"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <SymbolView
                name="xmark"
                size={11}
                tintColorClassName="accent-danger-foreground"
                type="monochrome"
              />
            </View>
          ) : null}
          <View className="h-4 w-4 items-center justify-center">
            {canExpand && opensRun ? (
              <OpenChevron tintColor={props.iconSubtleColor} />
            ) : canExpand ? (
              <ThreadDisclosureChevron
                expanded={expanded}
                collapsedDirection="down"
                size={11}
                tintColor={props.iconSubtleColor}
              />
            ) : null}
          </View>
        </View>
      </WorkLogPressable>

      {expanded &&
      (reasoning ||
        fullDetail ||
        call ||
        fetchedOutput ||
        viewedImagePath ||
        outputImages.length > 0 ||
        row.workEntry.questionAnswer) ? (
        <View className={reasoning ? "ml-7 py-1" : "pb-1 pt-0.5"}>
          {row.workEntry.questionAnswer ? (
            <QuestionAnswerHistory
              environmentId={props.environmentId}
              answer={row.workEntry.questionAnswer}
            />
          ) : null}
          {viewedImagePath ? (
            <View className="pb-1.5">
              {props.renderImage({ href: viewedImagePath, alt: null, title: null })}
            </View>
          ) : null}
          <FilePreviewGallery
            value={outputImages.map((resource) => ({
              kind: "image",
              environmentId: props.environmentId,
              resource,
            }))}
          >
            {outputImages.map((resource) => (
              <View key={resource.index} className="pb-1.5">
                <ThreadMarkdownImage
                  environmentId={props.environmentId}
                  resource={resource}
                  alt={null}
                  onPressPreview={props.onPressPreview}
                />
              </View>
            ))}
          </FilePreviewGallery>
          <DetailViewport>
            {reasoning ? (
              props.renderReasoning(reasoning.text)
            ) : call ? (
              [
                call.command,
                ...(call.args ?? []).map(([key, value]) =>
                  key === "code" &&
                  shownItem.type === "dynamic_tool" &&
                  isJavaScriptReplTool(shownItem.toolName) ? (
                    <View key={key}>
                      <Text className="font-mono text-2xs leading-normal text-foreground-muted">
                        {key}
                      </Text>
                      <ReplCodeText code={value} theme={props.themeAppearance} />
                    </View>
                  ) : (
                    `${key} ${value}`
                  ),
                ),
                call.argsText,
              ]
                .filter((line) => Boolean(line))
                .map(
                  (line, index) =>
                    /* oxlint-disable react/no-array-index-key -- Log lines are stateless positions within this output. */ typeof line ===
                    "string" ? (
                      <Text
                        key={`${index}:${line}`}
                        selectable
                        className="font-mono text-2xs leading-normal text-foreground"
                      >
                        {line}
                      </Text>
                    ) : (
                      line
                    ) /* oxlint-enable react/no-array-index-key */,
                )
            ) : fullDetail ? (
              <Text selectable className="font-mono text-2xs leading-normal text-foreground-muted">
                {fullDetail}
              </Text>
            ) : null}
            {fetchedOutput ? (
              <Text
                selectable
                className={cn(
                  "font-mono text-2xs leading-normal text-foreground-muted",
                  (!call || call.command || call.args || call.argsText) && "mt-1.5",
                )}
              >
                {fetchedOutput}
              </Text>
            ) : null}
            {streamsOutput ? null : exitLine}
          </DetailViewport>
          {streamsOutput ? (
            <>
              <ThreadCommandOutput
                environmentId={props.environmentId}
                threadId={row.projectedItem.sourceThreadId}
                itemId={row.projectedItem.sourceItemId}
                themeAppearance={props.themeAppearance}
              />
              {exitLine}
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Android details flow in the run sheet's own scroll; a nested scroller there traps drags. */
function DetailViewport(props: { readonly children: ReactNode }) {
  return Platform.OS === "android" ? (
    <View>{props.children}</View>
  ) : (
    <ScrollView
      nestedScrollEnabled
      directionalLockEnabled
      showsVerticalScrollIndicator
      className="max-h-60"
      contentContainerStyle={{ paddingRight: 8 }}
    >
      {props.children}
    </ScrollView>
  );
}

function OpenChevron(props: { readonly tintColor: ColorValue }) {
  return (
    <SymbolView name="chevron.right" size={11} tintColor={props.tintColor} type="monochrome" />
  );
}

export function ThreadWorkGroupToggle(props: {
  readonly environmentId: EnvironmentId;
  readonly rowSizing: ReturnType<typeof deriveThreadWorkLogSizing>;
  readonly hiddenCount: number;
  readonly iconSubtleColor: import("react-native").ColorValue;
  readonly summary: string;
  readonly summaryKind: ToolGroupSummaryKind;
  readonly summaryToolIcon?: "browser" | "device" | "t3-code" | "pull-request" | "brain";
  readonly themeAppearance: "light" | "dark";
  readonly toolSurface?: import("@t3tools/contracts").ToolActivitySurface;
  readonly toolIcon?: ToolActivityIcon;
  readonly hasFailure: boolean;
  readonly shimmer: boolean;
  readonly thought?: string | undefined;
  readonly trailing?: ReactNode;
  readonly onPress: () => void;
}) {
  const statusLabel = props.hasFailure ? `${props.summary}, tool call failed` : props.summary;
  const accessibilityLabel = props.thought ? `${props.thought} ${statusLabel}` : statusLabel;
  const icon =
    props.summaryToolIcon ??
    (props.toolSurface
      ? workRowSymbolName(props.toolSurface)
      : toolGroupSummarySymbolName(props.summaryKind));
  const onPress = () => {
    void Haptics.selectionAsync();
    props.onPress();
  };

  return (
    <WorkLogBlock layout="collapsed-group-header">
      {props.thought ? (
        <WorkLogPressable accessible={false} onPress={onPress} rowSizing={props.rowSizing}>
          <WorkLogIconSlot>
            <WorkLogIcon icon="brain" color={props.iconSubtleColor} />
          </WorkLogIconSlot>
          <WorkLogLabel key={props.rowSizing.textSizeKey}>{props.thought}</WorkLogLabel>
        </WorkLogPressable>
      ) : null}
      <View className="flex-row items-center">
        <View className="min-w-0 flex-1">
          <WorkLogPressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityHint={`Opens this run's work, ${props.hiddenCount} tool ${props.hiddenCount === 1 ? "call" : "calls"} here.`}
            onPress={onPress}
            rowSizing={props.rowSizing}
          >
            {props.shimmer ? (
              <ShimmeringWorkContent
                key={props.rowSizing.textSizeKey}
                environmentId={props.environmentId}
                icon={icon}
                iconSubtleColor={props.iconSubtleColor}
                label={props.summary}
                showIcon
                themeAppearance={props.themeAppearance}
                toolIcon={props.toolIcon}
              />
            ) : (
              <>
                <WorkLogIconSlot>
                  <ToolActivityIconView
                    environmentId={props.environmentId}
                    icon={props.toolIcon}
                    fallback={icon}
                    fallbackColor={props.iconSubtleColor}
                    themeAppearance={props.themeAppearance}
                  />
                </WorkLogIconSlot>
                <WorkLogLabel key={props.rowSizing.textSizeKey}>{props.summary}</WorkLogLabel>
              </>
            )}
            <OpenChevron tintColor={props.iconSubtleColor} />
          </WorkLogPressable>
        </View>
        {props.trailing}
      </View>
    </WorkLogBlock>
  );
}

export function ThreadThinkingRow(props: {
  readonly rowSizing: ReturnType<typeof deriveThreadWorkLogSizing>;
  readonly iconSubtleColor: ColorValue;
}) {
  return (
    <View
      accessible
      accessibilityLabel="Thinking"
      className="-mx-1 min-h-8 flex-row items-center px-1.5 py-0"
      style={{ minHeight: props.rowSizing.estimatedRowHeight }}
    >
      <ShimmeringWorkContent
        key={props.rowSizing.textSizeKey}
        icon="brain"
        iconSubtleColor={props.iconSubtleColor}
        label="Thinking"
        showIcon
      />
    </View>
  );
}

function ToolActivityIconView(props: {
  readonly environmentId: EnvironmentId;
  readonly icon?: ToolActivityIcon;
  readonly fallback: WorkContentIcon;
  readonly fallbackColor: ColorValue;
  readonly themeAppearance: "light" | "dark";
}) {
  if (!props.icon) {
    return <WorkLogIcon icon={props.fallback} color={props.fallbackColor} />;
  }
  if (props.icon._tag === "website") {
    const source = toolActivityFaviconUrl(props.icon, props.themeAppearance, 32);
    return source ? (
      <ToolActivityImage
        key={source}
        source={source}
        fallback={props.fallback}
        color={props.fallbackColor}
        themeAppearance={props.themeAppearance}
      />
    ) : (
      <WorkLogIcon icon={props.fallback} color={props.fallbackColor} />
    );
  }
  if (props.icon._tag === "themed-logo") {
    const source =
      props.themeAppearance === "dark"
        ? (props.icon.logoUrlDark ?? props.icon.logoUrl)
        : props.icon.logoUrl;
    return (
      <ToolActivityImage
        key={source}
        source={source}
        fallback={props.fallback}
        color={props.fallbackColor}
        themeAppearance={props.themeAppearance}
      />
    );
  }
  return (
    <NativeAppToolActivityIcon
      environmentId={props.environmentId}
      app={props.icon.app}
      fallback={props.fallback}
      color={props.fallbackColor}
      themeAppearance={props.themeAppearance}
    />
  );
}

function NativeAppToolActivityIcon(props: {
  readonly environmentId: EnvironmentId;
  readonly app: Extract<ToolActivityIcon, { readonly _tag: "native-app" }>["app"];
  readonly fallback: WorkContentIcon;
  readonly color: ColorValue;
  readonly themeAppearance: "light" | "dark";
}) {
  const source = useAssetUrl(props.environmentId, {
    _tag: "native-app-icon",
    app: props.app,
  });
  return source ? (
    <ToolActivityImage
      key={source}
      source={source}
      fallback={props.fallback}
      color={props.color}
      themeAppearance={props.themeAppearance}
    />
  ) : (
    <WorkLogIcon icon={props.fallback} color={props.color} />
  );
}

function ToolActivityImage(props: {
  readonly source: string;
  readonly fallback: WorkContentIcon;
  readonly color: ColorValue;
  readonly themeAppearance: "light" | "dark";
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <View className="h-4 w-4 items-center justify-center overflow-hidden rounded-[3px] bg-screen">
      {!loaded || failed ? <WorkLogIcon icon={props.fallback} color={props.color} /> : null}
      {!failed ? (
        <View
          style={[
            StyleSheet.absoluteFill,
            props.themeAppearance === "light" ? { filter: [{ brightness: 0.7 }] } : undefined,
          ]}
        >
          <Image
            source={props.source}
            cachePolicy="memory-disk"
            contentFit="contain"
            style={[
              StyleSheet.absoluteFill,
              { opacity: loaded ? (props.themeAppearance === "dark" ? 0.7 : 1) : 0 },
            ]}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        </View>
      ) : null}
    </View>
  );
}

function toolGroupSummarySymbolName(kind: ToolGroupSummaryKind): AppSymbolName {
  switch (kind) {
    case "pull-request":
    case "link-pr":
    case "unlink-pr":
    case "list-prs":
    case "watch-pr":
    case "unwatch-pr":
      return PullRequestGlyph.pullRequest;
    case "read":
      return { ios: "eye", android: "visibility" };
    case "edit":
      return { ios: "square.and.pencil", android: "edit" };
    case "thread-create":
      return { ios: "bubble.left", android: "chat" };
    case "command":
      return { ios: "terminal", android: "terminal" };
    case "device":
      return { ios: "iphone", android: "smartphone" };
    case "browser":
    case "search":
      return { ios: "globe", android: "public" };
    case "code-search":
      return "magnifyingglass";
    case "other":
      return { ios: "wrench", android: "build" };
    case "reasoning":
      return { ios: "brain", android: "psychology" };
    case "agent-tool":
      return { ios: "sparkles", android: "auto_awesome" };
    case "tone-tool":
      return { ios: "bolt", android: "bolt" };
    case "dynamic-tool":
    case "update":
    case "mixed":
      return { ios: "hammer", android: "construction" };
  }
}
