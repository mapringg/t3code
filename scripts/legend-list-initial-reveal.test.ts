// @effect-diagnostics nodeBuiltinImport:off - reads the installed native JS bundle for synchronous VM tests.
import * as NodeFS from "node:fs";
import * as NodeVM from "node:vm";
import { describe, expect, it, vi } from "vite-plus/test";

function createList(bundle: string, platform: "android" | "ios" = "android") {
  const source = NodeFS.readFileSync(
    new URL(`../apps/mobile/node_modules/@legendapp/list/${bundle}`, import.meta.url),
    "utf8",
  );
  const renderState = source.slice(
    source.indexOf("function setInitialRenderState("),
    source.indexOf("// src/core/finishInitialScroll.ts"),
  );
  const watchdog = source.slice(
    source.indexOf("var INSET_END_SETTLE_WATCHDOG_FRAMES"),
    source.indexOf("function dispatchInitialScroll("),
  );
  const finish = source.slice(
    source.indexOf("// src/core/finishInitialScroll.ts"),
    source.indexOf("// src/core/calculateOffsetForIndex.ts"),
  );
  const drawDistance = source.slice(
    source.indexOf("function getEffectiveDrawDistance("),
    source.indexOf("\n}\n", source.indexOf("function getEffectiveDrawDistance(")) + 3,
  );
  const frames: Array<() => void> = [];
  const values = new Map<string, unknown>();
  const scrollTo = vi.fn();
  const onLoad = vi.fn();
  const state = {
    scheduledWork: { cancel: vi.fn() },
    props: { data: ["message"], onLoad, drawDistance: 500 },
    initialScroll: { index: 0, viewPosition: 1 },
    loadStartTime: 0,
    didContainersLayout: true,
    didFinishInitialScroll: true,
    didLoad: false,
    didUserDrag: false,
    scrollLength: 800,
    scroll: 400,
    lastNativeScroll: 200 as number | undefined,
    scrollingTo: undefined as { offset: number } | undefined,
    maintainingScrollAtEnd: false,
    refScroller: { current: { scrollTo } },
  };
  const ctx = { state };
  let contentSize = 1200;
  let inset = 100;
  const api = NodeVM.runInNewContext(
    `${renderState}\n${watchdog}\n${finish}\n${drawDistance}\n({ start: startInsetEndSettleWatchdog, complete: setInitialRenderState, finish: finishInitialScroll, drawDistance: getEffectiveDrawDistance })`,
    {
      Platform: { OS: platform },
      initialScrollWatchdog: { clear: vi.fn() },
      setInitialScrollSession: vi.fn(),
      requestAnimationFrame: (callback: () => void) => frames.push(callback),
      getContentSize: () => contentSize,
      getContentInsetStartAdjustment: () => inset,
      peek$: (_ctx: unknown, key: string) => values.get(key),
      set$: (_ctx: unknown, key: string, value: unknown) => values.set(key, value),
      setAdaptiveRender: vi.fn(),
      scheduleFullDrawDistancePrewarm: vi.fn(),
      INITIAL_DRAW_DISTANCE: 250,
    },
  ) as {
    start: (context: typeof ctx) => void;
    finish: (context: typeof ctx) => void;
    drawDistance: (context: typeof ctx) => number;
    complete: (context: typeof ctx, flags: Record<string, boolean>) => void;
  };
  return {
    state,
    scrollTo,
    onLoad,
    start: () => api.start(ctx),
    finish: () => api.finish(ctx),
    drawDistance: () => api.drawDistance(ctx),
    complete: () => api.complete(ctx, {}),
    layout: () => api.complete(ctx, { didLayout: true }),
    ready: () => values.get("readyToRender") === true,
    resize: (size: number) => {
      contentSize = size;
    },
    setInset: (value: number) => {
      inset = value;
    },
    advance(count: number) {
      for (let index = 0; index < count; index++) {
        const batch = frames.splice(0);
        for (const frame of batch) frame();
      }
    },
  };
}

describe.each(["react-native.js", "react-native.mjs"])(
  "initial inset end reveal (%s)",
  (bundle) => {
    it.each([
      { platform: "android", inset: 0, layoutFirst: true },
      { platform: "ios", inset: 100, layoutFirst: true },
      { platform: "android", inset: 0, layoutFirst: false },
      { platform: "ios", inset: 100, layoutFirst: false },
    ] as const)(
      "waits for the native offset ($platform, layout first: $layoutFirst)",
      ({ platform, inset, layoutFirst }) => {
        const list = createList(bundle, platform);
        list.setInset(inset);
        list.state.didContainersLayout = layoutFirst;
        list.finish();
        list.layout();
        list.advance(8);
        expect(list.ready()).toBe(false);
        // Rows the reveal would add must mount and measure while hidden.
        expect(list.drawDistance()).toBe(500);
        expect(list.scrollTo).toHaveBeenCalledWith({ animated: false, x: 0, y: 400 });
        list.state.lastNativeScroll = 400;
        // Android reveals one stable frame per settle phase; iOS keeps three.
        list.advance(3);
        expect(list.ready()).toBe(platform === "android");
        list.advance(4);
        expect(list.ready()).toBe(true);
        expect(list.onLoad).toHaveBeenCalledTimes(1);
      },
    );

    it("does not count an in-flight scroll as stability", () => {
      const list = createList(bundle);
      list.state.lastNativeScroll = 400;
      list.state.scrollingTo = { offset: 400 };
      list.start();
      list.advance(8);
      expect(list.ready()).toBe(false);
      list.state.scrollingTo = undefined;
      list.state.maintainingScrollAtEnd = true;
      list.advance(8);
      expect(list.ready()).toBe(false);
      list.state.maintainingScrollAtEnd = false;
      list.advance(7);
      expect(list.ready()).toBe(true);
    });

    it("waits for a stable end target even when native scrolling follows each measurement", () => {
      const list = createList(bundle);
      list.start();
      for (let index = 0; index < 10; index++) {
        list.resize(1200 + index * 10);
        list.state.lastNativeScroll = 400 + index * 10;
        list.advance(1);
      }
      expect(list.ready()).toBe(false);
      list.advance(7);
      expect(list.ready()).toBe(true);
    });

    it("keeps the reveal bounded when native events never arrive", () => {
      const list = createList(bundle);
      list.state.lastNativeScroll = undefined;
      list.start();
      list.advance(8);
      expect(list.ready()).toBe(false);
      expect(list.scrollTo).not.toHaveBeenCalled();
      list.advance(32);
      expect(list.ready()).toBe(true);
    });

    it("releases control on drag and never starts another initial hold", () => {
      const list = createList(bundle);
      list.start();
      list.state.didUserDrag = true;
      list.advance(1);
      expect(list.ready()).toBe(true);
      expect(list.scrollTo).not.toHaveBeenCalled();
      list.complete();
      list.start();
      list.advance(20);
      expect(list.state.didUserDrag).toBe(true);
      expect(list.scrollTo).not.toHaveBeenCalled();
      expect(list.onLoad).toHaveBeenCalledTimes(1);
    });
  },
);
