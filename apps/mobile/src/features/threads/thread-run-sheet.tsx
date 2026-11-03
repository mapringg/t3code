import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useEffect, useEffectEvent, useState, type ReactNode } from "react";
import { Platform, ScrollView, View, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { FilePreviewSource } from "../../components/FilePreviewModal";
import { AppText as Text } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import { Sheet } from "../../components/ui/Sheet";
import type { ThreadFeedActivity, ThreadFeedRunWorkItem } from "../../lib/threadActivity";
import type { MarkdownImageRenderer } from "../../native/SelectableMarkdownText";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { THREAD_WORK_ROW_MIN_HEIGHT } from "../../lib/layout";
import { ThreadWorkLog } from "./thread-work-log";
import { WorkLogIconSlot, WorkLogRows } from "./work-log-layout";

/** A run's work, opened from its line in the feed. Rows expand here, never in the feed. */
export function ThreadRunSheet(props: {
  readonly title: string;
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly workspaceRoot: string | null | undefined;
  readonly items: ReadonlyArray<ThreadFeedRunWorkItem>;
  readonly copiedRowId: string | null;
  readonly iconSubtleColor: ColorValue;
  readonly themeAppearance: "light" | "dark";
  readonly onCopyRow: (rowId: string, value: string) => void;
  readonly renderImage: MarkdownImageRenderer;
  readonly renderMarkdown: (text: string) => ReactNode;
  readonly onPressPreview: (source: FilePreviewSource) => void;
  readonly onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [expandedRows, setExpandedRows] = useState<Readonly<Record<string, boolean>>>({});
  const loadWork = useAtomCommand(threadEnvironment.loadEarlierHistory, { reportFailure: false });
  const [settled, setSettled] = useState<{
    readonly key: string;
    readonly failed: boolean;
  } | null>(null);
  const deferredKey = props.items
    .flatMap((item) =>
      item.type === "activity" && item.activity.projectedItem.item.deferredWork
        ? [String(item.activity.projectedItem.sourceItemId)]
        : [],
    )
    .join("\n");
  const history =
    deferredKey === ""
      ? "idle"
      : settled?.key !== deferredKey
        ? "loading"
        : settled.failed
          ? "failed"
          : "idle";
  const load = (key: string) => {
    void Promise.all(
      key.split("\n").map((workAnchorId) =>
        loadWork({
          environmentId: props.environmentId,
          input: { threadId: props.threadId, workAnchorId },
        }),
      ),
    ).then((results) =>
      setSettled({
        key,
        failed: results.some(
          (result) => result._tag === "Failure" || result.value._tag === "error",
        ),
      }),
    );
  };
  const loadDeferred = useEffectEvent(load);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- fetches the run's collapsed server history once the sheet shows it
  useEffect(() => {
    if (deferredKey) loadDeferred(deferredKey);
  }, [deferredKey]);

  const toggleRow = (row: ThreadFeedActivity) =>
    setExpandedRows((current) => ({ ...current, [row.id]: !(current[row.id] ?? false) }));
  const blocks: Array<
    | { readonly type: "work"; readonly activities: ThreadFeedActivity[] }
    | Extract<ThreadFeedRunWorkItem, { readonly type: "message" }>
  > = [];
  for (const item of props.items) {
    const last = blocks.at(-1);
    if (item.type === "message") blocks.push(item);
    else if (last?.type === "work") last.activities.push(item.activity);
    else blocks.push({ type: "work", activities: [item.activity] });
  }

  return (
    <Sheet title={props.title} onClose={props.onClose}>
      <ScrollView
        nestedScrollEnabled
        className="flex-1"
        contentInsetAdjustmentBehavior={Platform.OS === "ios" ? "automatic" : "never"}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: Math.max(20, insets.bottom),
        }}
      >
        {blocks.map((block) =>
          block.type === "message" ? (
            <View key={block.entry.id} className="mb-3 px-1">
              {props.renderMarkdown(block.entry.message.text)}
            </View>
          ) : (
            <ThreadWorkLog
              key={block.activities[0]!.id}
              activities={block.activities}
              environmentId={props.environmentId}
              workspaceRoot={props.workspaceRoot}
              copiedRowId={props.copiedRowId}
              expandedRows={expandedRows}
              iconSubtleColor={props.iconSubtleColor}
              themeAppearance={props.themeAppearance}
              onCopyRow={props.onCopyRow}
              onPressRow={toggleRow}
              renderImage={props.renderImage}
              renderReasoning={props.renderMarkdown}
              onPressPreview={props.onPressPreview}
            />
          ),
        )}
        {history === "loading" ? (
          <View accessible accessibilityLabel="Loading work" className="pb-2">
            <WorkLogRows>
              {(["40%", "60%", "33%"] as const).map((width) => (
                <View
                  key={width}
                  className="flex-row items-center gap-1.5 px-0.5"
                  style={{ minHeight: THREAD_WORK_ROW_MIN_HEIGHT }}
                >
                  <WorkLogIconSlot>
                    <View className="size-3 rounded bg-subtle-strong" />
                  </WorkLogIconSlot>
                  <View className="h-2.5 rounded-full bg-subtle-strong" style={{ width }} />
                </View>
              ))}
            </WorkLogRows>
          </View>
        ) : history === "failed" ? (
          <View className="items-start gap-2 px-1">
            <Text className="text-sm text-foreground-muted">Couldn't load work.</Text>
            <Button
              label="Retry"
              tone="secondary"
              icon="arrow.clockwise"
              onPress={() => {
                setSettled(null);
                load(deferredKey);
              }}
            />
          </View>
        ) : blocks.length === 0 ? (
          <Text className="pt-6 text-center text-sm text-foreground-muted">No work to show.</Text>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}
