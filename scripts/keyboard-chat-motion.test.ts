// @effect-diagnostics nodeBuiltinImport:off - exercises the installed native keyboard hook in a synchronous VM.
import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodeVM from "node:vm";
import { expect, it, vi } from "vite-plus/test";

it("mounts above an open keyboard, closes back to the unoccluded end, and ignores a later hide", () => {
  const root = new URL(
    "../apps/mobile/node_modules/react-native-keyboard-controller/src/components/KeyboardChatScrollView/useChatKeyboard/",
    import.meta.url,
  );
  const strip = (name: string) =>
    NodeModule.stripTypeScriptTypes(NodeFS.readFileSync(new URL(name, root), "utf8"))
      .replace(/^import[\s\S]*?from ["'][^"']+["'];\n/gm, "")
      .replace(/export /g, "")
      .replace(/\{ useChatKeyboard \};/, "");
  const scrollTo = vi.fn();
  const scroll = { value: 796 };
  let handlers:
    | { onStart: (event: { height: number }) => void; onMove: (event: { height: number }) => void }
    | undefined;
  const hook = NodeVM.runInNewContext(
    `${strip("helpers.ts")}\n${strip("index.ts")}\nuseChatKeyboard`,
    {
      useCallback: (callback: unknown) => callback,
      useSharedValue: (value: number) => ({ value }),
      useKeyboardHandler: (value: typeof handlers) => {
        handlers = value;
      },
      KeyboardController: { state: () => ({ height: 320 }), isVisible: () => true },
      useScrollState: () => ({
        layout: { value: { height: 800 } },
        size: { value: { height: 1200 } },
        offset: scroll,
      }),
      safeScrollTo: scrollTo,
      interpolate: (height: number, [start, end]: number[], [low, high]: number[]) =>
        low! + ((height - start!) / (end! - start!)) * (high! - low!),
    },
  ) as (
    ref: unknown,
    options: unknown,
  ) => { padding: { value: number }; currentHeight: { value: number } };
  const chat = hook(
    {},
    {
      offset: 24,
      freeze: { value: false },
      blankSpace: { value: 0 },
      extraContentPadding: { value: 100 },
      keyboardLiftBehavior: "whenAtEnd",
      inverted: false,
    },
  );
  expect(chat.padding.value).toBe(296);
  expect(chat.currentHeight.value).toBe(320);
  let reconcile: ((isFrozen: boolean, wasFrozen: boolean) => void) | undefined;
  const frozenSource = NodeModule.stripTypeScriptTypes(
    NodeFS.readFileSync(new URL("../useFrozenPadding/index.ts", root), "utf8"),
  )
    .replace(/^import[\s\S]*?from ["'][^"']+["'];\n/gm, "")
    .replace(/export /g, "")
    .replace(/\{ useFrozenPadding \};/, "");
  const frozenHook = NodeVM.runInNewContext(
    `${strip("helpers.ts")}\n${frozenSource}\nuseFrozenPadding`,
    {
      useSharedValue: (value: number) => ({ value }),
      useKeyboardHandler: () => {},
      interpolate: (height: number, [start, end]: number[], [low, high]: number[]) =>
        low! + ((height - start!) / (end! - start!)) * (high! - low!),
      useAnimatedReaction: (_read: unknown, react: typeof reconcile) => {
        reconcile = react;
      },
      KeyboardController: { state: () => ({ height: 320 }), isVisible: () => true },
    },
  ) as (options: unknown) => void;
  frozenHook({ freeze: { value: false }, offset: 24, padding: chat.padding });
  reconcile!(false, true);
  expect(chat.padding.value).toBe(296);
  handlers!.onStart({ height: 0 });
  handlers!.onMove({ height: 0 });
  expect(scrollTo).toHaveBeenLastCalledWith({}, 0, 500, false);
  // A Modal window attaching on Android replays a hide with the keyboard already down.
  scroll.value = 400;
  handlers!.onStart({ height: 0 });
  handlers!.onMove({ height: 0 });
  expect(scrollTo).toHaveBeenCalledTimes(1);
});

it("keeps the end-aligned spacer of a short list while the keyboard scrolls in", () => {
  const source = NodeFS.readFileSync(
    new URL("../apps/mobile/node_modules/@legendapp/list/react-native.mjs", import.meta.url),
    "utf8",
  );
  const fn = (name: string) => source.match(new RegExp(`^function ${name}\\(.*?^\\}$`, "ms"))![0];
  const spacer = NodeVM.runInNewContext(
    `${[
      "peek\\$",
      "getHorizontalInsetEnd",
      "getContentInsetEndAdjustmentEnd",
      "getContentInsetEnd",
      "getContentInsetStartAdjustment",
      "getRawContentLength",
      "getAlignItemsAtEndPadding",
    ]
      .map(fn)
      .join("\n")}\ngetAlignItemsAtEndPadding`,
  ) as (ctx: unknown) => number;
  const ctx = (contentInsetOverride: { bottom: number; keyboard?: number }) => ({
    values: new Map([["totalSize", 1000]]),
    state: {
      scrollLength: 2000,
      contentInsetOverride,
      props: { alignItemsAtEndPaddingEnabled: true, data: [{}], stylePaddingTop: 0 },
    },
  });
  expect(spacer(ctx({ bottom: 180 }))).toBe(820);
  expect(spacer(ctx({ bottom: 1080, keyboard: 900 }))).toBe(820);
});
