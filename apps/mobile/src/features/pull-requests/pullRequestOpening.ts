/**
 * What an opening pull request shows. The header and status rows come from whatever is already
 * known, so they are on screen from the push's first frame. The rest of the overview waits for the
 * push to end, because mounting it in the push's first commit freezes the tap on Android.
 */
export function pullRequestOpening<Detail extends object, Summary extends object>(input: {
  readonly entered: boolean;
  readonly detail: Detail | null;
  readonly summary: Summary | undefined;
}) {
  const { entered, detail, summary } = input;
  return {
    identity: detail ?? summary ?? null,
    body: detail
      ? entered
        ? ("overview" as const)
        : ("status" as const)
      : summary
        ? ("loading" as const)
        : null,
  };
}
