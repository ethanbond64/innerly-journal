# Wails implementation and validation

## Implemented structure

- `main.go`: embedded frontend, Wails window/lifecycle, binding `journal.App`, and the media handler.
- `internal/journal/`: Go backend with Python-corresponding filenames. `views.go` holds application operations; `models.go` uses SQLite directly; `security.go` handles compatible password hashes/Fernet and cached write keys; processing and imports retain recognizable filenames.
- `frontend/src/desktop.js`: small transport adapter over Wails' generated `window.go.journal.App` runtime bindings. It normalizes responses for the existing request helpers. Outside Wails it delegates to browser fetch, preserving the Python UI.
- `frontend/src/requests.js`: existing callbacks and lock-auth retry behavior remain. Logout cancels queued retries and clears the one-shot plaintext handoff.
- `scripts/desktop.sh`: repository-local tools/caches, pinned Go/Wails versions, tests, development, and packaged build.

The desktop app uses a selected in-memory account instead of bearer tokens. Account/password fields and owner IDs remain compatible with the Python database. A restart requires login. Frontend desktop account state stays in memory, rather than authorizing from local storage.

Dynamic media is served through Wails' asset handler, scoped to the authenticated account. No signed URL compatibility layer or separate API server is used. Stored `static/<filename>` paths are unchanged; responses map them to `/media/<filename>`. Responses are not cached, and traversal/symlink requests are rejected.

## Toolchain

The installed Go 1.27.1 caused Wails' binding generator to fail with `package "context" without types`. Go 1.24.13 with Wails 2.11.0 builds successfully. `scripts/desktop.sh` pins those versions and downloads them into `.work/`, without requiring a system-wide installation.

The Wails-generated JS files are ignored. The adapter calls the same runtime namespace those wrappers call, avoiding a generated-file dependency for the retained Flask/Vite build. Runtime bindings are still generated and verified by `wails build`.

## Tests

The Go suite consists of high-level application workflows with real temporary SQLite databases and real filesystem media. Tests call the bound application operations without starting a native window. HTTPS tests use local TLS servers with test-controlled resolution/dialing; production public-address policy, redirect handling, response limits, and certificate verification remain in the path.

Coverage includes:

- Local account creation/login, logout/restart, redaction, and user ownership.
- Entry CRUD/reopen, Unicode counts/previews, search/title/text/tag matching, deduplication and pagination.
- Settings, default locking, key expiry/reauthentication, private read/edit/unlock.
- Legacy Fernet v0/v1, fixed scrypt output, password hash compatibility, password strength, rekey selection, and transaction rollback.
- Day tags, activity, memories, legacy schema upgrade, and a Python-created database.
- Image validation/retrieval and account-scoped media access, including traversal/symlink rejection.
- HTTPS-only links, redirects, DNS rebinding, proxy isolation, TLS hostname/trust, response limits, and missing/unsafe previews.
- Legacy import/reimport, encrypted text, images, tags, per-row failures, wrong/missing passcodes, cancellation, and job isolation.
- Node tests for desktop adapter request/response shapes, private reads, lock-auth markers, external links, and browser fallback.

The original Python suite remains intact, with two new cross-language tests: the shared import archive and a Go-created encryption/hash fixture.

Run:

```bash
./scripts/desktop.sh test
./scripts/desktop.sh race
./scripts/desktop.sh build
```

`test` requires the existing `backend/.venv`; the desktop binary does not. Race checks are intentionally slower because real password hashing is not mocked or weakened.

## Synthetic compatibility fixtures

- `backend/tests/fixtures/encryption.json`: original Python-generated password hash, v0/v1 ciphertext, and derived key.
- `internal/journal/testdata/python-journal.db`: SQLite database created through Flask/SQLAlchemy, containing two accounts, an encrypted Unicode entry, entry/day tags, and unknown JSON metadata.
- `internal/journal/testdata/legacy.zip`: text, an AES-GCM encrypted entry, a PNG, duplicate-normalized tag references, and one intentionally missing media record. Both backends import three entries and report one failure.
- `internal/journal/testdata/go-encryption.json`: a Go-produced PBKDF2 hash and Fernet ciphertext after editing and rekeying the Python journal. Python verifies and decrypts it.

All identities/passwords and content in these fixtures are synthetic. `scripts/generate-fixtures.py` reproduces the Python database/archive inside the repository; encryption and password salts are randomized, so regenerated database bytes differ. `scripts/generate-keywords.py` translates the existing Python word sets without changing the vocabulary.

A separate round-trip validation copied the Python fixture into `.work/roundtrip/.innerly/database.db`, edited/rekeyed it in Go, then opened it through Flask and verified the new login and plaintext. The owner's actual journal was not used.

## Validation performed

- All 30 Python reference/cross-language tests pass.
- All 32 Go tests pass; the final race-detector run passed (about five minutes on this machine).
- All 7 frontend Node adapter tests pass.
- `go vet ./...` passes.
- Production frontend compilation and macOS arm64 `wails build` succeed.
- The packaged binary launched, remained running, and created its own `.work/desktop-validation/database.db`; it was then shut down.
- `wails dev` compiled and launched the native development executable with Vite; both were shut down after the startup check. A production build was rebuilt afterward.
- Python → Go edit/rekey → Python login/read passed on the disposable copy.

A process launch is **not** a full interactive UI test. Before using a real journal, manually check login/signup, write/autosave, password prompts/retries, edit/rekey, media, external link opening, hash navigation/back/forward, settings/activity, imports, and quit/reopen in the native window. Windows/Linux packaging, signing, and updates have not been validated.

## Deliberate differences and deferred work

- Token expiry, signup share/invitation endpoints, Flask routing status codes, and file signatures are transport-only behavior and are not ported. Signup/login UI remains temporarily for local account selection.
- The Go backend uses explicit SQLite statements rather than generic `BaseModel` methods; processor files share one package to avoid circular dependencies. Entry metadata remains a JSON map so unknown fields survive edits.
- Imports read ZIP members directly rather than extracting a temporary tree. Imported text remains unlocked, the same archive fields are interpreted, and per-record failures/cancellation/reimport remain supported. Per-entry persistence uses a transaction; no Python importer production code was changed.
- Image transfers through the desktop bridge are capped at 30 MiB and use base64. Display uses the asset handler, not base64.
- New Go account password hashes use the compatible PBKDF2-SHA256 format with one million iterations. Existing parameterized PBKDF2-SHA256 hashes and Werkzeug scrypt hashes are accepted within bounded supported cost parameters.
- Expired keys are still purged on access; a recurring background purge is still a TODO. Logout/shutdown clears cached keys, without promising physical zeroization of Go-managed memory.
- Physical image-file cleanup on deletion remains deferred as planned; deleting an entry removes the row, not the media file.
- Broad malformed-client-input hardening, manual entry-tag editing, sync, and UI redesign were not added.
- Single-process use is required; do not concurrently open the same journal in Python and Go. Development defaults to a separate `.work/dev-journal`.

The Python backend, Docker configuration, and its frontend transport are retained for comparison and rollback. Do not delete them until desktop acceptance is complete.
