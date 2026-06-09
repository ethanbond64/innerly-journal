import csv
import math
import os
import shutil
import tempfile
import zipfile
from datetime import datetime, timezone
from io import BytesIO

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from werkzeug.datastructures import FileStorage

from api.extensions import db
from api.models import Entry, upsert_tags
from api.processors.entry_models import TextEntryData
from api.processors.file_processor import process_file_entry
from api.processors.link_processor import process_link_entry
from api.processors.text_processor import sentiment_index_to_value

# In-memory job state, keyed by user_id
import_jobs = {}

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


def import_entries(extract_path, user_id, passcode, job_state):
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

        job_state["total"] = len(entries)

        for row in entries:
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
                        filename = media_entry["thumbnail_img"].replace("imgs/", "")
                        filepath = os.path.join(extract_path, "images", filename)
                        with open(filepath, 'rb') as f:
                            file_content = f.read()
                        stream = BytesIO(file_content)
                        file = FileStorage(stream=stream, filename=filename)
                        entry_data, _tags = process_file_entry(user_id, file)
                        entry_type = "file"

                    else:
                        raise ValueError(f"Unknown media type: {media_type}")

                # Create and commit the entry
                new_entry = Entry()
                new_entry.created_on = created_on
                new_entry.updated_on = updated_on
                new_entry.user_id = user_id
                new_entry.functional_datetime = functional_datetime
                new_entry.entry_type = entry_type
                new_entry.entry_data = entry_data
                new_entry.save()

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
                    upsert_tags(tags, user_id, new_entry.id)

                job_state["processed"] += 1

            except Exception as e:
                db.session.rollback()
                job_state["failures"] += 1
                job_state["errors"].append(f"Entry {row.get('id', '?')}: {str(e)}")

        job_state["status"] = "complete"

    except Exception as e:
        job_state["status"] = "failed"
        job_state["errors"].append(f"Import failed: {str(e)}")

    finally:
        # Clean up extracted files
        if os.path.exists(extract_path):
            shutil.rmtree(extract_path, ignore_errors=True)


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
