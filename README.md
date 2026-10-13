## Innerly
An open source multimedia journal with a Go/Wails desktop app and a retained Python self-hosted version. Features include secured notes, autosaving while typing, HTTPS link saving with automatic thumbnail downloads, and image uploads. A screenshot of the main journal page layout is shown below.

![Example innerly homepage showing entries in chronological order](/innerly-example.png)

![Innerly writing page](/innerly-write.png)

### Desktop (macOS)

Requires Go, Node/npm, and Xcode Command Line Tools. Project tooling pins Go 1.24.13 and Wails 2.11.0; the helper keeps downloaded tools, caches, and development data inside `.work/`.

```bash
./scripts/desktop.sh setup
./scripts/desktop.sh dev
```

Development uses a disposable journal at `.work/dev-journal`, not your existing journal. Create a local account on first launch. Desktop login is in-memory; restarting requires login again. The existing email/password and encrypted entry formats are retained.

```bash
./scripts/desktop.sh test    # Go, frontend adapter, and Python reference tests
./scripts/desktop.sh race    # Slower Go race checks (real password hashing)
./scripts/desktop.sh build   # build/bin/Innerly.app
```

The Python reference tests require `backend/.venv` with dependencies from `backend/uv.lock`. If needed, create it with `cd backend && UV_CACHE_DIR=../.work/uv-cache uv sync --frozen`.

A packaged app normally opens `~/.innerly`. **Back up your journal and test on a copy first**, with both the Python and desktop apps closed while copying:

```bash
INNERLY_DATA_DIR="$PWD/.work/journal-copy" build/bin/Innerly.app/Contents/MacOS/Innerly
```

Settings includes **Exit fullscreen** and **Open another window**. Each desktop window runs an independent session; different accounts can use the same data directory concurrently. Database migrations are embedded SQL files tracked with SQLite `user_version`; unversioned journals are adopted without replacing their data.

UI regression tests run the actual React screens in WebKit and Chromium against synthetic Wails responses:

```bash
cd frontend
PLAYWRIGHT_BROWSERS_PATH="$PWD/../.work/playwright" npx playwright install webkit chromium
npm run test:ui
```

The desktop app does not require Python, Docker, or a local API server. Imports still read ZIP files from the selected data directory's `imports/` folder. Do not run both versions against the same database simultaneously.

See [implementation and validation notes](docs/wails-implementation.md) and the [migration plan](docs/wails-migration-plan.md). For code review, open the nine-page [Python → Go architecture diagram](docs/architecture.drawio) in draw.io, with its [reading guide and file map](docs/architecture-review.md).

### Self-hosted quickstart
Requires docker-compose. First run the setup script, then docker-compose:
```
./setup.sh
docker-compose up --build
```
Then open http://localhost:8000. A single container builds the frontend and serves
it alongside the API, so there is no separate frontend service or port.

### Development
The image has to be rebuilt to pick up frontend changes, so for iterative work run
the Vite dev server against the container instead. It proxies `/api` to the backend,
keeping requests same-origin:
```
docker-compose up            # API + built frontend on :8000
cd frontend && npm install && npm run start   # dev server with hot reload on :3000
```
Set `VITE_API_TARGET` if the backend is not on `http://localhost:8000`.

