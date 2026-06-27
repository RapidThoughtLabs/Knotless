# Changelog

All notable changes to Knotless are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-06-27

### Fixed
- **macOS install failure ("Knotless is damaged and can't be opened").** Builds
  were unsigned and un-notarized: the x64 app was not signed at all and the arm64
  app carried a broken linker ad-hoc signature, which Gatekeeper rejected. An
  `afterPack` hook now applies a clean ad-hoc signature to both architectures so
  the app launches once the download quarantine is cleared.
- macOS release builds no longer attempt (and noisily fail) Apple signing
  auto-discovery in CI when no Developer ID certificate is present.

### Added
- README "Opening Knotless on macOS" section with the one-time
  `xattr -cr /Applications/Knotless.app` unlock step and Intel vs Apple Silicon
  download guidance.
- This changelog.

### Notes
- Knotless is still not Apple-notarized (that requires a paid Apple Developer
  account). Users will see a one-time "unidentified developer" warning that the
  `xattr -cr` step clears. Full Developer ID signing + notarization is planned.

## [0.1.0] - 2026-03-19

### Added
- Initial release: table-based notes, sheets, full-text search, `.ktl`/CSV/JSON
  import & export, theming, and native frameless windows on macOS and Windows.
- GitHub Actions release workflow for Windows, macOS, and Linux.

[0.1.1]: https://github.com/RapidThoughtLabs/Knotless/releases/tag/v0.1.1
[0.1.0]: https://github.com/RapidThoughtLabs/Knotless/releases/tag/v0.1.0
