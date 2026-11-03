import { View } from "react-native";

import { AppText, AppTextInput, type AppTextInputProps } from "../../components/ui/AppText";
import { cn } from "../../lib/cn";

type ConnectionFormFieldProps = Omit<AppTextInputProps, "accessibilityLabel" | "className"> & {
  readonly label: string;
  readonly className?: string;
};

export function ConnectionFormField({ label, className, ...inputProps }: ConnectionFormFieldProps) {
  return (
    <View collapsable={false} className={cn("gap-1.5", className)}>
      <AppText
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="text-2xs font-t3-bold tracking-[0.8px] uppercase android:text-[13px] android:font-t3-medium android:tracking-normal android:normal-case text-foreground-muted"
      >
        {label}
      </AppText>
      <AppTextInput
        {...inputProps}
        accessibilityLabel={label}
        className={cn(
          "rounded-[14px] android:rounded-xl px-4 py-3.5",
          inputProps.keyboardType === "url" && "android:font-mono",
        )}
      />
    </View>
  );
}
