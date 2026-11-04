import { Chip } from "../../components/ui/Chip";
import { PullRequestSectionHeading } from "./PullRequestSectionHeading";
import type { PullRequestDetail, PullRequestListEntry } from "@t3tools/contracts";
import { Platform, View } from "react-native";
import { PullRequestCardGroup, PullRequestCardRow } from "./PullRequestControls";
import { PullRequestStackCard } from "./PullRequestStackCard";
import type { PullRequestStackState } from "./usePullRequestStack";
import { pullRequestListReviewStatus } from "./pullRequestList";
import { PullRequestGlyph } from "./pullRequestGlyphs";
import { composerPullRequests } from "../../state/pull-requests";
import { useEnvironmentQuery } from "../../state/query";
import {
  pullRequestBranchSummary,
  pullRequestChecksSummary,
  pullRequestReviewSummary,
} from "./pullRequestStatus";
import { pullRequestTarget, type PullRequestParams } from "./usePullRequestDiff";

export function PullRequestOverviewLoading({
  summary,
  params,
  stack,
}: {
  readonly summary: PullRequestListEntry;
  readonly params: PullRequestParams;
  readonly stack: PullRequestStackState;
}) {
  const review = pullRequestListReviewStatus(summary);
  const conflicting = summary.mergeability === "conflicting";
  const clean = summary.mergeability === "mergeable";
  return (
    <View
      className="gap-5"
      accessibilityLabel="Loading pull request details"
      accessibilityState={{ busy: true }}
    >
      <PullRequestStackCard params={params} state={stack} />
      <PullRequestCardGroup>
        <PullRequestCardRow
          compact
          title={
            summary.checksState === "passing"
              ? "Checks completed"
              : summary.checksState === "failing"
                ? "Checks failing"
                : summary.checksState === "pending"
                  ? "Checks running"
                  : "Checks"
          }
          icon={
            summary.checksState === "passing"
              ? "checkmark.circle"
              : summary.checksState === "failing"
                ? "exclamationmark.circle"
                : "clock"
          }
          tint={
            summary.checksState === "passing"
              ? "accent-adaptive-emerald-600-400"
              : summary.checksState === "failing"
                ? "accent-danger-foreground"
                : "accent-icon-muted"
          }
        >
          <View className="h-3 w-16 rounded bg-subtle-strong" />
        </PullRequestCardRow>
        <PullRequestCardRow
          compact
          title={review?.accessibleLabel ?? "Reviews"}
          icon={review?.icon ?? "bubble.left"}
          tint={review?.tint}
        >
          <View className="h-3 w-20 rounded bg-subtle-strong" />
        </PullRequestCardRow>
        <PullRequestCardRow
          compact
          title={
            conflicting
              ? `Conflicts with ${summary.baseBranch}`
              : clean
                ? `No conflicts with ${summary.baseBranch}`
                : "Branch"
          }
          icon={
            conflicting ? PullRequestGlyph.conflicting : clean ? "checkmark.circle" : "arrow.branch"
          }
          tint={
            conflicting
              ? "accent-danger-foreground"
              : clean
                ? "accent-adaptive-emerald-600-400"
                : undefined
          }
        />
        <MergeButtonPlaceholder />
      </PullRequestCardGroup>
      {/* Android reveals labels and the description with the overview, so nothing moves. */}
      {Platform.OS !== "android" && summary.labels.length ? (
        <View className="flex-row flex-wrap gap-2">
          {summary.labels.map((label) => (
            <Chip key={label.name} label={label.name} size="small" />
          ))}
        </View>
      ) : null}
      {Platform.OS !== "android" ? (
        <View className="gap-3">
          <PullRequestSectionHeading>Description</PullRequestSectionHeading>
          <View className="gap-3 py-1">
            <View className="h-4 w-full rounded bg-subtle-strong" />
            <View className="h-4 w-full rounded bg-subtle-strong" />
            <View className="h-4 w-3/4 rounded bg-subtle-strong" />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function MergeButtonPlaceholder() {
  return (
    <View className="border-t border-border-subtle p-3">
      {/* The merge button's height, so the card keeps its size when details arrive. */}
      <View
        className={`${Platform.OS === "android" ? "h-12" : "h-11"} rounded-xl bg-subtle-strong`}
      />
    </View>
  );
}

/**
 * The overview's status rows drawn from cached details with the rows' own summaries, light enough
 * to mount during the push. The interactive rows replace it in place once the push ends.
 */
export function PullRequestStatusPreview({
  pr,
  params,
  stack,
}: {
  readonly pr: PullRequestDetail;
  readonly params: PullRequestParams;
  readonly stack: PullRequestStackState;
}) {
  const activity = useEnvironmentQuery(composerPullRequests.activity(pullRequestTarget(params)));
  const checks = pullRequestChecksSummary(pr);
  const review = pullRequestReviewSummary(pr, activity.data);
  const conflicting = pr.mergeability === "conflicting";
  const clean = pr.mergeability === "mergeable";
  return (
    <View className="gap-5" accessibilityState={{ busy: true }}>
      <PullRequestStackCard params={params} state={stack} />
      <PullRequestCardGroup>
        <PullRequestCardRow
          compact
          menu
          expanded={false}
          title={checks.title}
          icon={checks.icon}
          tint={checks.tint}
          value={checks.count}
        />
        <PullRequestCardRow
          compact
          menu
          expanded={false}
          title={review.title}
          icon={review.icon}
          tint={review.tint}
          value={review.count}
        />
        <PullRequestCardRow
          compact
          title={
            conflicting
              ? `Conflicts with ${pr.baseBranch}`
              : clean
                ? `No conflicts with ${pr.baseBranch}`
                : "Branch"
          }
          icon={
            conflicting ? PullRequestGlyph.conflicting : clean ? "checkmark.circle" : "arrow.branch"
          }
          tint={
            conflicting
              ? "accent-danger-foreground"
              : clean
                ? "accent-adaptive-emerald-600-400"
                : undefined
          }
          value={
            conflicting || (clean && pr.baseComparison !== "behind")
              ? undefined
              : pullRequestBranchSummary(pr)
          }
        />
        <MergeButtonPlaceholder />
      </PullRequestCardGroup>
    </View>
  );
}
