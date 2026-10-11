# Python-to-Go Migration Test Inventory

## Purpose and scope

Build a Python regression suite first, then port the behavioral assertions and fixtures to Go so the Wails migration can be driven by tests.

This is a proposed inventory based on the current source, not an implemented or executed suite. Unmarked scenarios describe current behavior expected to pass today; items marked **Approved change** require a future product fix and are not part of the passing baseline yet. No item is marked passing until it has actually run. This revision updates the plan only, on branch `tests`; it does not authorize making code changes as part of this documentation task.

Use Python tests for backend/domain behavior. React rendering, autosave timing, typewriter scrolling, browser-local settings, and navigation need a separate JavaScript or end-to-end suite; Python backend tests cannot adequately certify them.

## Test strategy and shared fixtures

**Production code should remain untouched to accommodate tests, ideally with zero changes.** Do not add dependency-injection interfaces, clock abstractions, test-only flags, exported helpers, or refactors just to fit a testing framework. The approved search, password-validation, and link-security fixes below are product changes, not test-enabling changes; keep them separate from baseline test work.

**Prefer higher-level end-to-end behavior scenarios.** Drive signup/login, settings, entry creation/editing, locking, search, media retrieval, and password changes through the application's public boundary with real SQLite and filesystem storage. Flask's test client exercises the backend stack, not browser UI; reserve actual server/browser smoke tests for behaviors that need them. Port workflows and observable outcomes to the Go application boundary, not Python's internal call structure.

The checklists below are coverage outcomes to combine into workflows, not instructions to write one unit test per helper or assertion. Prefer representative journeys and parameterized input/output cases over exhaustive internal branches. Do not assert ORM methods, dictionary layout, function call counts, cache implementation, thread classes, or exact sentiment algorithm mechanics. Small direct compatibility tests are justified only where the persisted cryptographic/data format requires them.

- [ ] Use pytest with isolated temporary SQLite databases and temporary media/import directories; never read or modify a real journal.
- [ ] Supply a temporary HOME and config before importing application modules (settings currently reads `~/.innerly/config.json` at import time); use a fresh process where import-time configuration/global state makes isolation difficult.
- [ ] Start from public operations wherever possible; seed only legacy/edge-case datasets that cannot be created through supported user workflows, then assert through public reads and persisted data.
- [ ] Create two ordinary users and an admin for authorization/isolation cases.
- [ ] Prefer fresh application processes for independent scenarios rather than production reset hooks for global state.
- [ ] Use test-side clock patching or synthetic expired fixtures only for timeout cases; no production clock refactoring or long sleeps.
- [ ] Stub only external network/time boundaries when needed. Keep application processing, database writes, and file handling real; use controlled responses for network failures, never public websites.
- [ ] Use tiny valid JPEG, PNG, and GIF fixtures plus invalid/non-image payloads.
- [ ] Commit synthetic, non-sensitive compatibility fixtures: SQLite journal, legacy password hash, Fernet v0/v1 ciphertext, legacy AES-GCM import archive, and expected decoded records.
- [ ] Give portable behavioral cases stable identifiers/names that can be reused in Go.
- [ ] Compare decrypted values and persisted state rather than randomized ciphertext, salts, signatures, or generated filenames.
- [ ] Reopen the database or use a fresh session when asserting persisted encryption; an ORM object in memory is not proof of at-rest state.

## 1. Database, models, and serialization

Sources: `backend/api/models.py`, `backend/api/app.py`, `backend/api/settings.py`.

- [ ] First startup creates all expected tables in an empty database.
- [ ] Repeated initialization preserves existing users and entries.
- [ ] An old tags table without `day_tag` gets the column added with a false default.
- [ ] Reapplying column migrations does not change existing data or fail.
- [ ] Create, edit, read back, and delete an entry through the API; verify IDs/timestamps and that results survive a fresh application session.
- [ ] Reopen a synthetic legacy journal through normal startup and verify its entries/settings remain readable.
- [ ] User serialization excludes `password_hash`.
- [ ] Entry serialization includes attached tag names and the stored entry type/data.
- [ ] Serialized SQLite timestamps use the existing ISO-8601 UTC convention, including `Z`.
- [ ] Short entry serialization truncates text to 64 characters and preserves other fields.
- [ ] Text shorter than 64 characters is not changed by preview serialization.
- [ ] Local file paths receive signed `/api/...` URLs when a signer is supplied.
- [ ] External file paths are not rewritten by the signer.
- [ ] Entry serialization without a signer returns the stored path.
- [ ] Database uniqueness rejects duplicate email addresses, duplicate per-user tag names, and duplicate entry/day tag associations.
- [ ] Different users may use the same tag name independently.

## 2. Signup, login, and session authentication

Sources: `backend/api/security.py`, account routes in `backend/api/views.py`.

- [ ] Valid signup creates a user and returns a token and sanitized user data.
- [ ] The first registered user is an admin; subsequent users are not.
- [ ] Signup rejects a missing JSON body, missing email, or missing password.
- [ ] Signup rejects representative invalid emails and passwords shorter than eight characters.
- [ ] Signup rejects an existing email with a conflict response.
- [ ] Stored passwords are hashes, not plaintext.
- [ ] Password verification accepts the correct password and rejects a wrong or empty password.
- [ ] Valid login returns a usable token and sanitized user data.
- [ ] Login rejects missing credentials, nonexistent users, and incorrect passwords.
- [ ] Login primes the user's lock-key cache.
- [ ] Protected operations reject missing Authorization headers, non-Bearer schemes, empty tokens, malformed tokens, and tampered tokens.
- [ ] Bearer scheme matching is case-insensitive.
- [ ] Tokens older than five days are rejected.
- [ ] A token for a nonexistent user is rejected.
- [ ] A signed identity without the expected identity suffix is rejected.
- [ ] An ordinary user cannot generate an admin share value; an admin can.

Note: signup invitation enforcement is currently commented out. Do not assume signup is invitation-only.

## 3. User settings

Sources: user update route and settings helpers in `backend/api/views.py`; TTL helpers in `backend/api/security.py`.

- [ ] A user can update their own settings.
- [ ] An ordinary user cannot update another user's settings.
- [ ] An admin can update another user's settings.
- [ ] Updating a nonexistent user returns not found for an authorized caller.
- [ ] Missing JSON is rejected.
- [ ] Supported sensitivity values (`default`, `blur`, `both`) are saved; unsupported values leave the setting unchanged.
- [ ] Lock-by-default can be enabled and disabled.
- [ ] Updating one supported setting preserves other settings.
- [ ] Unknown settings are not added through this endpoint.
- [ ] Initial string-valued empty settings are treated as an empty settings object.
- [ ] Lock timeout accepts positive integer values in seconds, minutes, hours, and days up to seven days.
- [ ] Lock timeout rejects zero, negative values, booleans, strings, unsupported units, incomplete pairs, and ordinary values above seven days.
- [ ] Invalid TTL updates return an error without saving partial settings.
- [ ] No valid stored TTL means a one-hour lock-key lifetime.

## 4. Text processing and sentiment

Sources: `backend/api/processors/text_processor.py`, `entry_models.py`, `keywords.py`.

- [ ] Text processing preserves supplied title/text and emits sentiment and word count.
- [ ] Word count handles empty/absent text, spaces, tabs, newlines, and repeated whitespace.
- [ ] Unicode text is preserved.
- [ ] Empty text and text with no recognized sentiment words are neutral.
- [ ] Positive-only recognized words produce positive sentiment; negative-only words produce negative sentiment.
- [ ] Mixed recognized words follow the current ratio thresholds, including their boundary behavior.
- [ ] Matching is case-insensitive and removes apostrophes before token matching.
- [ ] A recognized negation suppresses the following two tokens.
- [ ] Sentiment indexes 0, 1, and 2 map to negative, neutral, and positive; unsupported indexes map to neutral.

Use actual dictionary tokens in fixtures. This is keyword scoring, not an external AI service; do not assert semantic understanding beyond the implemented rules.

## 5. Entry creation, editing, reading, and deletion

Source: entry routes in `backend/api/views.py`.

- [ ] Create a text entry with lock-by-default disabled and persist its user ownership, type, text, word count, and sentiment.
- [ ] An explicit `locked: false` creates an unlocked text entry even if the account default is locked.
- [ ] Omitting the lock flag uses the account setting, defaulting to locked when no setting exists.
- [ ] An explicit `locked: true` creates a locked entry when a key/password is available.
- [ ] A supplied functional datetime is persisted separately from creation time; omitting it uses the current time.
- [ ] Invalid content types, missing entry types, and missing required text/link/file data return errors.
- [ ] JSON is accepted for text/link creation and multipart form data for image creation.
- [ ] Fetching one's own entry returns the full entry; fetching a missing or another user's entry returns not found.
- [ ] Updating text persists the new text and recalculates its word count.
- [ ] Updating a title or sentiment preserves fields not included in the request.
- [ ] A no-op update preserves existing entry data.
- [ ] Updating a missing or another user's entry returns not found.
- [ ] Updating a non-text entry is rejected.
- [ ] Deleting one's own entry removes its database row.
- [ ] Deleting a missing or another user's entry returns not found.

Entry-tag replacement is out of scope: entry tags are not created/edited by hand in the supported UI. Physical-file cleanup is awaiting clarification; see decision 3 below. Do not add production fixes for either as part of baseline testing.

## 6. Entry listing, search, activity, and memories

Source: fetch routes in `backend/api/views.py`.

- [ ] Entry lists only contain the current user's entries.
- [ ] Entries are ordered by descending functional datetime.
- [ ] Limit/offset pagination returns the expected subset of distinct-datetime fixtures.
- [ ] List results use short text previews and signed local media URLs.
- [ ] An empty journal returns an empty list.
- [ ] Search matches titles and unlocked text case-insensitively.
- [ ] **Approved change:** search also matches entry-level tag names case-insensitively by substring, combined with title/unlocked-text matching using OR.
- [ ] **Approved change:** a tagged entry is returned once even when several tags or its title/text match; pagination and chronological ordering remain correct.
- [ ] **Approved change:** entry-tag search finds locked entries without decrypting their text and never returns another user's entries.
- [ ] **Approved change:** a tag attached only to a day does not make that day's entries match entry-tag search.

Seed existing entry/tag associations in a synthetic fixture (no manual tag-creation feature or importer change). The unused separate `tag` filter parameter is not part of this requested search fix.
- [ ] Search does not inspect the plaintext contents of locked text.
- [ ] Locked entries can still be found by unencrypted title.
- [ ] Date filtering includes the current UTC slack window (anchor minus one day through anchor plus two days).
- [ ] Invalid date filters return an error.
- [ ] Activity results only include the user's records and expose datetime, sentiment, and word count, not full text.
- [ ] Activity records are ordered by ascending functional datetime.
- [ ] Activity respects requested date windows, including existing timezone slack.
- [ ] Activity day counts use the default on invalid input and clamp to the supported 1–731 range.
- [ ] An invalid activity `before` date returns an error.
- [ ] Word counts use stored integer counts even when text is encrypted.
- [ ] Legacy unlocked entries without a word count are counted from text; legacy locked entries without it return zero.
- [ ] Memories return distinct candidate datetimes from matching month/day and adjacent days across years.
- [ ] Memories only include the current user's entries.
- [ ] Missing/invalid memories dates return an error.
- [ ] Empty activity/memories queries return empty collections.

Exact local-day grouping and exclusion of the current year from memories happen in React. Backend tests should assert candidate records, not the final displayed grid/badges.

## 7. Entry tags and day tags

Source: tag models/helpers and tag routes.

Entry tags are not manually created/edited in the supported UI. Do not add helper-level insertion/replacement tests or implement a new workflow. Use preexisting fixture associations to verify display, ownership, and the approved entry-tag search behavior.
- [ ] Day-tag names are trimmed and lowercased.
- [ ] Blank, missing, and over-255-character day-tag names are rejected; a 255-character name is accepted.
- [ ] A tag already used on an entry can be promoted to a day tag without creating a second tag row.
- [ ] Creating a day tag requires a valid functional datetime.
- [ ] Adding the same normalized tag to the same datetime is idempotent and returns the existing association.
- [ ] A day tag can exist on a day without entries.
- [ ] Tagged-day fetching is user-scoped and ordered by descending functional datetime.
- [ ] Day-tag suggestions include only tags marked for days and support case-insensitive search, alphabetical ordering, limit, and offset.
- [ ] General tag fetching is user-scoped and supports search, limit, and offset.
- [ ] Removing a day association preserves the underlying tag row and entry associations.
- [ ] Removing a tag from one day preserves its day-tag flag while other days still use it.
- [ ] Removing its last day association clears the day-tag flag and removes it from day suggestions.
- [ ] Deleting a missing or another user's day association returns not found.

## 8. Encryption, lock cache, and compatibility (highest priority)

Source: `backend/api/security.py` and lock/fetch/update routes.

- [ ] A fixed user/password derives the expected scrypt key bytes using a golden fixture.
- [ ] Different passwords and different user emails derive different keys.
- [ ] Version-1 encryption/decryption round-trips empty, multiline, and Unicode text.
- [ ] Fixed Python-produced version-1 ciphertext decrypts to the expected text.
- [ ] Fixed legacy version-0 ciphertext decrypts using the legacy email-based key.
- [ ] Unsupported lock versions and tampered ciphertext fail rather than silently returning text.
- [ ] Locking an entry preserves its title, sentiment, word count, and tags across subsequent reads.
- [ ] Locked creation stores ciphertext, never the submitted plaintext, while returning plaintext to the writer with `text_unlocked: true`.
- [ ] Locking an unlocked text entry persists ciphertext; locking an already locked entry leaves it unchanged.
- [ ] File/link entries cannot be locked through the lock endpoint.
- [ ] Lock operations reject another user's entry or a missing entry.
- [ ] A valid cached key permits locking without resubmitting a password.
- [ ] A missing/expired key with no valid password returns the `lock-auth-expired` marker.
- [ ] Re-authentication with the correct password refreshes the cache; a wrong password does not provide a usable key.
- [ ] Authenticating one user's lock access does not allow another user to write locked entries without their own authentication.
- [ ] Valid account settings control newly cached key expiration.
- [ ] Fetching locked text with a password returns plaintext but leaves the database encrypted.
- [ ] Fetching locked text without a password returns ciphertext; password fetch rejects missing/wrong passwords.
- [ ] Password-based reads require actual password authentication even when a write key is cached.
- [ ] Editing locked plaintext re-encrypts it at rest, preserves lock metadata, and returns the updated plaintext to the writer.
- [ ] Submitting ciphertext back as an edit to a locked entry is rejected, leaving persisted data unchanged.
- [ ] Permanently unlocking an entry writes plaintext and sets `locked: false`.
- [ ] Ordinary plaintext edits remain readable after saving; accidentally resubmitted stored ciphertext is rejected through the edit endpoint.
- [ ] A known Werkzeug PBKDF2 hash verifies correctly with the matching password (future Go compatibility fixture).

## 9. Password changes and transactional re-encryption

Source: password-change route and `entry_relocker`.

- [ ] Missing current/new passwords and wrong current passwords are rejected.
- [ ] A password change with no locked entries updates the hash and subsequent login accepts only the new password.
- [ ] All locked text entries are re-encrypted under the new key and remain readable with the new password.
- [ ] Legacy version-0 entries become current-version ciphertext during re-encryption.
- [ ] Unlocked entries remain unlocked unless `lock_all` is requested.
- [ ] `lock_all` locks all of that user's text entries, including previously unlocked entries.
- [ ] File/link entries and other users' entries are unaffected.
- [ ] The response reports the number of re-encrypted entries.
- [ ] Failure to decrypt/re-encrypt any selected entry rolls back both password and entry changes, including entries processed before the failure.
- [ ] Successful changes refresh the write-key cache with the new password-derived key.

- [ ] **Approved change:** password changes reject a new password shorter than eight characters, using the same minimum-length rule as signup.
- [ ] **Approved change:** a valid eight-character password is accepted with the correct current password.
- [ ] **Approved change:** a rejected weak password leaves the old login, locked entries, and persisted account data unchanged, including when `lock_all` is requested.

Validate these through password-change/login/read workflows, not assertions that a particular validation helper was called. These scenarios require a future production fix; they are not expected-pass baseline tests yet.

## 10. Image validation, storage, and access

Source: `backend/api/processors/file_processor.py`, file route, signing helpers.

- [ ] JPEG, PNG, GIF87a, and GIF89a headers are recognized.
- [ ] Unknown formats and non-image payloads are rejected.
- [ ] Validation resets the stream position so the complete original bytes are saved.
- [ ] Detected image format, rather than the submitted extension, determines the stored extension.
- [ ] Submitted filenames are sanitized and the original sanitized name becomes the entry title.
- [ ] Stored filenames are unique and files are placed under the correct user's directory.
- [ ] Missing user directories are created automatically.
- [ ] Stored bytes match the uploaded bytes.
- [ ] Public stored paths use the existing `static/<filename>` convention.
Physical-file deletion assertions are deferred pending clarification of decision 3; do not substitute a passing low-level helper test for the actual delete-entry workflow.
- [ ] A valid file signature resolves to its user; one older than twelve hours does not.
- [ ] File serving requires a signature and serves the correct file from the resolved user's directory.
- [ ] A valid signature with a nonexistent filename returns not found.

Existing signature behavior is accepted as-is; do not add filename-binding or malformed-signature hardening requirements. Route-driven physical deletion is explained under decision 3 and is not approved for a fix yet.

## 11. Open Graph parsing and HTTP link processing

Sources: `opengraph.py`, `link_processor.py`.

- [ ] Parsing extracts `og:title`, `og:image`, and other `og:*` properties from meta tags.
- [ ] HTML entities in attribute values are decoded.
- [ ] Non-meta tags, non-Open-Graph properties, and tags without content are ignored.
- [ ] Empty property content is retained; later duplicate properties replace earlier ones.
- [ ] HTML decoding prefers a header charset over a meta charset.
- [ ] A meta charset is used when no header charset exists; absent/unknown charsets fall back to UTF-8.
- [ ] Invalid byte sequences are replaced rather than causing decoding errors.
- [ ] HTTP/HTTPS schemes are accepted case-insensitively; absent and file/FTP/data schemes are rejected.
- [ ] HTTP fetch applies the expected timeout and sends a User-Agent.
- [ ] Oversized declared Content-Length is rejected before reading the body.
- [ ] Oversized actual responses are rejected even with absent or dishonest Content-Length.
- [ ] A response exactly at the cap is accepted.
- [ ] Successful metadata fetch returns title and image URL; fetch/parser failure returns no metadata.
- [ ] Thumbnail download failure returns no file rather than failing the whole download helper.
- [ ] A successful image download creates a local thumbnail and a link record preserving original image URL and target link.
- [ ] A failed download preserves the external thumbnail URL and marks it external.
- [ ] Failure to fetch the page causes link creation to fail without inserting an entry.

Exercise these outcomes through link creation and subsequent entry/media reads using controlled network responses. Do not add production injection points or assert parser/HTTP helper call sequences. Use test-side patching for response limits if needed; avoid public network requests and Wikipedia sleeps.

### Approved change: link security and graceful failures

These are future product fixes, not passing-baseline claims. Keep changes confined to the shared link-fetching/processing boundary; do not alter importer code or its workflow.

- [ ] Reject unsafe URL schemes, malformed URLs, embedded credentials, and missing/invalid hosts with a controlled error and no inserted entry.
- [ ] Block loopback, private, link-local (including cloud metadata), multicast, unspecified, reserved, and other non-public destinations for both page and thumbnail requests, including IPv4, IPv6, and mapped-address representations.
- [ ] Validate all resolved addresses and the actual connection destination so hostname tricks, mixed public/private DNS answers, and DNS rebinding cannot bypass the policy. Do not let ambient proxy settings bypass it.
- [ ] Apply the same checks to every redirect hop for pages and images; cap redirects and reject loops/unsafe redirects before contacting the blocked destination.
- [ ] Maintain TLS certificate verification and bounded network timeouts/response sizes, including absent or misleading Content-Length and any decoded content.
- [ ] Resolve relative thumbnail URLs against the final page URL and validate the resolved destination before fetching.
- [ ] Invalid, missing, unsupported, oversized, or unreachable thumbnails do not turn an otherwise valid bookmark into a server error; retain the title/link and omit the unusable preview.
- [ ] Never return a blocked/unsafe thumbnail URL as a browser-loaded fallback; this would bypass server-side restrictions.
- [ ] Page fetch failures return a controlled user-facing error, leave no entry behind, and do not expose sensitive internal details.
- [ ] Successful public pages and supported image previews still save and can be read back normally.

Use a controlled transport/DNS boundary to simulate these cases without reaching private networks. Assert observable rejection, persisted results, and absence of blocked outbound connections, not a particular security library or validation implementation.

## 12. Legacy import parsing and archive compatibility

Source: `backend/api/imports.py`.

**Frozen feature:** no importer production changes, security fixes, cleanup changes, encryption-policy changes, timestamp expansion, or testability refactors. Existing behavior may be characterized with synthetic archives through the current import API. Consolidate the outcomes below into a few archive-to-journal scenarios; they are not a mandate for parser/decryption helper unit tests. If a test uncovers an import bug, document it rather than changing the feature.

- [ ] Archives containing all six required root CSVs pass validation; missing CSVs are reported.
- [ ] CSV parsing preserves quoted delimiters, multiline values, and Unicode.
- [ ] Python bytes representations with single/double quotes and base64 values parse to the expected bytes.
- [ ] Supported UTC timestamp strings with and without fractional seconds parse correctly.
- [ ] A known legacy AES-GCM fixture decrypts using the archive key and passcode as associated data.
- [ ] Wrong associated passcode, wrong key, or tampered encrypted payload fails authentication.
- [ ] Plaintext entries import title, text, timestamps, functional date, sentiment, word count, and import ID.
- [ ] Empty/`nan` titles normalize to an empty string.
- [ ] Empty/`nan` media IDs represent text entries; float-form IDs such as `3.0` resolve to the corresponding media record.
- [ ] Encrypted legacy text with supplied credentials imports as plaintext/unlocked data with a correct word count.
- [ ] Missing decryption credentials imports the source text field with zero words rather than marking it as a currently locked entry (characterize this explicitly).
- [ ] Image imports resolve the basename under the archive's `images/` directory and preserve image bytes.
- [ ] Link imports use the link processor and reject records whose resulting thumbnail path is absent.
- [ ] Specific/theme cross-references become normalized, deduplicated tags.
- [ ] Missing optional tag references are ignored.
- [ ] Reimporting the same import ID for the same user updates the existing entry rather than duplicating it.
- [ ] Reimporting replaces previous entry-tag associations.
- [ ] The same import ID can exist independently for different users.
- [ ] Reimporting with valid credentials can replace an earlier undecrypted text import with readable text.
- [ ] Missing media records/files and unknown media types record per-entry failures while later valid records continue importing.
- [ ] Error output includes relevant entry ID/type and available link/file details.
- [ ] Extracted temporary data is removed on success, cancellation, and failure.

## 13. Import orchestration and progress

Sources: import job manager and import routes.

- [ ] Job creation starts in `running` state with zero counters and no errors.
- [ ] Success/failure recording updates counters and serializes errors correctly.
- [ ] Jobs and cancellation events are isolated by user.
- [ ] Cancellation of a running job sets its event; cancellation of absent/completed jobs returns false.
- [ ] Clearing a job removes its state.
- [ ] The worker reports total rows, successful rows, failures, and final `complete` status.
- [ ] Cancellation before processing the next row sets `cancelled` and stops subsequent processing.
- [ ] A top-level CSV/read failure sets `failed` and records an error.
- [ ] Import file listing creates the imports directory if absent and lists sorted `.zip` filenames only.
- [ ] Starting an import rejects missing bodies/paths, nonexistent files, non-ZIP files, and archives missing required CSVs.
- [ ] Starting another import while the user's job is running returns conflict.
- [ ] A valid archive is extracted and launches a worker with the correct user, passcode, and optional `secret.json` key.
- [ ] Malformed `secret.json` returns an error.
- [ ] Status returns the requesting user's job or not found; cancel reports whether cancellation was requested.

Prefer start → poll → read imported entries and start → cancel → poll workflows through the current API, using bounded polling and controlled fixtures. Do not replace the worker with mocks or test job-manager internals as the migration contract. The counters/state items above describe visible progress outcomes; internal event, thread, and clear/reset mechanics do not need dedicated tests. No importer production changes are in scope.

## 14. Flask hosting behavior (Python-only adapter tests)

Source: `backend/api/app.py`.

- [ ] `/api/version` returns the current version without authentication.
- [ ] Known built frontend assets are served from the configured directory.
- [ ] `/` and client-side deep links fall back to `index.html`.
- [ ] Unregistered `/api` routes return a genuine JSON 404 rather than frontend HTML.
- [ ] A missing frontend build returns the current explanatory 501 response.

These do not need a one-to-one port to Go if Wails replaces HTTP hosting. Replace them with appropriate Wails startup/assets smoke tests.

## 15. Cross-language golden tests and migration acceptance

These reuse the Python cases above, rather than introducing a second unrelated specification.

- [ ] Go opens a synthetic database created by Python and reads identical entries, tags, day tags, and settings.
- [ ] Go verifies an existing Python-created password hash.
- [ ] Go derives the same scrypt bytes and decrypts the same v0/v1 fixtures.
- [ ] Python decrypts new Go-created compatible ciphertext if preserving backward compatibility is a requirement.
- [ ] Both implementations parse the same legacy import fixture to equivalent records and decrypt its AES-GCM payload.
- [ ] Both implementations produce equivalent text processing, pagination, search, activity, and memories results for a fixed dataset.
- [ ] Go edits/locks/rekeys existing entries without losing Unicode, metadata, functional dates, or tag associations.
- [ ] Failed Go password changes preserve the old password and all persisted entries, matching Python rollback behavior.
- [ ] Go resolves existing stored media paths and displays the same underlying bytes.

Compare domain records and outcomes, not Flask response codes, Wails-generated wrapper types, randomized cryptographic output, or implementation-specific error strings.

## Known-gap decisions (reviewed)

The numbering below matches the original fourteen gaps. Only items 1, 5, and 7 are approved future fixes. Keep their new tests separate from the existing passing baseline until those fixes are made. Deferred/accepted behavior does not need new tests locking in bugs.

1. **Entry-tag search — approved fix.** Extend free-text search to entry-level tags as specified in section 6. Do not expand scope to the unused separate tag-filter parameter.
2. **Entry-tag editing — no-op/out of scope.** Tags cannot be created by hand in the supported workflow. Do not implement replacement/clearing or new manual entry-tag editing.
3. **Media deletion — explanation; awaiting direction, no fix approved.** An uploaded image lives at `~/.innerly/static/user-1/abc.png`. Its entry stores `static/abc.png`. Deleting the entry currently appears to join that stored path to the user directory, looking for `~/.innerly/static/user-1/static/abc.png` instead. The database entry disappears but the real image can remain on disk, consuming space and retaining data the user may have expected to delete. This is about physical-file cleanup, not whether the journal card disappears. Do not fix or require cleanup tests without further direction.
4. **File signatures — accepted as-is.** No filename-binding or malformed-signature hardening work.
5. **New password strength — approved fix.** Add the signup-equivalent eight-character minimum to password changes; planned workflow assertions are in section 9.
6. **Malformed client inputs — leave alone.** No broad validation/hardening campaign. Existing clean-error behavior may be covered, but do not add requirements for currently unhandled malformed inputs.
7. **Link safety — approved fix.** Use security best practices for SSRF prevention, redirects/DNS, relative previews, bounded fetches, and graceful errors as specified in section 11. Do not change importer orchestration or data semantics; it continues to use the shared link processor.
8. **Archive safety — frozen.** Do not touch the imports feature or add archive-hardening work.
9. **Cleanup/atomicity — no action.** Do not add cleanup/transaction fixes for import side effects or deleted associations.
10. **Signup and sessions — leave as-is.** Existing Python behavior may have lightweight regression coverage, but it is not a mandatory Go parity contract; signup/token behavior is expected to go away.
11. **Day normalization — accepted as-is.** Exact-timestamp uniqueness and client normalization remain unchanged.
12. **Lock cache — TODO only.** TODO: purge expired lock keys in the background on a recurring timer. No timer implementation or new timer-specific tests in this scope; existing access-time expiration behavior remains the baseline.
13. **Import data protection — frozen.** Do not change imported-entry locking behavior.
14. **Timestamp importer — frozen.** Do not change supported import timestamp formats or offset handling.

## Suggested implementation order

1. Establish an isolated test harness without changing production code; implement a few real journal workflows (create/edit/read/delete, lock/read/rekey, cross-user isolation).
2. Add persisted compatibility fixtures, restart/readback checks, and password-change rollback scenarios.
3. Cover search, day tags, settings, activity/memories, and media through public operations with representative datasets.
4. Separately implement the approved search, password-validation, and link-security fixes in a future task, with behavior tests for each; do not confuse these with test-harness refactors.
5. Characterize the frozen importer through existing archive-to-journal workflows without modifying it.
6. Port these same scenarios to Go/Wails boundaries, retaining data-format compatibility checks and replacing only transport-specific setup/assertions. Signup/token behavior need not survive the migration.

The unchecked items are coverage notes, not a required unit-test count. Combine them into higher-level scenarios, parameterize meaningful input/output examples, and avoid making implementation details part of the contract. If testing appears to require a production refactor, first use an external fixture/process boundary or narrow the test; discuss any unavoidable code change before proceeding.
