import { View } from "react-native";

import { ListChoiceRow } from "../../../../components/ui/ListChoiceRow";
import { ListRow } from "../../../../components/ui/ListRow";
import { AndroidAnchoredMenu } from "../../../../components/ui/AndroidAnchoredMenu";
import { MOBILE_THEME_OPTIONS, type MobileThemeMode } from "../../../../lib/mobileTheme";
import { SettingsSection } from "../../components/SettingsSection";
import { useAppearancePreferences } from "../AppearancePreferencesProvider";

const APPEARANCE_MODES: ReadonlyArray<{ readonly id: MobileThemeMode; readonly label: string }> = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

export function ThemeAppearanceSection() {
  const {
    isReady,
    setThemeIdForAppearance,
    setThemeMode,
    themeIds,
    themeMode,
    systemColorsAvailable,
  } = useAppearancePreferences();
  const themes = MOBILE_THEME_OPTIONS.filter(
    (theme) => theme.id !== "material-you" || systemColorsAvailable,
  );

  return (
    <View className="gap-6">
      <View accessibilityRole="radiogroup" accessibilityLabel="Color scheme">
        <SettingsSection title="Color scheme">
          {APPEARANCE_MODES.map((mode) => (
            <ListChoiceRow
              disabled={!isReady}
              key={mode.id}
              label={mode.label}
              onPress={() => setThemeMode(mode.id)}
              selected={mode.id === themeMode}
            />
          ))}
        </SettingsSection>
      </View>
      <SettingsSection title="Themes">
        {(["light", "dark"] as const).map((appearance) => {
          const title = appearance === "light" ? "Light theme" : "Dark theme";
          return (
            <AndroidAnchoredMenu
              key={appearance}
              title={title}
              actions={themes.map((theme) => ({
                id: theme.id,
                title: theme.label,
                state: theme.id === themeIds[appearance] ? "on" : "off",
              }))}
              onPressAction={({ nativeEvent }) => {
                const theme = themes.find((option) => option.id === nativeEvent.event);
                if (theme) setThemeIdForAppearance(appearance, theme.id);
              }}
            >
              {(open) => (
                <ListRow
                  label={title}
                  detail={themes.find((theme) => theme.id === themeIds[appearance])?.label}
                  disabled={!isReady}
                  onPress={open}
                />
              )}
            </AndroidAnchoredMenu>
          );
        })}
      </SettingsSection>
    </View>
  );
}
