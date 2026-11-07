import { RegistryContext } from "@effect/atom-react";
import { useNavigation } from "@react-navigation/native";
import { useContext, useRef, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import type { Atom } from "effect/reactivity";

/**
 * Home stays mounted under a pushed Thread, and native-stack never freezes the
 * route directly below the focused one on Fabric, so Home has to stop its own
 * work. The Home screen's static `listeners` (Stack.tsx) drive this store.
 */
let homeVisible: boolean | null = null;
const visibilityListeners = new Set<() => void>();

function setHomeVisible(next: boolean) {
  if (next === homeVisible) return;
  homeVisible = next;
  for (const listener of visibilityListeners) listener();
}

function subscribeHomeVisibility(onChange: () => void) {
  visibilityListeners.add(onChange);
  return () => {
    visibilityListeners.delete(onChange);
    // The value describes one Home instance. A later Home can mount under a
    // Thread with no event of its own (Android activity replacement, a cold
    // deep link), so it must fall back to `isFocused()` instead of this one.
    if (visibilityListeners.size === 0) homeVisible = null;
  };
}

// Android catches Home up after the pop has landed: the changes from while it was covered then
// slide into place on a still list, instead of rebuilding it mid-animation. The timer covers a
// focus with no transition, such as a sheet closing over Home.
const SHOW_AFTER_FOCUS_MS = 400;
let pendingShow: ReturnType<typeof setTimeout> | null = null;

function cancelPendingShow() {
  if (pendingShow === null) return;
  clearTimeout(pendingShow);
  pendingShow = null;
}

function showHome() {
  if (Platform.OS !== "android") {
    setHomeVisible(true);
    return;
  }
  if (pendingShow !== null || homeVisible === true) return;
  pendingShow = setTimeout(() => {
    pendingShow = null;
    setHomeVisible(true);
  }, SHOW_AFTER_FOCUS_MS);
}

export function recordHomeTransitionStart(closing: boolean): void {
  if (!closing) showHome();
}

export function recordHomeTransitionEnd(closing: boolean): void {
  cancelPendingShow();
  setHomeVisible(!closing);
}

/** Popping a sheet or a deep-linked route above Home has no appear event. */
export function recordHomeFocus(): void {
  showHome();
}

export function useHomeRouteVisible(): boolean {
  const navigation = useNavigation();
  const visible = useSyncExternalStore(subscribeHomeVisibility, () => homeVisible);
  // Before Home's first navigation event: a cold deep link mounts Home under
  // its Thread without ever showing it.
  return visible ?? navigation.isFocused();
}

export function useAtomValueWhileVisible<A>(atom: Atom.Atom<A>, visible: boolean): A {
  const registry = useContext(RegistryContext);
  const held = useRef<{ readonly value: A } | null>(null);
  const subscribe = (onChange: () => void) =>
    visible ? registry.subscribe(atom, onChange) : () => undefined;
  return useSyncExternalStore(subscribe, () => {
    if (visible || held.current === null) held.current = { value: registry.get(atom) };
    return held.current.value;
  });
}
