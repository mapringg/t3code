import { Platform } from "react-native";
import { AppBar } from "../../components/ui/AppBar";
import { ScreenHeaderButton } from "../../components/ui/ScreenHeaderButton";
import type { AppBarAction, AppBarMenu } from "../../components/ui/AppBar.types";
import { useAdaptiveWorkspaceLayout } from "../layout/AdaptiveWorkspaceLayout";
import type { ThreadInspectorMode } from "./thread-inspector-navigation";
import { useWorkspaceBackNavigation } from "../layout/workspace/useAndroidWorkspaceNavigation";
import {
  threadTerminalMenu,
  useThreadGitMenuDefinition,
  type ThreadGitControlsProps,
} from "./ThreadGitControls";

export function ThreadHeader(props: {
  readonly title: string;
  readonly subtitle: string;
  readonly gitControls: ThreadGitControlsProps;
  readonly onReturnToThread?: () => void;
  readonly draft?: boolean;
  readonly hasThreadCwd: boolean;
  readonly fileInspectorSupported: boolean;
  readonly inspectorMode: ThreadInspectorMode | null;
  readonly onToggleInspector: () => void;
  readonly onOpenFilesInspector: () => void;
}) {
  const goBack = useWorkspaceBackNavigation("threads");
  const { panes, toggleAuxiliaryPane, composerKeyboardActive, startNewTask } =
    useAdaptiveWorkspaceLayout();
  const gitMenu = useThreadGitMenuDefinition(props.gitControls);
  const terminalMenu = threadTerminalMenu(props.gitControls);
  const filesVisible = props.inspectorMode === "files" && panes.auxiliaryPaneVisible;
  const inspectorVisible = props.inspectorMode !== null && panes.auxiliaryPaneVisible;
  // Android's thread header is title and place only.
  const actions: AppBarAction[] =
    Platform.OS !== "android" && props.hasThreadCwd
      ? [
          {
            accessibilityLabel: filesVisible ? "Close files" : "Open files",
            icon: "folder",
            selected: filesVisible,
            disabled: !props.gitControls.canOpenFiles,
            separateBackground: false,
            onPress: filesVisible ? toggleAuxiliaryPane : props.onOpenFilesInspector,
          },
        ]
      : [];
  const menus =
    Platform.OS === "android"
      ? []
      : [gitMenu, terminalMenu].filter((menu): menu is AppBarMenu => menu !== null);

  return (
    <AppBar
      title={props.title}
      subtitle={props.subtitle}
      onBackToList={goBack}
      onCompose={props.draft || Platform.OS === "android" ? undefined : startNewTask}
      backInSplitView={
        props.onReturnToThread
          ? {
              accessibilityLabel: "Return to chat",
              icon: "chevron.left",
              onPress: props.onReturnToThread,
            }
          : undefined
      }
      actions={actions}
      menus={menus}
      trailing={
        Platform.OS !== "android" && props.fileInspectorSupported && props.hasThreadCwd ? (
          <ScreenHeaderButton
            accessibilityLabel={inspectorVisible ? "Hide inspector" : "Show inspector"}
            icon="sidebar.right"
            selected={inspectorVisible}
            onPress={props.onToggleInspector}
          />
        ) : null
      }
      hideBottomBorder
      // Android's header holds its height, as Gemini's does: collapsing it would re-lay out the
      // header and the feed mid-way through the keyboard's animation.
      compact={Platform.OS !== "android" && composerKeyboardActive}
    />
  );
}
