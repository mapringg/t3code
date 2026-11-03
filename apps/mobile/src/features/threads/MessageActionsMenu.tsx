import type { MenuAction } from "@react-native-menu/menu";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { AndroidAnchoredMenu } from "../../components/ui/AndroidAnchoredMenu";
import { MarkdownSelectionMenuContext } from "../../native/SelectableMarkdownText";

/**
 * Android: a message's actions, opened from its text selection toolbar. A long
 * press on selectable text starts a native selection, so a long-press menu on
 * the message would open on top of it.
 */
export function MessageActionsMenu(props: {
  readonly title: string;
  readonly actions: readonly MenuAction[];
  readonly onPressAction: (actionId: string) => void;
  readonly children: ReactNode;
}) {
  const [openRequest, setOpenRequest] = useState(0);
  // Stable, so blocks memoized above the context do not re-render with each row render.
  const selectionMenuItems = useMemo(
    () => [{ text: "More actions", onPress: () => setOpenRequest((count) => count + 1) }],
    [],
  );
  return (
    <AndroidAnchoredMenu
      title={props.title}
      actions={props.actions}
      onPressAction={({ nativeEvent }) => props.onPressAction(nativeEvent.event)}
      style={{ flexShrink: 1, minWidth: 0 }}
    >
      {(open) => (
        <MarkdownSelectionMenuContext value={selectionMenuItems}>
          <OpenMenuOnRequest request={openRequest} open={open} />
          {props.children}
        </MarkdownSelectionMenuContext>
      )}
    </AndroidAnchoredMenu>
  );
}

function OpenMenuOnRequest(props: { readonly request: number; readonly open: () => void }) {
  const { request, open } = props;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- the native selection toolbar requests the menu outside React; open it once per request
  useEffect(() => {
    if (request > 0) open();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- opens per request, not whenever `open` is recreated
  }, [request]);
  return null;
}
