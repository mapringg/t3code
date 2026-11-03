import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import {
  effectiveSnoozed,
  isThreadWokeUnseen,
  snoozeWakeLabel,
  threadWokeAt,
} from "@t3tools/client-runtime/state/thread-settled";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";

import * as Dialog from "../../components/ui/Dialog";
import { scopedThreadKey } from "../../lib/scopedEntities";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import type { FloatingWorkingStatus } from "./floating-working-status";

export type ThreadLifecycleStatus = Extract<FloatingWorkingStatus, { kind: "lifecycle" }>;

/** A snoozed, settled, or freshly woken thread's state and the action that leaves it. */
export function useThreadLifecycleStatus(input: {
  readonly thread: EnvironmentThreadShell | null;
  readonly configLoaded: boolean;
  readonly canOperateThread: boolean;
}): ThreadLifecycleStatus | null {
  const { thread } = input;
  const configLoaded = input.configLoaded && thread !== null;
  const unsnoozeThread = useAtomCommand(threadEnvironment.unsnooze, { reportFailure: false });
  const unsettleThread = useAtomCommand(threadEnvironment.unsettle, { reportFailure: false });
  const updateMetadata = useAtomCommand(threadEnvironment.updateMetadata, { reportFailure: false });
  const visitThread = useAtomCommand(threadEnvironment.visit, { reportFailure: false });
  const threadKey = thread === null ? null : scopedThreadKey(thread.environmentId, thread.id);
  const [statusRequest, setStatusRequest] = useState<{ threadKey: string } | null>(null);
  const statusPending = threadKey !== null && statusRequest?.threadKey === threadKey;
  const [lifecycleNow, setLifecycleNow] = useState(() => new Date().toISOString());
  useFocusEffect(
    useCallback(() => {
      setLifecycleNow(new Date().toISOString());
      const timer = setInterval(() => setLifecycleNow(new Date().toISOString()), 60_000);
      return () => clearInterval(timer);
    }, []),
  );
  const snoozed = configLoaded && effectiveSnoozed(thread, { now: lifecycleNow });
  const snoozedUntil = thread?.snoozedUntil ?? null;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- arms a timer that refreshes the lifecycle clock when the thread's snooze expires
  useEffect(() => {
    if (!snoozed || snoozedUntil === null) return;
    const timer = setTimeout(
      () => setLifecycleNow(new Date().toISOString()),
      Math.min(Math.max(0, Date.parse(snoozedUntil) - Date.now()) + 50, 2_147_483_647),
    );
    return () => clearTimeout(timer);
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Re-arm if timer clamping fires before the wake time.
  }, [snoozed, snoozedUntil, lifecycleNow]);
  const settled = configLoaded && thread.settledOverride === "settled";
  const wokeAt = configLoaded ? threadWokeAt(thread, { now: lifecycleNow }) : null;
  const woke =
    configLoaded &&
    isThreadWokeUnseen({
      wokeAt,
      settled,
      lastVisitedAt: thread.lastVisitedAt,
      latestRunCompletedAt: thread.latestRun?.completedAt ?? null,
    });
  const runStatusAction = async (action: "wake" | "unsettle" | "dismiss") => {
    if (thread === null || threadKey === null || statusPending || !input.canOperateThread) return;
    const request = { threadKey };
    setStatusRequest(request);
    const target = { environmentId: thread.environmentId, input: { threadId: thread.id } };
    const recovery = thread.limitRecovery;
    const recoveryOwnsSnooze =
      recovery?.snooze === true &&
      recovery.runId === thread.latestRun?.runId &&
      snoozedUntil !== null &&
      Date.parse(snoozedUntil) === Date.parse(recovery.resetAt);
    const result =
      action === "wake"
        ? recoveryOwnsSnooze
          ? await updateMetadata({
              ...target,
              input: {
                ...target.input,
                limitRecovery: { runId: recovery.runId, resetAt: recovery.resetAt, snooze: false },
              },
            })
          : await unsnoozeThread({ ...target, input: { ...target.input, reason: "user" } })
        : action === "unsettle"
          ? await unsettleThread({ ...target, input: { ...target.input, reason: "user" } })
          : await visitThread({
              ...target,
              input: { ...target.input, visitedAt: wokeAt ?? lifecycleNow },
            });
    setStatusRequest((current) => (current === request ? null : current));
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      Dialog.alert(
        "Could not update thread",
        error instanceof Error ? error.message : "Try again.",
      );
    }
  };

  if (!snoozed && !settled && !woke) return null;
  const label =
    snoozed && snoozedUntil !== null
      ? `Snoozed, wakes in ${snoozeWakeLabel(snoozedUntil, { now: lifecycleNow })}`
      : settled
        ? "Settled"
        : "Woke from snooze";
  const actionLabel = snoozed ? "Wake now" : settled ? "Un-settle" : "Dismiss";
  return {
    kind: "lifecycle",
    state: snoozed ? "snoozed" : settled ? "settled" : "woke",
    label,
    action: {
      label: statusPending
        ? snoozed
          ? "Waking…"
          : settled
            ? "Un-settling…"
            : "Dismissing…"
        : actionLabel,
      accessibilityLabel: actionLabel,
      disabled: !input.canOperateThread || statusPending,
      onPress: () => void runStatusAction(snoozed ? "wake" : settled ? "unsettle" : "dismiss"),
    },
  };
}
