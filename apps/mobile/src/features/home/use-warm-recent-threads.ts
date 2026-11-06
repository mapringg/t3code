import { useEffect, useEffectEvent } from "react";
import { Platform } from "react-native";

import { scopedThreadKey } from "../../lib/scopedEntities";
import { startOpeningEnvironmentThread } from "../../state/threads";
import type { ThreadListV2ListItem } from "../threads/threadListV2";

const WARM_COUNT = 5;
// Under the thread snapshot cache's 5 min idle life, so a warm open never refetches in full.
const WARM_AGAIN_AFTER_MS = 4 * 60_000;
const WARM_STAGGER_MS = 250;
const warmedAt = new Map<string, number>();

/**
 * Android loads the newest threads' snapshots while Home is shown, so opening one paints its
 * conversation during the slide, as Gemini does, instead of waiting on a first full fetch.
 */
export function useWarmRecentThreads(items: ReadonlyArray<ThreadListV2ListItem>) {
  const threads = items
    .flatMap((item) => (item.type === "v2-thread" ? [item.item.thread] : []))
    .slice(0, WARM_COUNT);
  const warmKey = threads.map((thread) => scopedThreadKey(thread.environmentId, thread.id)).join();
  const warm = useEffectEvent(() => {
    const timers = threads.map((thread, index) =>
      setTimeout(
        () => {
          const key = scopedThreadKey(thread.environmentId, thread.id);
          const last = warmedAt.get(key);
          if (last !== undefined && Date.now() - last < WARM_AGAIN_AFTER_MS) return;
          warmedAt.set(key, Date.now());
          startOpeningEnvironmentThread(thread.environmentId, thread.id);
        },
        (index + 1) * WARM_STAGGER_MS,
      ),
    );
    return () => timers.forEach(clearTimeout);
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- starts background loads for the threads Home shows, keyed by their identities
  useEffect(() => {
    if (Platform.OS !== "android" || warmKey === "") return;
    return warm();
  }, [warmKey]);
}
