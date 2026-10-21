# Innerly: Wails v3 migration and v0.1.0 release plan

## Purpose and authority

This is a self-contained implementation handoff for a fresh coding agent. Implement the migration described here; this document itself does not implement it.

The owner has explicitly approved breaking changes: nobody uses the app yet, the migrated app will release as **v0.1.0**, and releases before v1.0.0 do not promise backwards compatibility. Do not build v2 compatibility layers or a migration bridge for existing installed binaries. Existing users of old binaries can install the new DMG manually. Do not delete the owner's local journal, secrets, or signing credentials. Breaking-change permission is not permission to lose data.

The owner wants a simple, first-party Wails solution rather than adding Sparkle or writing an updater framework. The intended end state is:

1. Wails v3 desktop app with existing journal functionality.
2. Signed/notarized macOS universal DMG with drag-to-Applications installation.
3. An About & Updates page showing the installed version and GitHub release notes for all newer published stable releases.
4. Ability to select a compatible newer version, download it, and explicitly install/restart into that exact version using the Wails updater.
5. CI builds, verifies, and publishes everything needed for this flow.

Do not turn this into an unrelated React rewrite, a general-purpose installer platform, an update server, a licensing system, or a Windows/Linux distribution project. macOS is the shipping target.

## Repository and current implementation

- Repository: `https://github.com/ethanbond64/innerly-once`, default/release branch `master`.
- Local multimedia journal: Go + SQLite + React 18 + Vite, currently Wails **v2.16.0**. `go.mod` currently declares Go **1.26.0**. Trust actual files over stale README tool versions.
- `main.go`: embeds `all:frontend/dist`, constructs `journal.NewApp`, registers bound methods and `journal.MediaHandler`, creates a 1200×850 window (minimum 700×500), and creates macOS application/edit/window menus. Application menu includes Refresh (Cmd-R), Hide (Cmd-H), Quit (Cmd-Q). Refresh resets hash to `#/` then reloads.
- `internal/journal/app.go`: plain journal service with `NewApp`, idempotent `CloseApp`, in-memory login/derived keys, cancellable import workers, and SQLite shutdown. Most journal code does not depend on Wails. `Version()` incorrectly returns hard-coded `1.0.0` today.
- `App.OpenWindow()` starts another process using the same executable/data directory, preserving independent sessions. README mentions this, but recent changelog says the Settings desktop-windows section was removed. Do not introduce shared authenticated sessions just because v3 supports multiple windows. Prefer retaining the existing process model or removing genuinely unused UI/API intentionally, not expanding scope.
- `frontend/src/desktop.js`: desktop detection currently tests `window.go?.journal?.App`; `desktopApp()` returns that object; `journalFetch()` adapts pseudo-API routes to bound journal methods. External links use `window.runtime.BrowserOpenURL` and enforce credential-free HTTPS URLs.
- `frontend/src/index.jsx`: initializes CurrentUser, sets cached user data, renders the hash router, and adds a macOS title-bar strip.
- `frontend/src/dark-mode.js`: applies `data-theme`/localStorage theme and calls the v2 global window-background API. Background CSS variable is `--bgeb` (`#fff` light, `#17223b` dark).
- `frontend/src/app.jsx`, `router.jsx`, `constants.js`, `navbar.jsx`, `base-page.jsx`: routes, authentication, navigation, and page layout. No About route yet.
- `frontend/src/write-page.jsx`: editor autosaves every ~3 seconds, tracks dirty state and in-flight saves. Update restart must not discard unsaved writing.
- `frontend/vite.config.js`: hash routes, `appType: 'mpa'`, base `/`, development port 3000. The MPA setting deliberately allows unknown media paths to fall through to Wails rather than returning SPA HTML.
- `frontend/wailsjs/`: v2 generated bindings/runtime; replace with v3 bindings, do not hand-edit generated files.
- `frontend/tests/desktop.test.mjs` and `desktop-ui.spec.js`: mock `window.go` and `window.runtime`; these must move to the new integration boundary. Other tests include timeline tests. Playwright uses WebKit + Chromium with Vite on port 5178 and synthetic data.
- Journal paths: development `.work/dev-journal`; installed app `~/.innerly`; override `INNERLY_DATA_DIR`. Tests must use disposable directories. Media handler and media access restrictions must survive migration.

### Title-bar requirement: preserve this explicitly

The owner wants a Ghostty-like top bar: same color as page background, no native “Innerly” title text, **but still a visible-height draggable top area and normal macOS traffic lights**.

A previous attempt simply enabling v2 transparent title-bar/hiding title let the webview occupy the title-bar area and broke dragging. Current workaround is a fixed 28px `.window-titlebar` with `--wails-draggable: drag`, `.mac-titlebar #root` top padding, and `.navbar-fixed-top` offset in `frontend/public/styles/main.css`; class detection lives in `index.jsx`.

Use v3's supported title-bar/window APIs and draggable-region mechanism. Verify exact CSS/API names against the pinned release. Keep exactly one reserved top area (no double spacing), no interactive controls under traffic lights, both themes matched, and dragging working. Retain the in-page navigation logo: the request was to hide the **native window title**, not delete all branding.

### Existing build/release machinery

- `scripts/desktop.sh`: setup/test/test-ui/race/build/dev/doctor. Isolates HOME, GOPATH, Go caches, npm cache and temp files in `.work/`; pins Go toolchain from `go.mod`; installs v2 CLI at the module's version; sets development data-directory default. Preserve the isolation intent and ensure release builds do not bake the development data path into installed apps.
- `scripts/release-macos.sh`: defaults to universal build, validates bundle ID `co.innerly`, reads bundle version, signs Mach-O binaries/app with Developer ID + hardened runtime, notarizes via `notarytool`, staples/validates app, checks Gatekeeper, then produces `release/Innerly-VERSION-mac-universal.zip` and `.sha256`. Signing explicitly assumes no nested frameworks/helper bundles; reassess that assumption for actual v3 output.
- Release script deliberately runs outside desktop.sh's isolated HOME to access signing credentials; its build subprocess uses desktop.sh. Preserve this separation.
- `scripts/ci-macos-keychain.sh`: imports signing certificate/private key into temporary keychain, writes notary key, cleans up. Never commit credentials or log secrets.
- `scripts/release-version.sh`: takes latest `## vX.Y.Z` heading from `CHANGELOG.md`, compares against `wails.json.info.productVersion`, fetches published GitHub releases to skip existing tags, extracts release notes. API errors are errors, not “release does not exist.”
- `.github/workflows/release-macos.yml`: push to master, macos-15, 90-minute timeout, version gate, pinned Actions, Node 22, setup/test, temporary signing keychain, signed universal release, cleanup, draft release creation/upload, then publish. Existing concurrency is per SHA; reassess if concurrent releases could conflict.
- `.github/workflows/pr-release-check.yml`: PR to master, macos-15, no signing secrets, setup/test/unsigned universal build. Currently these are skipped if version is already published; fix so ordinary PRs still run useful tests/build validation.
- `wails.json`: v2 config, current bundle product version `0.0.1`; `frontend/package.json` is already `0.1.0`; journal Version is `1.0.0`. Resolve these inconsistent sources.
- `build/darwin/Info.plist`, `Info.dev.plist`: bundle templates to migrate to v3 conventions.
- `CHANGELOG.md`: latest heading is v0.0.1, followed by v0.0.0. Preserve history and prepend a substantive v0.1.0 entry. Publish pre-1.0 releases as ordinary stable releases, not GitHub prereleases merely because the major version is zero.
- README currently has stale tool versions and some removed UI descriptions; update commands and descriptions to actual behavior.

## Verified upstream facts and initial research gate

At planning time GitHub's release API reported **v3.0.0-beta.33** as the latest v3 release (a prerelease). Its tagged `v3/pkg/updater/config.go` exists and includes providers, current version, a pinned public verification key, restart-helper timeout, and updater configuration. Its `v3/go.mod` requires Go 1.26.0 and declares toolchain go1.26.9. This is a concrete starting candidate, not a mandate to use a floating latest dependency.

Current upstream master documents:

- First-party `app.Updater`: check/download/verify/stage/restart, events, custom or default update UI.
- Providers for GitHub Releases, signed endpoint manifests, appcasts, etc.
- macOS updates use a ZIP containing exactly one top-level `.app`. DMG/PKG are **not** update payloads.
- Update staging is beside the installed `.app`, so parent-directory writability matters.
- Pinned `Config.PublicKey` requires signed verification data; unsigned/digest-only releases fail closed when the key is set.
- GitHub default matching uses OS/architecture filename substrings. Our `mac-universal` filename needs an explicit matcher; do not accidentally select the DMG, checksum, signature, or an old v2 artifact.
- Wails DMG implementation uses Apple `hdiutil` and creates an `/Applications` symlink. No third-party installer tool is necessary.

**Before implementation, inspect the exact tagged source and examples. Master documentation can differ from beta.33.** Some tagged comments are clearly transitional. Verify actual implemented behavior rather than treating illustrative snippets as an API contract.

Read these upstream resources at the selected tag/commit where possible:

- `https://github.com/wailsapp/wails/blob/master/docs/mpress/content/migration/v2-to-v3.md`
- `https://github.com/wailsapp/wails/blob/master/docs/mpress/content/guides/updater.md`
- `https://github.com/wailsapp/wails/blob/master/docs/mpress/content/guides/updater-github-release-assets.md`
- `https://github.com/wailsapp/wails/blob/master/docs/mpress/content/reference/update-manifest.md`
- `https://github.com/wailsapp/wails/blob/master/docs/mpress/content/guides/build/signing.md`
- `https://github.com/wailsapp/wails/tree/master/v3/examples/updater`
- `https://github.com/wailsapp/wails/tree/master/v3/pkg/updater` (especially config, provider interface, GitHub provider, verification, helper, macOS extraction and restart).
- `https://github.com/wailsapp/wails/blob/master/v3/internal/commands/dmg/dmg.go`
- Selected release's React/Vite template, build Taskfiles, asset-server examples, window/title-bar APIs, service lifecycle hooks, and frontend runtime package.

If the docs site is blocked, use raw.githubusercontent.com or GitHub source. Check `git status` before work; do not overwrite unrelated changes.

## Phase 1 — pin v3 and prove the basic shell

1. Pin one v3 tag in `go.mod` and install the CLI at that exact same version; no `@latest` in reproducible CI. Pin a compatible `@wailsio/runtime` package/lockfile version as required by the chosen release. Align Go toolchain requirements across local setup and CI.
2. Generate a throwaway v3 React/Vite starter outside tracked source to inspect current build conventions. Migrate only necessary config/Taskfiles/templates into this app; keep React/Vite and journal implementation.
3. Replace v2 startup with v3 application creation, journal service registration, explicit main window, asset handler and lifecycle wiring. Preserve window dimensions/minimum size, bundle identity, icons, menu shortcuts, hash reload behavior and normal close/quit behavior.
4. Wire shutdown once through a safe path, keeping `journal.CloseApp` idempotent. Inspect v3 updater helper startup: helpers must enter the Wails application early enough and must not unnecessarily initialize/open the journal, display login, or run migrations before helper dispatch. Respect the chosen release's supported initialization order.
5. Port media serving to v3's asset-server middleware/handler pattern. Prove images work in both dev and packaged app; do not allow Vite history fallback to mask `/media/` failures. Retain authorization and path validation.
6. Port native title-bar behavior as specified above and validate on an actual macOS window before considering this phase complete.
7. Remove obsolete v2 config/generated runtime once replacements build. Do not retain two competing build systems.

Deliverable: v3 dev launch and unsigned universal packaged app, with a functioning login/home/editor/media workflow.

## Phase 2 — frontend bindings and desktop boundary

1. Generate v3 service bindings via the pinned CLI, with a deterministic output location and generation command. Decide whether generated bindings are committed or generated before frontend compilation; make clean-clone builds work either way.
2. Replace `window.go`/`window.runtime` coupling with a small explicit desktop adapter importing generated bindings and the v3 runtime. Keep most existing `journalFetch` mappings and Result handling unless a change is clearly useful; do not rewrite all journal requests just to change Wails versions.
3. Route background-color changes, browser opening, desktop detection and any other runtime interactions through that adapter. Audit the full repository, not just known call sites. Do not infer packaged-vs-development mode only from hostname or navigator.platform.
4. Preserve HTTPS-only external navigation and prevent arbitrary navigation of the privileged app webview.
5. Change tests to mock the adapter/service boundary rather than v2 globals. Browser-only UI tests must not try to call a live native IPC transport. Verify v3 asset scheme/origin changes do not silently lose stored theme/preferences.

Deliverable: no production imports of Wails v2, `frontend/wailsjs`, or direct v2 globals; testable v3 desktop adapter.

## Phase 3 — authoritative v0.1.0 build metadata

1. Choose a small authoritative app-version source independent of v2 `wails.json` (for example a root VERSION file or a small build metadata config). Document it and validate against the top changelog heading. Avoid adding a version framework.
2. Derive binary version (without leading v), CFBundleShortVersionString, a valid monotonically increasing CFBundleVersion/build identifier, release artifact names and updater CurrentVersion from that source/build process. Replace hard-coded `journal.App.Version()` and keep package metadata consistent where relevant.
3. Provide About metadata through a desktop/app-info service: version, build/commit if desired, release repository, supported platform/architecture, development status. This should work without logging into the journal.
4. Unsigned development builds must not silently update themselves into production; disable installation with a clear development-build explanation while allowing release listing/tests.
5. Add `v0.1.0` changelog notes documenting v3, updates, DMG and any intentional breaking changes. Do not rewrite existing released tags or assets.

### Phase 3 — owner-scoped implementation

The owner's subsequent instruction supersedes the metadata requirements above: **only the version is wanted**, and the highest numeric `## vX.Y.Z` changelog heading is the authority. No VERSION file, app-info service, build/commit metadata, build ID or updater configuration is being added.

- `release-version.sh --version` selects the highest changelog version offline; release notes come from that same heading, even if headings are out of order.
- Desktop builds inject the value into the existing `journal.App.Version()` and populate both bundle version fields before signing. Release artifact naming derives from that bundle version.

## Phase 4 — GitHub releases and selected-version updater

### User experience

- Add `/about` (or an equivalent hash route) and About & Updates navigation in the app menu and account menu. Make it usable before journal login, with appropriate layout rather than assuming a logged-in avatar exists.
- Show installed version, manual Check for Updates, checking/error/offline/last-checked states, and all newer published stable releases with version/date/release notes.
- Compare semantic versions correctly: 0.10.0 > 0.9.0; ignore v0.0.x when installed at v0.1.0; omit drafts and default-hide prereleases. Paginate GitHub results. Mark releases lacking compatible payload/verification metadata unavailable rather than offering a broken install.
- Sanitize Markdown (no arbitrary raw HTML/scripts). Preserve safe links. Never turn GitHub-provided text into executable HTML.
- User selects a version, downloads with progress/cancel if supported, then explicitly chooses **Install and Restart**. Avoid surprise restarts or background installs. Show errors without preventing journal use.
- Exact selection is a requirement: choosing 0.2.0 must not install 0.3.0 if a newer release appears during download.

### Minimal architecture

- Use Go's HTTP client for GitHub release discovery, with timeouts, bounded responses, pagination and basic caching/rate-limit handling. Repository is `ethanbond64/innerly-once`; confirm it is publicly readable. Do not embed a GitHub access token. If private, stop and ask the owner about public artifact hosting/authentication rather than shipping a secret.
- Use Wails' updater for downloading, verification, extraction, replacement and restart. No Sparkle, custom replacement shell script, or elevated installer service.
- Inspect the selected v3 API for selecting a specific `Release`. If its stock GitHub provider only discovers latest, implement a **small provider adapter** returning an explicitly selected, validated release. Treat the selection as immutable for the active operation; serialize updater operations. The adapter supplies metadata and delegates the heavy updater machinery to Wails, not reimplements it.
- Use a deliberate asset matcher for `darwin`/`mac` + `universal` ZIP, never DMG/sidecars. Verify app identity and target version through supported updater validation points. Restrict sources to the intended repository/allowed GitHub artifact hosts without breaking legitimate GitHub download redirects.

### Verification decision: resolve before publishing v0.1.0

Use the Wails updater's supported signed-artifact/manifest mechanism with a public key pinned in the app. Keep it minimal: generate one update-signing keypair, embed only public key, store private key in trusted release CI. Apple code-signing/notarization remains required and is separate.

Do **not** assume uploading a `.sig` beside a ZIP makes the stock GitHub provider verify it. Inspect the tagged provider's actual signature support. If it only understands checksum files, let the small provider adapter consume a per-release signed Wails manifest/signature metadata asset from that same GitHub Release, with the payload signature verified against the embedded key. Use Wails CLI signing/manifest commands and exact algorithms/formats from the pinned release. No bespoke cryptography, appcast server, or extra hosted API required.

A checksum downloaded from the same location detects corruption but is not equivalent to a pinned publisher signature. Test fail-closed behavior for missing signatures, modified archives, incorrect keys and stripped verification metadata. If release metadata itself is not signed, do not claim arbitrary metadata (version/compatibility) is authenticated merely because payload bytes are signed; enforce what the supported signed format actually covers.

### Restart and data safety

- Flush/await editor autosave before restart; block and explain if saving fails or needs a password. Make this a real shared shutdown contract, not a blind sleep or a route-only callback that disappears when the editor unmounts.
- Cancel/finish imports appropriately and close journal workers/database through the supported application shutdown hooks.
- Coordinate with the existing second-process behavior: do not replace an app while other Innerly processes are writing data. Require other instances to close or implement the smallest supported coordination mechanism. Updater helper execution must not be mistaken for an ordinary second instance.
- Do not update directly from a mounted DMG, a read-only/translocated location, or an unwritable install parent. Give “Move Innerly to Applications” or a manual-download fallback. Do not add privileged helpers to solve permissions.
- No downgrades. Filter incompatible releases, especially where journal schema requirements change. Pre-1.0 breaking changes may be documented rather than supported, but must never silently corrupt data.

Deliverable: a selected version can be safely staged and explicitly installed/restarted; tests prove it is the selected version, not always latest.

## Phase 5 — DMG and update packaging

1. Adapt `scripts/release-macos.sh` to pinned v3 build commands while retaining its credential flags and validation checks where applicable. Preserve universal arm64+x86_64 output; verify with `lipo -info` rather than just naming a build universal.
2. Sign actual nested executable/bundle output inside-out as needed, then sign the `.app` with hardened runtime. Inspect bundled components; do not blindly deep-sign or assume the v2 signing layout still applies.
3. Notarize the application submission, staple/validate the app and assess it with Gatekeeper.
4. Produce the updater ZIP **after app stapling**, with exactly one top-level `Innerly.app` and preserved permissions/symlinks/signature. Do not include an Applications symlink in this ZIP.
5. Use Wails' DMG command (or direct Apple hdiutil if the pinned command lacks necessary control) to package the identical stapled app plus `/Applications` symlink. Basic working drag-to-folder installation is sufficient; custom Finder art is optional, not a blocker.
6. Sign/notarize/staple the DMG, validate it and test mounting. Follow Apple's current supported checks for the artifact type.
7. Generate update signature/manifest metadata and checksums from the **final immutable ZIP bytes**. Any repackaging after signing invalidates verification.
8. Output documented filenames for DMG, updater ZIP, checksums, and per-release update metadata. Keep naming consistent with the app provider and tests.
9. Clean staging/mounts even on failure, and ensure stale artifacts cannot be mistaken for a successful new release. Never mutate published signed artifacts in place as part of a retry without an explicit policy.

## Phase 6 — CI and release publication

### PR validation: `.github/workflows/pr-release-check.yml`

- Install matching v3 CLI/runtime and Go/Node toolchains from pinned configuration.
- Generate bindings, run journal/unit/UI-adapter tests, frontend production build and unsigned universal app build on macOS. Consider UI tests in this job or a separate job with explicit browser installation.
- Validate version/changelog/bundle consistency without requiring a new unpublished version for every PR.
- Test asset-selection, metadata/signature rejection and release-list pagination using fixtures; no real signing secrets or journal data.
- No certificate/notarization/update-signing private keys on PR workflows, especially untrusted forks.

### Release: `.github/workflows/release-macos.yml`

- Retain master-push/version-gated release intent unless a clearly documented change is needed. Explicitly test the v0.1.0 unpublished-tag path and already-published skip path.
- Update `release-version.sh` to the new version source. Handle GitHub failures explicitly. Ensure existing-tag handling never silently points the new release at an old commit.
- Keep temporary keychain setup/always-cleanup. Add only required updater-signing secret(s), cleaned up on success/failure and never logged. Existing Apple secrets are `MACOS_SIGNING_P12_BASE64`, `MACOS_SIGNING_P12_PASSWORD`, `MACOS_SIGNING_IDENTITY`, `APPLE_NOTARY_KEY_P8`, `APPLE_NOTARY_KEY_ID`, `APPLE_NOTARY_ISSUER_ID`.
- Build/test, sign/notarize, package DMG+ZIP, sign update metadata, verify all outputs using the pinned Wails tools, then upload to a draft GitHub Release.
- Publish the release only after **all** artifacts and notes are present and validated. This avoids advertising a partially uploaded update. No separate live appcast or update server is required for the proposed per-release GitHub metadata design.
- Keep `contents: write` restricted to publishing workflow/job as practical, pinned GitHub Actions and safe handling of external release-note input. Serialize publication if needed to prevent competing jobs/clobbers.
- On failure, retain useful non-secret notarization diagnostics and leave the release unpublished; document safe reruns. Do not expose credentials through artifacts/logs.

## Phase 7 — tests and acceptance checklist

### Automated

- Existing Go journal behavior tests and race tests still pass using disposable data.
- Frontend unit tests and Playwright WebKit/Chromium tests use a mocked v3 adapter and pass.
- New tests cover 0.x semantic ordering, optional `v` prefix, draft/prerelease filtering, pagination, no-update state, network errors and missing/incompatible update assets.
- Selected version cannot change underneath an active update; selecting an older-than-latest but newer-than-installed version is covered.
- Verify wrong/missing signature, corrupted archive and wrong trust key all fail without replacing the installed app.
- Verify development/read-only builds and unavailable install locations do not attempt replacement.
- Version source, About display, updater CurrentVersion, bundle version, tag and filenames agree.
- Clean setup/build succeeds with pinned tools and no leftover v2 files or pre-generated local-only assets.

### Actual macOS smoke tests (not replaceable by browser tests)

- Dev launch and packaged universal app launch; confirm native architecture slices.
- Login/signup/logout, create/edit/autosave/encryption, image/media viewing, link opening/previews, search, tags/activity/day pages and settings work.
- Title strip has height, background matches both themes, no native title string, traffic lights function, drag works on blank strip and controls are not dragged/obscured. Check fullscreen and restore.
- Cmd-R resets home/reloads; Cmd-H/Cmd-Q and edit shortcuts work.
- DMG opens, Applications shortcut works, copied app launches under Gatekeeper, journal goes to production path rather than `.work`.
- About works before login, lists real or fixture releases, renders safe notes and selected-version actions correctly.
- Install from a signed v0.1.0 test build to a separately signed higher test version using a test repository/feed and disposable journal. Do not publish fake production releases just to test.
- Exercise selection of a non-latest newer version, failed download, corrupt signature, non-writable directory, launch from DMG, other instance running, failed autosave and canceled restart.
- Successful restart reports target version, preserves journal data, and leaves a usable installation. Test updater failure/recovery with the pinned framework's supported mechanism.

## Completion and handoff

Update `README.md` with real prerequisites, setup/dev/test/build/release commands, data directories, versioning, installation and update behavior. Add concise release-maintainer documentation for secrets, public-key setup/rotation implications, artifact names, signing/notarization, verification and safe reruns. Public keys may be committed; private keys may not.

Implementation is complete when the app genuinely runs on v3, the title bar remains draggable, the signed DMG works, About shows accurate GitHub releases, a chosen newer version installs/restarts through first-party Wails updater machinery, and CI can reproducibly publish v0.1.0 with all required assets. If external signing credentials or interactive macOS tests are unavailable, finish what can be verified and report the remaining manual/release gates explicitly rather than fabricating success.
