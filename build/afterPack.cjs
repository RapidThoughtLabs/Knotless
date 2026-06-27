// electron-builder afterPack hook
//
// We do not have an Apple Developer ID certificate, so electron-builder skips
// macOS code signing entirely. That leaves the x64 build fully unsigned and the
// arm64 build with a broken linker ad-hoc signature ("code has no resources but
// signature indicates they must be present"). A broken/missing signature is what
// produces the dreaded, NON-bypassable "Knotless is damaged and can't be opened"
// Gatekeeper dialog — and on Apple Silicon an unsigned/broken binary won't launch
// at all, even after quarantine is removed.
//
// This hook applies a clean ad-hoc signature to the packed .app before the DMG is
// built. That downgrades the Gatekeeper prompt to the milder, bypassable
// "unidentified developer" case and lets the app actually run once the user strips
// the download quarantine (see README → "Opening Knotless on macOS").
//
// This is NOT a substitute for real Developer ID signing + notarization. It is the
// best we can do for free. Replace with proper signing/notarization when an Apple
// Developer account is available.

const { execFileSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function afterPack(context) {
  const { electronPlatformName, appOutDir, packager } = context;

  // Only macOS builds need ad-hoc signing.
  if (electronPlatformName !== "darwin") {
    return;
  }

  const appName = `${packager.appInfo.productFilename}.app`;
  const appPath = path.join(appOutDir, appName);

  console.log(`[afterPack] ad-hoc signing ${appPath}`);

  try {
    // --force overrides the broken linker signature; --deep signs nested
    // frameworks and helper apps; "-" is the ad-hoc identity. No hardened
    // runtime / entitlements: ad-hoc + hardened runtime breaks Electron's JIT.
    execFileSync(
      "codesign",
      ["--deep", "--force", "--sign", "-", appPath],
      { stdio: "inherit" }
    );
    console.log("[afterPack] ad-hoc signing complete");
  } catch (err) {
    console.error("[afterPack] ad-hoc signing failed:", err.message);
    throw err;
  }
};
