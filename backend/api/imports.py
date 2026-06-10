import csv
import math
import os
import shutil
import tempfile
import threading
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from io import BytesIO

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from werkzeug.datastructures import FileStorage

from api.extensions import db
from api.models import Entry, EntryTagXref, upsert_tags
from api.processors.entry_models import TextEntryData
from api.processors.file_processor import process_file_entry
from api.processors.link_processor import process_link_entry
from api.processors.text_processor import sentiment_index_to_value


@dataclass
class ImportFailure:
    entry_id: str
    entry_type: str
    error: str
    link: str = None
    file: str = None
    file_resolved_path: str = None

    def json(self):
        result = {"entry_id": self.entry_id, "entry_type": self.entry_type, "error": self.error}
        if self.link:
            result["link"] = self.link
        if self.file:
            result["file"] = self.file
        if self.file_resolved_path:
            result["file_resolved_path"] = self.file_resolved_path
        return result

    def log(self):
        parts = [f"  FAILED entry {self.entry_id} ({self.entry_type}): {self.error}"]
        if self.link:
            parts.append(f"    link: {self.link}")
        if self.file:
            parts.append(f"    thumbnail_img: {self.file}")
        if self.file_resolved_path:
            parts.append(f"    resolved path: {self.file_resolved_path}")
        print("\n".join(parts))


@dataclass
class ImportJobState:
    status: str = "running"
    total: int = 0
    processed: int = 0
    failures: int = 0
    errors: list = field(default_factory=list)

    def record_success(self):
        self.processed += 1

    def record_failure(self, failure):
        self.failures += 1
        self.errors.append(failure)

    def json(self):
        return {
            "status": self.status,
            "total": self.total,
            "processed": self.processed,
            "failures": self.failures,
            "errors": [e.json() for e in self.errors],
        }


class ImportJobManager:
    """Thread-safe manager for import jobs, keyed by user_id."""

    def __init__(self):
        self._lock = threading.Lock()
        self._jobs = {}  # user_id -> { "state": ImportJobState, "thread": Thread, "cancel": Event }

    def get(self, user_id):
        with self._lock:
            job = self._jobs.get(user_id)
            return job["state"] if job else None

    def is_running(self, user_id):
        with self._lock:
            job = self._jobs.get(user_id)
            return job is not None and job["state"].status == "running"

    def create(self, user_id, thread):
        cancel_event = threading.Event()
        state = ImportJobState()
        with self._lock:
            self._jobs[user_id] = {
                "state": state,
                "thread": thread,
                "cancel": cancel_event,
            }
        return state, cancel_event

    def cancel(self, user_id):
        with self._lock:
            job = self._jobs.get(user_id)
            if job and job["state"].status == "running":
                job["cancel"].set()
                return True
            return False

    def get_cancel_event(self, user_id):
        with self._lock:
            job = self._jobs.get(user_id)
            return job["cancel"] if job else None

    def clear(self, user_id):
        with self._lock:
            self._jobs.pop(user_id, None)


import_jobs = ImportJobManager()

REQUIRED_CSVS = [
    "entries.csv",
    "media_entries.csv",
    "specifics.csv",
    "themes.csv",
    "entry_specific_xref.csv",
    "entry_theme_xref.csv",
]


def validate_zip(zip_path):
    """Validate that the ZIP contains all required CSVs."""
    with zipfile.ZipFile(zip_path, 'r') as zf:
        names = zf.namelist()
        missing = [f for f in REQUIRED_CSVS if f not in names]
        if missing:
            return False, f"Missing required files: {', '.join(missing)}"
    return True, None


def read_csv_rows(path):
    """Read a CSV file and return a list of dicts."""
    with open(path, 'r', newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))


def import_entries(extract_path, user_id, passcode, job_state, cancel_event):
    """Import entries from an extracted ZIP directory. Runs in a background thread."""

    # TODO: validate passcode against the hash in the user record

    try:
        entries = read_csv_rows(os.path.join(extract_path, "entries.csv"))
        media_entries_list = read_csv_rows(os.path.join(extract_path, "media_entries.csv"))
        specifics = read_csv_rows(os.path.join(extract_path, "specifics.csv"))
        themes = read_csv_rows(os.path.join(extract_path, "themes.csv"))
        entry_specific_xref = read_csv_rows(os.path.join(extract_path, "entry_specific_xref.csv"))
        entry_theme_xref = read_csv_rows(os.path.join(extract_path, "entry_theme_xref.csv"))

        # Index media entries by id for fast lookup
        media_by_id = {row["id"]: row for row in media_entries_list}

        # Index tag tables
        specifics_by_id = {row["id"]: row["title"] for row in specifics}
        themes_by_id = {row["id"]: row["title"] for row in themes}

        job_state.total = len(entries)

        for row in entries:
            if cancel_event.is_set():
                job_state.status = "cancelled"
                break

            try:
                entry_id = row["id"]
                media_entry_id = row.get("media_entry_id", "")

                created_on = parse_utc_datetime(row["created_on"])
                updated_on = parse_utc_datetime(row["updated_on"])
                functional_datetime = parse_utc_datetime(row["functional_timestamp"])

                title = row.get("title", "")
                if not title or title.lower() == "nan":
                    title = ""

                is_media = media_entry_id and media_entry_id.lower() != "nan"
                # Handle float-like strings (e.g. "3.0") from CSV
                if is_media:
                    try:
                        float_val = float(media_entry_id)
                        is_media = not math.isnan(float_val)
                    except (ValueError, TypeError):
                        is_media = False

                if not is_media:
                    # Text entry
                    sentiment = sentiment_index_to_value(int(float(row.get("sentiment_idx", 1))))
                    locked = row.get("locked", "").lower() == "true"

                    if locked:
                        # TODO: use passcode to decrypt locked entry text via unlockText()
                        text = ""
                    else:
                        text = row.get("text", "")

                    entry_type = "text"
                    entry_data = TextEntryData(title, text, sentiment).json()
                else:
                    # Media entry
                    media_id_key = str(int(float(media_entry_id)))
                    media_entry = media_by_id.get(media_id_key)
                    if media_entry is None:
                        raise ValueError(f"Media entry {media_id_key} not found")

                    media_type = media_entry["media_type"]

                    if media_type == "link":
                        link = media_entry["link"]
                        entry_type = "link"
                        entry_data, _tags = process_link_entry(user_id, link)
                        if entry_data.get("path") is None:
                            raise ValueError(f"Failed to fetch link: {link}")

                    elif media_type == "image_upload_s3":
                        raw_thumbnail = media_entry.get("thumbnail_img", "")
                        filename = os.path.basename(raw_thumbnail)
                        if not filename:
                            raise ValueError(f"Empty filename after cleaning thumbnail_img: '{raw_thumbnail}'")

                        filepath = os.path.join(extract_path, "images", filename)
                        if not os.path.isfile(filepath):
                            raise FileNotFoundError(f"Image not found at '{filepath}' (thumbnail_img: '{raw_thumbnail}')")

                        file_size = os.path.getsize(filepath)
                        print(f"  Processing file entry: {filename} ({file_size} bytes)")

                        with open(filepath, 'rb') as f:
                            file_content = f.read()
                        stream = BytesIO(file_content)
                        file = FileStorage(stream=stream, filename=filename)
                        entry_data, _tags = process_file_entry(user_id, file)
                        entry_type = "file"

                    else:
                        raise ValueError(f"Unknown media type: {media_type}")

                # Tag import_id into entry_data
                entry_data["import_id"] = entry_id

                # Check for existing imported entry
                existing = Entry.query.filter(
                    Entry.user_id == user_id,
                    Entry.entry_data.op('->>')('import_id') == str(entry_id),
                ).first()

                if existing:
                    existing.created_on = created_on
                    existing.updated_on = updated_on
                    existing.functional_datetime = functional_datetime
                    existing.entry_type = entry_type
                    existing.update(entry_data=entry_data)
                    existing.save()
                    target_entry = existing

                    # Clear old tag xrefs so they get replaced
                    EntryTagXref.query.filter(EntryTagXref.entry_id == existing.id).delete()
                    db.session.commit()
                else:
                    new_entry = Entry()
                    new_entry.created_on = created_on
                    new_entry.updated_on = updated_on
                    new_entry.user_id = user_id
                    new_entry.functional_datetime = functional_datetime
                    new_entry.entry_type = entry_type
                    new_entry.entry_data = entry_data
                    new_entry.save()
                    target_entry = new_entry

                # Resolve and save tags
                tags = set()

                for xref in entry_specific_xref:
                    if xref["entry_id"] == entry_id:
                        tag_name = specifics_by_id.get(xref["specific_id"])
                        if tag_name:
                            tags.add(tag_name)

                for xref in entry_theme_xref:
                    if xref["entry_id"] == entry_id:
                        tag_name = themes_by_id.get(xref["theme_id"])
                        if tag_name:
                            tags.add(tag_name)

                if tags:
                    upsert_tags(tags, user_id, target_entry.id)

                job_state.record_success()

            except Exception as e:
                db.session.rollback()

                failure = ImportFailure(
                    entry_id=row.get("id"),
                    entry_type="text",
                    error=str(e),
                )

                raw_media_id = row.get("media_entry_id", "")
                try:
                    mid = str(int(float(raw_media_id)))
                    me = media_by_id.get(mid)
                    if me:
                        failure.entry_type = me["media_type"]
                        if me["media_type"] == "link":
                            failure.link = me.get("link")
                        elif me["media_type"] == "image_upload_s3":
                            raw_thumb = me.get("thumbnail_img", "")
                            failure.file = raw_thumb
                            failure.file_resolved_path = os.path.join(extract_path, "images", os.path.basename(raw_thumb))
                except (ValueError, TypeError):
                    pass

                failure.log()
                job_state.record_failure(failure)

        if job_state.status != "cancelled":
            job_state.status = "complete"

    except Exception as e:
        job_state.status = "failed"
        failure = ImportFailure(entry_id=None, entry_type=None, error=f"Import failed: {str(e)}")
        failure.log()
        job_state.record_failure(failure)

    finally:
        # Clean up extracted files
        if os.path.exists(extract_path):
            shutil.rmtree(extract_path, ignore_errors=True)

        print(f"\n--- Import {job_state.status} ---")
        print(f"  Total:     {job_state.total}")
        print(f"  Imported:  {job_state.processed}")
        print(f"  Failed:    {job_state.failures}")
        if job_state.errors:
            print(f"\n  Failures:")
            for f in job_state.errors:
                f.log()


def parse_utc_datetime(datetime_str):
    """Parse a datetime string like '2024-01-15 12:30:00+00' into a UTC datetime."""
    dt_without_offset = datetime_str.rsplit("+", 1)[0]
    pattern = "%Y-%m-%d %H:%M:%S" + (".%f" if "." in datetime_str else "")
    dt = datetime.strptime(dt_without_offset, pattern)
    return dt.replace(tzinfo=timezone.utc)


def get_aes_key(keyname):
    # s3_object = s3.get_object(Bucket=KEY_BUCKET, Key=keyname)
    # body = s3_object["Body"]
    # return body.read()
    with open(keyname, "rb") as f:
        return f.read()


def decrypt(key, associated_data, iv, ciphertext, tag):
    # Construct a Cipher object, with the key, iv, and additionally the
    # GCM tag used for authenticating the message.
    decryptor = Cipher(
        algorithms.AES(key),
        modes.GCM(iv, tag),
    ).decryptor()

    # We put associated_data back in or the tag will fail to verify
    # when we finalize the decryptor.
    decryptor.authenticate_additional_data(associated_data)

    # Decryption gets us the authenticated plaintext.
    # If the tag does not match an InvalidTag exception will be raised.
    return decryptor.update(ciphertext) + decryptor.finalize()


# All arguments other than passcode are from the row itself
def unlockText(keyname, iv, cipher_text, tag, passcode):
    # decrypt and save plaintext
    key = get_aes_key(keyname)
    locked_auth = str(passcode).encode("utf8")
    textBytes = decrypt(key, locked_auth, iv, cipher_text, tag)
    return textBytes.decode("utf8")
