import { Activity, useState, type ReactNode } from "react";
import { View } from "react-native";

import { useAppearancePreferences } from "../settings/appearance/AppearancePreferencesProvider";

/**
 * Top-level tabs swap in a single frame. A tab mounts on its first visit and then stays mounted
 * while hidden, so returning to it shows its list as it was left instead of an empty one that
 * fills in. Hidden tabs keep their state but run no effects, so they register no keyboard
 * commands, back handlers, or header options.
 */
export function WorkspaceTabPanes<Tab extends string>(props: {
  readonly tabs: readonly Tab[];
  readonly selected: Tab;
  readonly renderTab: (tab: Tab) => ReactNode;
}) {
  const theme = useAppearancePreferences().themeVariables;
  const [panes, setPanes] = useState(() => ({
    theme,
    seen: new Map<Tab, { theme: typeof theme; generation: number }>([
      [props.selected, { theme, generation: 0 }],
    ]),
  }));
  const current = panes.seen.get(props.selected);
  if (panes.theme !== theme) {
    // The visible tab restyles in place; hidden ones are caught up when next shown.
    const seen = new Map(panes.seen);
    seen.set(props.selected, { theme, generation: current?.generation ?? 0 });
    setPanes({ theme, seen });
  } else if (current?.theme !== theme) {
    // Android drops style updates committed to views under a hidden Activity, so a tab hidden
    // through a theme change would keep the old colors on everything that does not re-render.
    const seen = new Map(panes.seen);
    seen.set(props.selected, {
      theme,
      generation: current === undefined ? 0 : current.generation + 1,
    });
    setPanes({ theme, seen });
  }
  return props.tabs.map((tab) => {
    const pane = panes.seen.get(tab);
    return pane ? (
      <Activity
        key={`${tab}:${pane.generation}`}
        mode={tab === props.selected ? "visible" : "hidden"}
      >
        <View className="flex-1">{props.renderTab(tab)}</View>
      </Activity>
    ) : null;
  });
}
