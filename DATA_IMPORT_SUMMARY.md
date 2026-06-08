# Data Import Feature — Executive Summary

## Overview

The app contains two distinct import mechanisms: a **ZIP archive import** for bulk-migrating journal history from a prior version of the app, and a **link batch import** for creating multiple link-type entries from a list of URLs. Neither is production-ready.

## ZIP Archive Import (`/api/import` → `imports.py`)

**What it does:** Reads a structured ZIP file containing CSVs and images, reconstructs all entry types (text, link, image), preserves original timestamps and tags, and writes everything to the local SQLite database.

**How it works:** A GET request to `/api/import` spawns a background thread that extracts the ZIP to `~/.innerly/imports/`, reads six CSV files into pandas DataFrames, then iterates each row—creating text entries directly, fetching OpenGraph metadata for link entries, and reading image files from the extracted archive for image entries. Tags are resolved via cross-reference tables joining entries to "specifics" and "themes."

**Expected file:** A `.zip` archive (hardcoded to `~/.innerly/export.zip`) containing:

| File | Purpose |
|---|---|
| `entries.csv` | One row per journal entry (id, timestamps, title, text, sentiment, locked flag, media ref) |
| `media_entries.csv` | Media metadata — `media_type` is `"link"` or `"image_upload_s3"`, plus URL or image path |
| `specifics.csv` / `themes.csv` | Tag definitions (id + title) |
| `entry_specific_xref.csv` / `entry_theme_xref.csv` | Entry-to-tag join tables |
| `images/` directory | Image files referenced by `media_entries.csv` (`jpg`, `jpeg`, `png`, `gif`) |

## Link Batch Import (`/api/submit/task/<task>` → `tasks.py`)

Accepts a JSON body with a list of URLs, fetches OpenGraph metadata for each, and creates link-type entries. This path is **broken at runtime** — it passes a `tags` kwarg to the `Entry` constructor that doesn't exist on the model, causing a silent failure.

## Completeness Assessment: Proof of Concept

This is a **developer-facing migration script**, not a finished feature. Key evidence:

- **Hardcoded user ID** (`current_user = 7`) and no authentication on the route
- **Hardcoded ZIP path** — the `zip_path` parameter is accepted but immediately overwritten
- **Unused parameters** — `password` and `passcode` are passed through but never used; a TODO notes that passcode validation against user records was never implemented
- **No frontend UI** — no import button, settings page entry, or app route exists; the endpoint can only be triggered by hitting the URL directly
- **Locked entries skipped** — entries marked as locked are imported with empty text and a `print()` statement instead of proper handling
- **Fragile error handling** — unknown media types crash the import thread via `NotImplementedError`; failed link entries are silently skipped
- **CORS wide open** (`origins: "*"`) with a comment questioning whether to restrict it

The day-to-day single-entry creation (pasting a link or uploading an image from the UI) works and is production-quality. The bulk import paths are not.
