# Python-to-Go Migration Test Inventory

## Purpose and scope

Build a Python regression suite first, then port the behavioral assertions and fixtures to Go so the Wails migration can be driven by tests.

This is a proposed inventory based on the current source, not an implemented or executed suite. The main checklist describes behavior supported by the implementation and expected to pass today; implementation may uncover additional defects. No item is marked passing until it has actually run.

Use Python tests for backend/domain behavior. React rendering, autosave timing, typewriter scrolling, browser-local settings, and navigation need a separate JavaScript or end-to-end suite; Python backend tests cannot adequately certify them.

## Test strategy and shared fixtures

- [ ] Use pytest with isolated temporary SQLite databases and temporary media/import directories; never read or modify a real journal.
- [ ] Supply a test configuration before importing application modules (settings currently reads `~/.innerly/config.json` at import time).
- [ ] Exercise HTTP behavior with Flask's test client; test processing and encryption functions directly where appropriate.
- [ ] Create two ordinary users and an admin for authorization/isolation cases.
- [ ] Reset the global lock-key cache, import job manager, and invitation/share state between tests.
- [ ] Use a controlled clock for token expiry, file-signature expiry, and lock-key expiry instead of sleeping.
- [ ] Mock outbound HTTP, thread launching where needed, and network failures; no public websites required.
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
- [ ] Saving a model persists it and assigns an ID and creation/update timestamps.
- [ ] Updating JSON data persists the changes across sessions.
- [ ] Deleting a model removes its row.
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

Physical-file cleanup and tag-replacement behavior need decisions; see the gaps section below.

## 6. Entry listing, search, activity, and memories

Source: fetch routes in `backend/api/views.py`.

- [ ] Entry lists only contain the current user's entries.
- [ ] Entries are ordered by descending functional datetime.
- [ ] Limit/offset pagination returns the expected subset of distinct-datetime fixtures.
- [ ] List results use short text previews and signed local media URLs.
- [ ] An empty journal returns an empty list.
- [ ] Search matches titles and unlocked text case-insensitively.
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

- [ ] Entry-tag insertion lowercases and deduplicates names within a single call.
- [ ] Existing tags are reused for that user rather than duplicated.
- [ ] Empty/absent entry-tag lists create no associations.
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
- [ ] Locking copies entry data, preserves metadata, and adds the lock flag/version without mutating the supplied data object.
- [ ] Locked creation stores ciphertext, never the submitted plaintext, while returning plaintext to the writer with `text_unlocked: true`.
- [ ] Locking an unlocked text entry persists ciphertext; locking an already locked entry leaves it unchanged.
- [ ] File/link entries cannot be locked through the lock endpoint.
- [ ] Lock operations reject another user's entry or a missing entry.
- [ ] A valid cached key permits locking without resubmitting a password.
- [ ] A missing/expired key with no valid password returns the `lock-auth-expired` marker.
- [ ] Re-authentication with the correct password refreshes the cache; a wrong password does not provide a usable key.
- [ ] Cache entries are isolated by user and clearing one user's key leaves the other user's key intact.
- [ ] Valid account settings control newly cached key expiration.
- [ ] Fetching locked text with a password returns plaintext but leaves the database encrypted.
- [ ] Fetching locked text without a password returns ciphertext; password fetch rejects missing/wrong passwords.
- [ ] Password-based reads require actual password authentication even when a write key is cached.
- [ ] Editing locked plaintext re-encrypts it at rest, preserves lock metadata, and returns the updated plaintext to the writer.
- [ ] Submitting ciphertext back as an edit to a locked entry is rejected, leaving persisted data unchanged.
- [ ] Permanently unlocking an entry writes plaintext and sets `locked: false`.
- [ ] Ciphertext-prefix detection recognizes the existing stored format without misidentifying ordinary text.
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

New-password strength validation is currently missing from this endpoint; do not assume it matches signup validation.

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
- [ ] Direct deletion of an existing filename in a user directory succeeds; a nonexistent filename returns false.
- [ ] A valid file signature resolves to its user; one older than twelve hours does not.
- [ ] File serving requires a signature and serves the correct file from the resolved user's directory.
- [ ] A valid signature with a nonexistent filename returns not found.

Malformed signatures, filename binding, and route-driven deletion require fixes/decisions below rather than optimistic passing assertions.

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

Use mocked HTTP responses and a small injected response cap for boundary tests. Avoid real network requests and Wikipedia sleeps.

## 12. Legacy import parsing and archive compatibility

Source: `backend/api/imports.py`.

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

Test most worker behavior synchronously with deterministic cancellation events. Reserve a small integration test for real background-thread/application-context execution.

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

## Known gaps / decisions — not expected-pass requirements today

Review these before implementing tests. Fix them in Python first if they should become part of the migration contract; do not enshrine unsafe behavior merely to obtain a green baseline.

- [ ] **Tag filtering/search:** the list endpoint reads `tag` but does not apply it; search currently matches title/unlocked text, not tags despite its comment.
- [ ] **Entry-tag editing:** updates append associations rather than replacing old ones; adding an already-associated tag can violate the uniqueness constraint. Empty tags do not currently clear old associations.
- [ ] **Media deletion:** stored paths include `static/`, but deletion joins that path inside an already user-specific static directory, so route-driven physical-file deletion appears incorrect.
- [ ] **File signatures:** signing embeds a filename, but validation only extracts user/time, so a signature is not bound to the requested filename. Malformed signatures may raise exceptions rather than return a clean authorization error.
- [ ] **New password strength:** password-change validation does not enforce signup's minimum length.
- [ ] **Malformed inputs:** unknown entry types, malformed insert datetimes, missing Content-Type, non-object JSON, invalid field types, empty filenames, and extreme TTL values are not consistently handled as clean client errors.
- [ ] **Link safety:** HTTP(S)-only checks do not block private/internal hosts; URL/redirect restrictions need an SSRF policy. Relative thumbnail URLs and unsupported downloaded image formats also need defined behavior.
- [ ] **Archive safety:** required-file validation is not a complete policy for untrusted ZIPs (paths, symlinks, decompression size, and resource limits). Import source paths should be explicitly confined to the imports directory.
- [ ] **Cleanup/atomicity:** malformed archive secrets can leave extracted temporary directories; import file/tag side effects and deleted entry associations need cleanup guarantees.
- [ ] **Signup and sessions:** decide whether open signup, admin/share behavior, five-day tokens, and existing tokens after password changes belong in a local desktop app.
- [ ] **Day normalization:** day-tag uniqueness is based on exact timestamps; local-day-at-23:59 normalization currently relies on the client rather than server enforcement.
- [ ] **Lock cache:** expired keys are removed on access rather than proactively; process restarts clear caches. Decide desktop lock/logout and key-memory cleanup semantics explicitly.
- [ ] **Import data protection:** imported text is not automatically locked, even with lock-by-default enabled. Decide whether this is acceptable for the migrated app.
- [ ] **Timestamp importer:** the legacy parser assumes supported UTC input rather than generally converting arbitrary timezone offsets. Decide whether to expand support.

## Suggested implementation order

1. Encryption/hash golden fixtures, locked persistence, and transactional password changes.
2. SQLite/schema compatibility, user isolation, and basic entry CRUD.
3. Text processing, queries, tags/day tags, settings, and activity/memories.
4. Images, signatures, Open Graph, and deterministic HTTP failure cases.
5. Legacy importer and progress/cancellation.
6. Thin Flask adapter tests, then Go/Wails adapter replacements.

The unchecked items are a review checklist, not a claim that each must become a separate test function. Parameterize closely related cases and keep fixture datasets small.
