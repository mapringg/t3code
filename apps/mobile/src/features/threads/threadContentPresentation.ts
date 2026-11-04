import { type EnvironmentConnectionPhase } from "@t3tools/client-runtime/connection";
import type { EnvironmentThreadStatus } from "@t3tools/client-runtime/state/threads";

export type ThreadContentPresentation =
  | { readonly kind: "ready" }
  | { readonly kind: "loading" }
  | {
      readonly kind: "unavailable";
      readonly title: string;
      readonly detail: string;
    };

export function projectThreadContentPresentation(input: {
  readonly hasDetail: boolean;
  readonly detailError: string | null;
  readonly detailDeleted: boolean;
  readonly connectionState: EnvironmentConnectionPhase;
}): ThreadContentPresentation {
  if (input.hasDetail) {
    return { kind: "ready" };
  }
  if (input.detailDeleted) {
    return {
      kind: "unavailable",
      title: "Thread unavailable",
      detail: "This thread was deleted or is no longer available.",
    };
  }
  if (input.detailError !== null) {
    return {
      kind: "unavailable",
      title: "Could not load conversation",
      detail: input.detailError,
    };
  }
  if (
    input.connectionState === "connected" ||
    input.connectionState === "connecting" ||
    input.connectionState === "reconnecting"
  ) {
    return { kind: "loading" };
  }
  return {
    kind: "unavailable",
    title: "Messages not cached",
    detail: "Reconnect this environment to load the conversation.",
  };
}

export function threadSyncLabel(input: {
  readonly syncStatus: EnvironmentThreadStatus | undefined;
  readonly contentKind: ThreadContentPresentation["kind"];
}): string | null {
  const syncing =
    input.syncStatus === "empty" ||
    input.syncStatus === "cached" ||
    input.syncStatus === "synchronizing";
  if (!syncing || input.contentKind === "unavailable") return null;
  return input.contentKind === "ready" ? "Syncing messages…" : "Loading messages…";
}

export function threadHeaderConnectionLabel(input: {
  readonly connectionState: EnvironmentConnectionPhase;
  readonly syncStatus: EnvironmentThreadStatus | undefined;
  readonly contentKind: ThreadContentPresentation["kind"];
}): string | null {
  switch (input.connectionState) {
    case "connecting":
    case "reconnecting":
      return "Reconnecting…";
    case "offline":
      return "Offline";
    case "available":
      return "Not connected";
    case "unsupported":
      return "Client not supported";
    case "error":
      return "Connection failed";
    case "connected":
      return threadSyncLabel(input);
  }
}

/**
 * A shown sync pill keeps its first label: a cold open's "Loading" would otherwise swap to
 * "Syncing" the moment content lands, restarting the pill's minimum hold over a ready feed.
 */
export function lockThreadSyncLabel(
  locked: string | null,
  label: string | null,
  shown: boolean,
): string | null {
  return shown ? (locked ?? label) : null;
}

/**
 * Catch-up applies missed events in batches, and a revealed feed follows the end through each one.
 * Hold it until the thread is live, unless the environment is unreachable and the cache is all there is.
 */
export function feedAwaitsThreadCatchUp(input: {
  readonly syncStatus: EnvironmentThreadStatus | undefined;
  readonly detailError: string | null;
  readonly connectionState: EnvironmentConnectionPhase;
}): boolean {
  return (
    (input.syncStatus === "cached" || input.syncStatus === "synchronizing") &&
    input.detailError === null &&
    (input.connectionState === "connected" || input.connectionState === "connecting")
  );
}
