# Import Refactor Plan

## Goal

Remove the broken link batch import. Productize the ZIP import with a real UI, proper auth, per-entry error handling, and progress tracking via polling.

---

## 1. Remove Link Batch Import

- Delete `backend/api/tasks.py`
- Remove the `POST /submit/task/<task>` route from `views.py`
- Remove any imports of `tasks.py` in `views.py`

## 2. Refactor ZIP Import Backend

### New route: `POST /api/import`

- Requires `@login_required`; uses `current_user` from auth (no hardcoded user ID)
- Accepts a multipart file upload (the `.zip` file) — no more hardcoded path
- Validates the file is a ZIP before proceeding
- Extracts to a temp directory (not a fixed `~/.innerly/imports/`)
- Validates that all six expected CSVs exist inside the ZIP
- Stores import job state in a module-level dict keyed by `user_id`:
  ```python
  import_jobs = {}
  # import_jobs[user_id] = {
  #   "status": "running" | "complete" | "failed",
  #   "total": int,
  #   "processed": int,
  #   "failures": int,
  #   "errors": [str]   # short error descriptions per failed entry
  # }
  ```
- Spawns a background thread to process entries (same as today, but refactored — see below)
- Returns `200 { "started": true, "total": <n> }` immediately

### New route: `GET /api/import/status`

- Requires `@login_required`
- Returns the current state of `import_jobs[current_user]` as JSON
- Returns `404` if no job exists for this user

### Refactor `imports.py`

- `import_entries(extract_path, user_id, passcode, job_state)` — takes the already-extracted temp dir path, user ID, passcode, and the shared `job_state` dict
- Wrap each entry iteration in try/except:
  - On success: `db.session.commit()`, increment `job_state["processed"]`
  - On failure: `db.session.rollback()`, increment `job_state["failures"]`, append error string to `job_state["errors"]`
- `# TODO: validate passcode against user record` — keep this TODO at the top
- `# TODO: use passcode to decrypt locked entry text via unlockText()` — add this TODO where locked entries are currently skipped
- Set `job_state["status"] = "complete"` when done (or `"failed"` if the whole job blows up)
- Clean up the temp extraction directory on completion
- Remove the unused `password` parameter
- Remove pandas dependency — use `csv.DictReader` (standard lib) instead

## 3. Settings Page — Import UI

Add a new "Import" section to `settings-page.jsx` below the existing sections.

### States

1. **Idle** — file input (`accept=".zip"`) + "Import" button (disabled until file selected)
2. **Uploading** — button shows spinner, disabled
3. **In Progress** — progress bar showing `processed / total`, polls `GET /api/import/status` every 5 seconds via `setInterval`, clears interval on unmount or completion
4. **Complete** — success message with count of imported entries; if failures > 0, show "N entries failed to import" warning
5. **Error** — error message if the upload itself fails

### Implementation

- Add `importEntries(file)` to the frontend requests module — `POST /api/import` with `FormData`
- Add `getImportStatus()` to the frontend requests module — `GET /api/import/status`
- On mount, call `getImportStatus()` once — if a job is already running, resume showing the progress bar and start polling (handles page refresh mid-import)

## 4. Cleanup

- Remove dead AES helper functions from `imports.py` that aren't used (`get_aes_key`, `decrypt`) — keep `unlockText` since it will be needed for the passcode TODO
- Remove the old `GET /import` route and `import_entries_wrapper` from `views.py`
- Delete `~/.innerly/imports/` handling (replaced by temp dirs)

---

## Files Changed

| File | Action |
|---|---|
| `backend/api/tasks.py` | Delete |
| `backend/api/views.py` | Remove task route, replace import route with POST + status GET |
| `backend/api/imports.py` | Refactor: real params, per-entry commits, progress tracking, csv stdlib |
| `frontend/src/settings-page.jsx` | Add import section with file picker + progress bar |
| `frontend/src/requests.js` | Add `importEntries()` and `getImportStatus()` |
