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

Builds use the v3 `Taskfile.yml` and `build/config.yml`, not `wails.json`. `build/darwin/Info*.plist` are concrete v3 bundle assets (minimum macOS 12). `scripts/desktop.sh` isolates HOME, Go/npm caches and temporary files under `.work/`; release signing still runs outside that HOME. The development data path is an environment setting, never embedded in the binary.

Bindings are generated (not committed) into `frontend/bindings/` before desktop frontend compilation. On a clean checkout, run `setup`, then `build` or `dev`; for frontend-only work run `./scripts/desktop.sh bindings` before `npm --prefix frontend run build`. Browser UI tests use a test-only adapter and do not call native IPC.

Phase 1 and the phase 2 adapter work in [the v3 migration plan](WAILS_V3_MIGRATION_PLAN.md) are implemented, not the updater release. Phase 2's native navigation-policy requirement remains unresolved: beta.33 has no supported macOS navigation-policy hook; no framework patch or custom native delegate is included. In-app installation and release CI hardening remain unfinished. The release script produces a signed/notarized DMG and verifiable updater ZIP; real-credential and clean-machine acceptance are still required. Native title-bar dragging and complete dev/packaged workflows still need an interactive macOS smoke test; browser tests cannot certify them.

**Display preferences:** the macOS asset origin changes from `wails://wails/` (v2) to `wails://localhost/` (v3). Theme/typewriter preferences must be set again once; no old storage is deleted or migrated. Their existing localStorage keys persist within v3 at the same origin. Development (`wails://localhost:3000/`) and packaged apps have separate display preferences. Journal data and account settings are unaffected.

## About & Updates

Open **Updates** from the account menu or **About & Updates** from the macOS app menu. It uses the shared navbar, works before login, and fetches `master/CHANGELOG.md` directly as plain text (which may include unreleased changes). **Check for Updates** uses Wails' built-in GitHub provider to check the latest published stable release for a macOS universal ZIP. No custom release list, Markdown parser or updater UI is used. Download/install/restart are not enabled yet; signed packaging and restart safety must be completed first.

## Version

The highest `## vX.Y.Z` heading in `CHANGELOG.md` is authoritative (numeric version ordering, not heading order). `./scripts/release-version.sh --version` prints it without network access. Desktop builds inject it into `journal.App.Version()` and both macOS bundle version fields; release tags, notes and artifact names use the same value. Plain `go build` without the desktop build script reports `development`. No separate version file, metadata service or build ID is used.

## Signed macOS releases

Run `./scripts/desktop.sh setup` first. Once, create a **persistent** updater signing keypair outside the repository, then back it up securely:

```bash
.work/gopath/bin/wails3 updater genkey -out "$HOME/.config/innerly/updater.key"
```

This key is separate from Apple's Developer ID certificate. Never regenerate it for each release or commit its private half. The public half (`updater.key.pub`) must eventually be pinned in the application before in-app installation is enabled; it is not pinned yet. Keys are never generated automatically by the release script.

```bash
./scripts/release-macos.sh \
  --identity "Developer ID Application: Name (TEAMID)" \
  --keychain-profile PROFILE \
  --update-key "$HOME/.config/innerly/updater.key" \
  --update-public-key "$HOME/.config/innerly/updater.key.pub"
```

The default is universal (Apple Silicon + Intel). `--help` lists API-key and keychain alternatives. The script signs, notarizes, staples and verifies the app, then creates a public DMG with Wails' packaging tool and separately signs/notarizes/staples/verifies that DMG. `release/` receives versioned DMG/ZIP files and their SHA-256 checksums only after all verification succeeds. Both contain the same stapled app; the updater payload is the ZIP, **not** the DMG. `manifest.json` contains the ZIP's size, SHA-512 digest, Ed25519ph signature, versioned GitHub URL and changelog notes, produced and verified by Wails' CLI. A checksum alone is not update authentication.

Release Actions additionally require `INNERLY_UPDATE_PRIVATE_KEY` and `INNERLY_UPDATE_PUBLIC_KEY` secrets containing the generated PEM files. The workflow removes its temporary copies even on failure and publishes the manifest alongside both artifacts. The application's current update check does not consume this manifest or install anything yet. No signed release, Apple submission or repository-secret change is performed by local tests.

On failure, inspect `release/*-notary.json` and any `.log.json` diagnostics. Only retry an unpublished/draft release after resolving the failure; the version gate skips already-published tags. Never replace a published version's signed artifacts—ship a new changelog version instead. Full publication/concurrency hardening remains phase 6 work.

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
