import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export function useScreenReaderEnabled() {
  const [enabled, setEnabled] = useState(false);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- subscribes to the platform screen reader setting
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isScreenReaderEnabled().then((value) => {
      if (active) setEnabled(value);
    });
    const subscription = AccessibilityInfo.addEventListener("screenReaderChanged", setEnabled);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return enabled;
}
