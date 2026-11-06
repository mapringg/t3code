export function formatElapsed(
  startedAt: string,
  nowMs: number,
  shownSinceMs = Number.POSITIVE_INFINITY,
): string | null {
  const serverStartMs = Date.parse(startedAt);
  if (!Number.isFinite(serverStartMs)) return null;
  // A device clock behind the server's would hold a new run at 0s; count from when it showed.
  const startedAtMs = Math.min(serverStartMs, shownSinceMs);
  const seconds = Math.max(0, Math.floor((nowMs - startedAtMs) / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}
