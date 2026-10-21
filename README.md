# Innerly

A local multimedia journal built with Go, Wails, and React. Includes encrypted notes, autosave, images, HTTPS link previews, search, and day tags.

## Build and run on macOS

Install **Go with toolchain auto-download support**, **Node.js 22 with npm**, and **Xcode Command Line Tools** (`xcode-select --install`). `go.mod` pins Go **1.26.9** and Wails **v3.0.0-beta.33**. Setup installs `wails3` at that exact module version; the frontend lockfile pins `@wailsio/runtime` **3.0.0-beta.33**.

```bash
./scripts/desktop.sh setup
./scripts/desktop.sh dev       # Run with live reload
```

Development data and tool caches stay under `.work/`. Create a local account on first launch.

To build and run the standalone app:

```bash
./scripts/desktop.sh build                  # Universal arm64 + x86_64, ad-hoc signed
# ./scripts/desktop.sh build ARCH=arm64      # Faster native-only build on Apple Silicon
open build/bin/Innerly.app
```

Builds use `Taskfile.yml` and `build/config.yml`; `build/darwin/Info*.plist` are the bundle's plists (minimum macOS 12). Bindings are generated into `frontend/bindings/` and not committed, so run `setup` before the first `build` or `dev`; for frontend-only work, run `./scripts/desktop.sh bindings` before `npm --prefix frontend run build`.

**Display preferences:** the macOS asset origin changed from `wails://wails/` to `wails://localhost/`, so theme and typewriter preferences must be set once more. Nothing is deleted or migrated, and journal data and account settings are unaffected. Development and packaged apps keep separate display preferences.

## About & Updates

Open **Updates** from the account menu or **About & Updates** from the macOS app menu. The page works before login and shows the installed version plus `master/CHANGELOG.md` as plain text, so it may list unreleased changes.

**Check for Updates** hands off to Wails' own update window, which reads `manifest.json` from the newest published release, compares its version with the installed one, and shows the release notes. Installing downloads the universal ZIP, authenticates it against the public key compiled into the app, and swaps the bundle when the user clicks **Restart & Apply**. No GitHub token and no custom update UI are shipped, and nothing is downloaded or installed without the user asking.

Before the window opens, Innerly refuses to update at all from a development build, a mounted DMG, a translocated app, an unwritable installation folder, or while a second Innerly instance is running. Writing is saved by the editor's ordinary three-second autosave, which keeps running while the update window downloads. Errors leave the running app and its journal usable.

## Version

The highest `## vX.Y.Z` heading in `CHANGELOG.md` is authoritative — compared numerically, not by heading order — and `./scripts/release-version.sh --version` prints it offline. Desktop builds inject it into `journal.App.Version()` and both macOS bundle version fields, and release tags, notes and artifact names use the same value. A plain `go build` reports `development`.

## Signed macOS releases

Run `./scripts/desktop.sh setup` first. Once, create a **persistent** updater signing keypair outside the repository, then back it up securely:

```bash
.work/gopath/bin/wails3 updater genkey -out "$HOME/.config/innerly/updater.key"
```

This key is separate from Apple's Developer ID certificate. Never commit its private half, and keep the same keypair for every release — installed apps pin the public half, so switching keys stops them verifying updates. The release script validates the keypair before contacting Apple and pins `updater.key.pub` into the compiled app.

```bash
./scripts/release-macos.sh \
  --identity "Developer ID Application: Name (TEAMID)" \
  --keychain-profile PROFILE \
  --update-key "$HOME/.config/innerly/updater.key" \
  --update-public-key "$HOME/.config/innerly/updater.key.pub"
```

The default is universal (Apple Silicon + Intel); `--help` lists the API-key and keychain alternatives. The script signs, notarizes, staples and verifies the app, then packages a DMG and signs, notarizes, staples and verifies that separately. Files appear in `release/` — versioned DMG and ZIP, their SHA-256 checksums, and `manifest.json` — only after every gate passes. Both archives hold the same stapled app, but the updater payload is the ZIP, **not** the DMG. `manifest.json` carries the ZIP's size, SHA-512 digest, Ed25519ph signature, versioned download URL and changelog notes; installed apps read it from `releases/latest/download/manifest.json`, and a checksum alone would not authenticate an update.

In Actions the same script runs as `./scripts/release-macos.sh --ci`, taking every credential from secrets — `MACOS_SIGNING_IDENTITY`, `MACOS_SIGNING_P12_BASE64`, `MACOS_SIGNING_P12_PASSWORD`, `APPLE_NOTARY_KEY_P8`, `APPLE_NOTARY_KEY_ID`, `APPLE_NOTARY_ISSUER_ID`, `INNERLY_UPDATE_PRIVATE_KEY` and `INNERLY_UPDATE_PUBLIC_KEY`. It materializes them into one private temporary directory with a throwaway keychain and removes both through an `EXIT` trap, so nothing survives a failure.

On failure, inspect `release/*-notary.json` and any `.log.json` diagnostics. The version gate skips already-published tags, so never replace a published version's signed artifacts — ship a new changelog version instead.

## Journal data

- Development: `.work/dev-journal`
- Standalone app: `~/.innerly`
- Override either with `INNERLY_DATA_DIR`.

Back up an existing journal and test a copy before upgrading:

```bash
INNERLY_DATA_DIR="$PWD/.work/journal-copy" build/bin/Innerly.app/Contents/MacOS/Innerly
```

Close applications using the journal before copying its data. Existing journal databases and encrypted entries remain supported; schema upgrades run automatically. Place legacy ZIP imports in the selected data directory's `imports/` folder.

Login is local and held in memory. The retained `OpenWindow` service starts a separate process with an independent login; Settings no longer exposes desktop-window controls. Closing the last window quits the process and closes its journal workers/database.

## Tests

```bash
./scripts/desktop.sh test      # Go behavior tests and frontend unit tests
./scripts/desktop.sh race      # Go race detector
```

For UI tests, install the test browsers once:

```bash
(cd frontend && PLAYWRIGHT_BROWSERS_PATH="$PWD/../.work/playwright" npx playwright install webkit chromium)
./scripts/desktop.sh test-ui
```

Tests use synthetic data and disposable databases, not your journal. The frontend runs inside Wails; there is no separate HTTP API server.
