import { DEFAULT_SERVER_SETTINGS, type ServerSettingsPatch } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { Children, mocks } = vi.hoisted(() => ({
  Children: ({ children }: { children?: ReactNode }) => children,
  mocks: {
    branchNaming: { onChange: (_patch: ServerSettingsPatch) => {} },
    updateSettings: vi.fn(),
    alert: vi.fn(),
    targets: [] as ReturnType<typeof environment>[],
    readOnly: new Set<string>(),
    projectSelected: false,
    targetListeners: new Set<() => void>(),
  },
}));

vi.mock("react-native", () => ({
  View: Children,
  Alert: { alert: mocks.alert },
  Pressable: ({
    children,
    disabled,
    onPress,
    accessibilityLabel,
  }: {
    children?: ReactNode;
    disabled?: boolean;
    onPress: () => void;
    accessibilityLabel?: string;
  }) => (
    <button disabled={disabled} onClick={onPress} aria-label={accessibilityLabel}>
      {children}
    </button>
  ),
}));
vi.mock("@effect/atom-react", () => ({
  useAtomValue: () => AsyncResult.success({}),
  useAtomSet: () => () => {},
}));
vi.mock("../../state/preferences", () => ({
  mobilePreferencesAtom: {},
  updateMobilePreferencesAtom: {},
}));
vi.mock("./components/AutoSettleDaysField", () => ({ AutoSettleDaysField: () => null }));
vi.mock("./components/SourceControlSignInSection", () => ({
  SourceControlSignInSection: () => null,
}));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock("@react-navigation/native", () => ({ useNavigation: () => ({}) }));
vi.mock("../../state/session", () => ({
  readEnvironmentScope: () => true,
  useEnvironmentsWithScope: () =>
    new Set(
      mocks.targets
        .map((target) => target.environmentId)
        .filter((environmentId) => !mocks.readOnly.has(environmentId)),
    ),
}));
vi.mock("../../state/server", () => ({ serverEnvironment: { updateSettings: {} } }));
vi.mock("../../state/environments", () => ({ useEnvironments: () => ({ environments: [] }) }));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: () => mocks.updateSettings,
}));
vi.mock("../threads/thread-settings-options", () => ({
  RUNTIME_MODE_CHOICES: [],
  withManagedRuntimeModeLimits: (choices: readonly unknown[]) => choices,
}));
vi.mock("../../components/ui/ScreenScrollView", () => ({ ScreenScrollView: Children }));
vi.mock("../../components/ui/AppText", () => ({ AppText: Children }));
vi.mock("../../components/ui/Button", () => ({
  Button: ({
    label,
    disabled,
    onPress,
  }: {
    label: string;
    disabled?: boolean;
    onPress: () => void;
  }) => (
    <button disabled={disabled} onClick={onPress}>
      {label}
    </button>
  ),
}));
vi.mock("./components/SettingsScreen", () => ({ SettingsScreen: Children }));
vi.mock("./components/SettingsEnvironmentFilterHeader", () => ({
  useAndroidSettingsEnvironmentFilter: () => undefined,
  SettingsEnvironmentFilterHeader: () => null,
}));
vi.mock("./components/DatabaseStorageNotice", () => ({ DatabaseStorageNotice: () => null }));
vi.mock("./components/SettingsSection", () => ({ SettingsSection: Children }));
vi.mock("../../components/ui/ListChoiceRow", () => ({ ListChoiceRow: () => null }));
vi.mock("./components/SettingsSwitchRow", () => ({
  SettingsSwitchRow: ({
    label,
    value,
    disabled,
    onValueChange,
  }: {
    label: string;
    value: boolean | null;
    disabled?: boolean;
    onValueChange: (value: boolean) => void;
  }) => (
    <button
      role="switch"
      aria-checked={value ?? "mixed"}
      disabled={disabled}
      onClick={() => onValueChange(!value)}
    >
      {label}
    </button>
  ),
}));
vi.mock("./components/SettingsRow", () => ({ SettingsRow: () => null }));
vi.mock("./components/BranchNamingSettings", () => ({
  BranchNamingSettings: (props: { onChange: (patch: ServerSettingsPatch) => void }) => {
    mocks.branchNaming.onChange = props.onChange;
    return null;
  },
}));
vi.mock("./settings-environment-filter", async () => {
  const { useSyncExternalStore } = await import("react");
  const subscribe = (listener: () => void) => {
    mocks.targetListeners.add(listener);
    return () => mocks.targetListeners.delete(listener);
  };
  return {
    useSettingsEnvironmentFilter: () => {
      const targets = useSyncExternalStore(subscribe, () => mocks.targets);
      return {
        selectedTargets: targets,
        projectGroups: [
          {
            key: "project",
            label: "Project",
            members: targets.map((target) => ({
              project: { environmentId: target.environmentId, id: "project" },
            })),
          },
        ],
        selectedProjectKey: mocks.projectSelected ? "project" : null,
      };
    },
  };
});

import {
  SettingsThreadsRouteScreen,
  SettingsWorktreesRouteScreen,
} from "./SettingsServerControlsRouteScreen";

function environment(environmentId: string, label: string) {
  return {
    environmentId,
    label,
    connection: { phase: "connected" },
    serverConfig: {
      settings: {
        ...DEFAULT_SERVER_SETTINGS,
        defaultAutoPull: false,
        sidebarAutoSettleOnMerge: false,
      },
      environment: {
        capabilities: { projectSettingsOverrides: true, threadAutoSettlement: true },
      },
    },
  };
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  root = createRoot(container);
  mocks.targets = [environment("local", "Local")];
  mocks.projectSelected = false;
  mocks.readOnly = new Set();
  mocks.alert.mockReset();
  mocks.updateSettings.mockReset();
  mocks.updateSettings.mockResolvedValue(AsyncResult.success(undefined));
});

afterEach(() => {
  act(() => root.unmount());
});

describe("SettingsServerControlsRouteScreen", () => {
  it("sends a draft saved during a pending write once that write settles", async () => {
    const pending = Promise.withResolvers<AsyncResult.Success<void>>();
    mocks.updateSettings.mockReturnValueOnce(pending.promise);
    act(() => root.render(<SettingsWorktreesRouteScreen />));

    act(() => mocks.branchNaming.onChange({ branchNamingMode: "custom" }));
    act(() => mocks.branchNaming.onChange({ branchNameInstructions: "Use issue IDs." }));
    expect(mocks.updateSettings).toHaveBeenCalledOnce();

    await act(async () => pending.resolve(AsyncResult.success(undefined)));

    expect(mocks.updateSettings).toHaveBeenCalledTimes(2);
    expect(mocks.updateSettings).toHaveBeenLastCalledWith({
      environmentId: "local",
      input: {
        patch: { branchNamingMode: "custom", branchNameInstructions: "Use issue IDs." },
      },
    });
  });

  it("holds auto-settle changes until a pending project override write settles", async () => {
    mocks.projectSelected = true;
    const pending = Promise.withResolvers<AsyncResult.Success<void>>();
    mocks.updateSettings.mockReturnValueOnce(pending.promise);
    act(() => root.render(<SettingsThreadsRouteScreen />));
    const toggle = (label: string) =>
      [...container.querySelectorAll<HTMLButtonElement>('[role="switch"]')].find(
        (button) => button.textContent === label,
      )!;

    act(() => toggle("Agent browser access").click());
    act(() => toggle("Auto-settle merged threads").click());

    // Both rewrite the whole project override, so a second write planned now would drop the first.
    expect(mocks.updateSettings).toHaveBeenCalledOnce();
    await act(async () => pending.resolve(AsyncResult.success(undefined)));
  });

  it("shows a toggled value without locking the page until the server reflects it", async () => {
    const pending = Promise.withResolvers<AsyncResult.Success<void>>();
    mocks.updateSettings.mockReturnValueOnce(pending.promise);
    act(() => root.render(<SettingsThreadsRouteScreen />));
    const push = (targets: typeof mocks.targets) => {
      mocks.targets = targets;
      act(() => mocks.targetListeners.forEach((listener) => listener()));
    };
    const toggle = (label: string) =>
      [...container.querySelectorAll<HTMLButtonElement>('[role="switch"]')].find(
        (button) => button.textContent === label,
      )!;
    const before = DEFAULT_SERVER_SETTINGS.autoResumeLimitedThreads;

    act(() => toggle("Resume after usage limits").click());
    expect(toggle("Resume after usage limits").getAttribute("aria-checked")).toBe(String(!before));
    expect(toggle("Agent browser access").disabled).toBe(false);

    // The RPC can settle before the environment's config push arrives.
    await act(async () => pending.resolve(AsyncResult.success(undefined)));
    expect(toggle("Resume after usage limits").getAttribute("aria-checked")).toBe(String(!before));

    const pushed = environment("local", "Local");
    pushed.serverConfig.settings = { ...pushed.serverConfig.settings };
    pushed.serverConfig.settings.autoResumeLimitedThreads = !before;
    push([pushed]);
    // Once reflected, later changes from elsewhere show through again.
    push([environment("local", "Local")]);
    expect(toggle("Resume after usage limits").getAttribute("aria-checked")).toBe(String(before));
  });

  it("disables auto-settle when a selected environment cannot save settings", () => {
    const remote = environment("remote", "Remote");
    // Auto-settle rows skip a server without auto-settlement, but the page still saves to it.
    remote.serverConfig.environment.capabilities.threadAutoSettlement = false;
    mocks.targets = [environment("local", "Local"), remote];
    mocks.readOnly = new Set(["remote"]);
    act(() => root.render(<SettingsThreadsRouteScreen />));

    const autoSettle = [...container.querySelectorAll<HTMLButtonElement>('[role="switch"]')].find(
      (button) => button.textContent === "Auto-settle merged threads",
    )!;
    expect(autoSettle.disabled).toBe(true);
  });
});
