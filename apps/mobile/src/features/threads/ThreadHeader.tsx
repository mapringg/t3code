import { useMemo } from "react";
import { Platform } from "react-native";
import { AppBar } from "../../components/ui/AppBar";
import { ScreenHeaderButton } from "../../components/ui/ScreenHeaderButton";
import type { AppBarAction } from "../../components/ui/AppBar.types";
import { useAdaptiveWorkspaceLayout } from "../layout/AdaptiveWorkspaceLayout";
import type { ThreadInspectorMode } from "./thread-inspector-content-stack";
import { useThreadHeaderOptions } from "./useThreadHeaderOptions";
import { useWorkspaceBackNavigation } from "../workspace/useAndroidWorkspaceNavigation";
import { PullRequestGlyph } from "../pull-requests/pullRequestGlyphs";
import type { ThreadLifecycleStatus } from "./useThreadLifecycleStatus";

export function ThreadHeader(
  props: Parameters<typeof useThreadHeaderOptions>[0] & {
    readonly hasThreadCwd: boolean;
    readonly hasWorkspaceRoot: boolean;
    readonly fileInspectorSupported: boolean;
    readonly inspectorMode: ThreadInspectorMode | null;
    readonly onToggleInspector: () => void;
    readonly onOpenGitInspector: () => void;
    readonly onOpenFilesInspector: () => void;
    /** Android shows it in the subtitle and overflow menu; iOS shows it floating over the feed. */
    readonly lifecycleStatus?: ThreadLifecycleStatus | null;
    readonly connectionStatusLabel?: string | null;
    readonly onReconnect?: () => void;
  },
) {
  const lifecycle = Platform.OS === "android" ? (props.lifecycleStatus ?? null) : null;
  const goBack = useWorkspaceBackNavigation("threads");
  const { layout, panes, toggleAuxiliaryPane, composerKeyboardActive } =
    useAdaptiveWorkspaceLayout();
  const { onOpenTerminal, onMergeBack } = props.gitControls;
  const native = useThreadHeaderOptions(props);
  const lifecycleAction = lifecycle?.action ?? null;
  const connectionStatusLabel = Platform.OS === "android" ? props.connectionStatusLabel : null;
  const androidHeaderActions = useMemo<ReadonlyArray<AppBarAction>>(() => {
    const actions: AppBarAction[] = [];
    if (props.onReturnToThread) {
      actions.push({
        accessibilityLabel: "Return to chat",
        icon: "chevron.left",
        onPress: props.onReturnToThread,
      });
    }
    if (Platform.OS !== "android" && props.hasThreadCwd) {
      const filesVisible = props.inspectorMode === "files" && panes.auxiliaryPaneVisible;
      actions.push({
        accessibilityLabel: filesVisible ? "Close files" : "Open files",
        selected: filesVisible,
        icon: "folder",
        onPress: filesVisible ? toggleAuxiliaryPane : props.onOpenFilesInspector,
        overflowOnly: true,
      });
    }
    if (Platform.OS !== "android" && props.hasWorkspaceRoot && props.gitControls.canOpenTerminal) {
      actions.push({
        accessibilityLabel: "Open terminal",
        icon: "terminal",
        onPress: () => onOpenTerminal(null),
        overflowOnly: true,
      });
    }
    if (Platform.OS !== "android") {
      actions.push({
        accessibilityLabel: "Open git controls",
        icon: "point.topleft.down.curvedto.point.bottomright.up",
        onPress: props.onOpenGitInspector,
        overflowOnly: true,
      });
    }
    if (Platform.OS !== "android" && onMergeBack) {
      actions.push({
        accessibilityLabel: "Merge back to source",
        icon: PullRequestGlyph.merged,
        onPress: onMergeBack,
        overflowOnly: true,
      });
    }
    if (Platform.OS === "android" && props.onReconnect) {
      actions.push({
        accessibilityLabel: "Reconnect environment",
        icon: "arrow.clockwise",
        onPress: props.onReconnect,
        overflowOnly: true,
      });
    }
    if (lifecycleAction) {
      actions.push({
        accessibilityLabel: lifecycleAction.label,
        icon: "clock",
        disabled: lifecycleAction.disabled,
        onPress: lifecycleAction.onPress,
        overflowOnly: true,
      });
    }
    return actions;
  }, [
    props.inspectorMode,
    panes.auxiliaryPaneVisible,
    props.onOpenFilesInspector,
    onOpenTerminal,
    onMergeBack,
    props.onOpenGitInspector,
    toggleAuxiliaryPane,
    props.onReturnToThread,
    props.hasThreadCwd,
    props.hasWorkspaceRoot,
    props.gitControls.canOpenTerminal,
    lifecycleAction,
    props.onReconnect,
  ]);

  return (
    <>
      <AppBar
        title={props.title}
        subtitle={[connectionStatusLabel, props.subtitle, lifecycle?.label]
          .filter(Boolean)
          .join(" · ")}
        sidebar={native.sidebar}
        options={native.options}
        optionsVersion={native.optionsVersion}
        trailing={
          Platform.OS !== "android" && props.fileInspectorSupported && props.hasThreadCwd ? (
            <ScreenHeaderButton
              accessibilityLabel={
                props.inspectorMode !== null && panes.auxiliaryPaneVisible
                  ? "Hide inspector"
                  : "Show inspector"
              }
              icon="sidebar.right"
              selected={props.inspectorMode !== null && panes.auxiliaryPaneVisible}
              onPress={props.onToggleInspector}
            />
          ) : null
        }
        onBack={layout.usesSplitView ? undefined : goBack}
        actions={androidHeaderActions}
        hideBottomBorder
        compact={composerKeyboardActive}
      />
      {native.fallback}
    </>
  );
}
