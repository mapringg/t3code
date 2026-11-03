const { withMainActivity } = require("expo/config-plugins");

// OEM skins such as ColorOS hold apps below the panel's top rate unless the window asks for a
// mode; T3 Code ran at 90 Hz on a 120 Hz phone while system apps got 120.
const PREFER_MODE_FUNCTION = `
  // Asks for the panel's fastest mode at the current resolution; added by
  // withAndroidHighRefreshRate.
  private fun preferHighestRefreshRate() {
    val display = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) display else @Suppress("DEPRECATION") windowManager.defaultDisplay
    val current = display?.mode ?: return
    val fastest = display.supportedModes
      .filter { it.physicalWidth == current.physicalWidth && it.physicalHeight == current.physicalHeight }
      .maxByOrNull { it.refreshRate } ?: return
    window.attributes = window.attributes.apply { preferredDisplayModeId = fastest.modeId }
  }
`;

function insertAfter(contents, anchor, insertion, description) {
  const index = contents.indexOf(anchor);
  if (index === -1) {
    throw new Error(
      `withAndroidHighRefreshRate: could not find ${description} in MainActivity — the Expo template changed; update the plugin anchors.`,
    );
  }
  const end = index + anchor.length;
  return contents.slice(0, end) + insertion + contents.slice(end);
}

function applyHighRefreshRate(contents) {
  if (contents.includes("preferHighestRefreshRate")) return contents;
  if (!contents.includes("import android.os.Build\n")) {
    contents = insertAfter(
      contents,
      "import android.os.Bundle",
      "\nimport android.os.Build",
      "the android.os.Bundle import",
    );
  }
  contents = insertAfter(
    contents,
    "class MainActivity : ReactActivity() {",
    PREFER_MODE_FUNCTION,
    "the MainActivity class declaration",
  );
  return insertAfter(
    contents,
    "super.onCreate(null)",
    "\n    preferHighestRefreshRate()",
    "the super.onCreate call",
  );
}

module.exports = function withAndroidHighRefreshRate(config) {
  return withMainActivity(config, (nextConfig) => {
    if (nextConfig.modResults.language !== "kt") {
      throw new Error("withAndroidHighRefreshRate: MainActivity must be Kotlin.");
    }
    nextConfig.modResults.contents = applyHighRefreshRate(nextConfig.modResults.contents);
    return nextConfig;
  });
};
