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

Open **Updates** from the account menu or **About & Updates** from the macOS app menu. The page works before login and shows `master/CHANGELOG.md` as plain text, so it may list unreleased changes.

**Check for Updates** lists newer published stable releases, newest first, with their dates and notes. Drafts and prereleases are hidden, releases without a universal ZIP and `manifest.json` are marked unavailable, and successful checks are cached for a minute to stay inside GitHub's anonymous quota. No GitHub token or Markdown renderer is shipped.

Choose a version, click **Download** — progress and cancellation are available — then **Install and Restart** when ready. Wails authenticates the ZIP against the public key compiled into the app, extracts it, and swaps the bundle; the version you picked is the one installed, never a newer one published in the meantime. Innerly additionally checks that the staged bundle is `Innerly.app` with the expected bundle identifier and version, and refuses to install from a development build, a mounted DMG, a translocated app, or an unwritable folder. Restart waits for in-progress writing to reach the journal, including a draft whose editor route has already unmounted; a failed save blocks it, and so does another Innerly window still being open. Errors leave the running app and its journal usable.

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

The default is universal (Apple Silicon + Intel); `--help` lists the API-key and keychain alternatives. The script signs, notarizes, staples and verifies the app, then packages a DMG and signs, notarizes, staples and verifies that separately. Files appear in `release/` — versioned DMG and ZIP, their SHA-256 checksums, and `manifest.json` — only after every gate passes. Both archives hold the same stapled app, but the updater payload is the ZIP, **not** the DMG. `manifest.json` carries the ZIP's size, SHA-512 digest, Ed25519ph signature, versioned download URL and changelog notes; a checksum alone would not authenticate an update.

Release Actions also need `INNERLY_UPDATE_PRIVATE_KEY` and `INNERLY_UPDATE_PUBLIC_KEY` secrets holding those PEM files. The workflow deletes its temporary copies even on failure and publishes the manifest beside both artifacts.

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
