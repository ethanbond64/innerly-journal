# Innerly

A local multimedia journal built with Go, Wails, and React. Includes encrypted notes, autosave, images, HTTPS link previews, search, and day tags.

## Build and run on macOS

Install **Go**, **Node.js 20+ with npm**, and **Xcode Command Line Tools** (`xcode-select --install`). The setup script installs Wails 2.11.0 and uses Go 1.24.13.

```bash
./scripts/desktop.sh setup
./scripts/desktop.sh dev       # Run with live reload
```

Development data and tool caches stay under `.work/`. Create a local account on first launch.

To build and run the standalone app:

```bash
./scripts/desktop.sh build
open build/bin/Innerly.app
```

## Journal data

- Development: `.work/dev-journal`
- Standalone app: `~/.innerly`
- Override either with `INNERLY_DATA_DIR`.

Back up an existing journal and test a copy before upgrading:

```bash
INNERLY_DATA_DIR="$PWD/.work/journal-copy" build/bin/Innerly.app/Contents/MacOS/Innerly
```

Close applications using the journal before copying its data. Existing journal databases and encrypted entries remain supported; schema upgrades run automatically. Place legacy ZIP imports in the selected data directory's `imports/` folder.

Login is local and held in memory. Settings includes **Exit fullscreen** and **Open another window**; each window logs in independently.

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
