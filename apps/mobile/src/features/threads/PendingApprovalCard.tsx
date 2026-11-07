import { Button } from "../../components/ui/Button";
import type {
  ProviderApprovalDecision,
  ProviderApprovalOption,
  RuntimeRequestId,
} from "@t3tools/contracts";
import {
  FULL_ACCESS_OVERRIDE_QUESTION,
  fullAccessOverrideExplanation,
} from "@t3tools/client-runtime/state/thread-requests";
import { useState } from "react";
import { Platform, Pressable, View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import { cn } from "../../lib/cn";
import type { PendingApproval } from "../../lib/threadActivity";

export interface PendingApprovalCardProps {
  readonly canOperateThread: boolean;
  readonly approval: PendingApproval;
  readonly respondingApprovalId: RuntimeRequestId | null;
  readonly onRespond: (
    requestId: RuntimeRequestId,
    decision: ProviderApprovalDecision,
  ) => Promise<unknown>;
}

const DEFAULT_APPROVAL_OPTIONS: ReadonlyArray<ProviderApprovalOption> = [
  { decision: "accept", label: "Allow once" },
  { decision: "acceptForSession", label: "Allow session" },
  { decision: "decline", label: "Decline" },
];

// Providers order choices differently; Android puts dismissals first and the one-time Allow last.
const ANDROID_DECISION_RANK: Record<ProviderApprovalOption["decision"], number> = {
  cancel: 0,
  decline: 1,
  acceptAlways: 2,
  acceptForSession: 3,
  accept: 4,
};

const ANDROID_REQUEST_TITLE: Record<PendingApproval["requestKind"], string> = {
  command: "Run this command?",
  "file-read": "Read these files?",
  "file-change": "Change these files?",
  "mcp-elicitation": "Tool request",
  permission: "Grant this permission?",
};

export function PendingApprovalCard(props: PendingApprovalCardProps) {
  const options: ReadonlyArray<ProviderApprovalOption> =
    props.approval.options ?? DEFAULT_APPROVAL_OPTIONS;
  const warning = options.find((option) => option.warning)?.warning;
  const canRespond = props.approval.responseCapability === "live";
  const disabled = !canRespond || props.respondingApprovalId === props.approval.requestId;
  const [explanationOpen, setExplanationOpen] = useState(false);
  return (
    <View className="gap-2.5 rounded-[20px] border border-border bg-card-alt p-4 android:border-0 android:bg-transparent android:px-1 android:pt-0">
      {/* Android's status line already says the run waits for approval. */}
      {Platform.OS === "android" ? null : (
        <Text className="font-t3-bold text-2xs uppercase tracking-[1.1px] text-foreground-secondary">
          Approval needed
        </Text>
      )}
      <Text className="font-t3-bold text-lg text-foreground android:font-t3-medium android:text-base">
        {props.approval.appName ??
          (Platform.OS === "android"
            ? ANDROID_REQUEST_TITLE[props.approval.requestKind]
            : props.approval.requestKind)}
      </Text>
      {props.approval.detail ? (
        <Text
          className={cn(
            "font-sans text-sm leading-normal text-foreground-secondary android:text-foreground",
            // Only a command is a machine value; other kinds' detail is the provider's prose.
            Platform.OS === "android" &&
              props.approval.requestKind === "command" &&
              "font-mono text-xs",
          )}
        >
          {props.approval.detail}
        </Text>
      ) : null}
      {props.approval.reason ? (
        <Text className="font-sans text-xs leading-normal text-warning-foreground">
          {props.approval.reason}
        </Text>
      ) : null}
      {props.approval.fullAccessOverride ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: explanationOpen }}
          onPress={() => setExplanationOpen((open) => !open)}
        >
          <Text className="font-t3-bold text-xs text-foreground-secondary underline">
            {FULL_ACCESS_OVERRIDE_QUESTION}
          </Text>
          {explanationOpen ? (
            <Text className="mt-1 font-sans text-xs leading-normal text-foreground-muted">
              {fullAccessOverrideExplanation(props.approval.fullAccessOverride)}
            </Text>
          ) : null}
        </Pressable>
      ) : null}
      {!canRespond ? (
        <Text className="font-sans text-sm leading-5 text-foreground-muted">
          The provider process for this request is no longer available. Interrupt or restart the run
          to continue.
        </Text>
      ) : null}
      {warning ? (
        <Text className="font-sans text-xs leading-normal text-warning-foreground">{warning}</Text>
      ) : null}
      {/* Android ends the choices with the confirming one, right-aligned, as its dialogs do. */}
      <View className="flex-row flex-wrap gap-2.5 android:justify-end android:gap-2">
        {(Platform.OS === "android"
          ? [...options].sort(
              (left, right) =>
                ANDROID_DECISION_RANK[left.decision] - ANDROID_DECISION_RANK[right.decision],
            )
          : options
        ).map((option) => (
          <Button
            key={option.decision}
            label={option.label}
            tone={
              option.decision === "accept"
                ? "primary"
                : option.decision === "decline" && Platform.OS !== "android"
                  ? "danger"
                  : "secondary"
            }
            disabled={disabled || !props.canOperateThread}
            onPress={() => void props.onRespond(props.approval.requestId, option.decision)}
          />
        ))}
      </View>
      {!props.canOperateThread ? (
        <Text className="font-sans text-xs text-foreground-muted">
          This connection cannot respond to approvals.
        </Text>
      ) : null}
    </View>
  );
}
