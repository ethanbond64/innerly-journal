


from datetime import datetime, timezone
from io import BytesIO
import math
import os
import zipfile

import pandas
from werkzeug.datastructures import FileStorage

from api.models import Entry, upsert_tags
from api.processors.entry_models import TextEntryData
from api.processors.file_processor import process_file_entry
from api.processors.link_processor import process_link_entry
from api.processors.text_processor import sentiment_index_to_value
from api.settings import INNERLY_DIRECTORY


def import_entries(zip_path, user_id, password, passcode):

    # TODO use the real path on the machine...
    test_zip_path = os.path.join(INNERLY_DIRECTORY, "export.zip")
    zip_path = test_zip_path

    # Unzip the zip file contents to ~/.innerly/imports
    import_path = os.path.join(INNERLY_DIRECTORY, "imports/")
    os.makedirs(import_path, exist_ok=True)

    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(import_path)

    # TODO validate passcode against the hash in the user record

    # Read entries csv into a dataframe
    entries = pandas.read_csv(os.path.join(import_path, "entries.csv"))
    media_entries = pandas.read_csv(os.path.join(import_path, "media_entries.csv"))
    specifics = pandas.read_csv(os.path.join(import_path, "specifics.csv"))
    themes = pandas.read_csv(os.path.join(import_path, "themes.csv"))
    entry_specific_xref = pandas.read_csv(os.path.join(import_path, "entry_specific_xref.csv"))
    entry_theme_xref = pandas.read_csv(os.path.join(import_path, "entry_theme_xref.csv"))

    for _, entry in entries.iterrows():        
        media_entry_id = entry["media_entry_id"]

        # Common values
        created_on = parse_utc_datetime(entry["created_on"])
        updated_on = parse_utc_datetime(entry["updated_on"])
        functional_datetime = parse_utc_datetime(entry["functional_timestamp"])
        title = entry["title"]
        title = "" if title is None or (isinstance(title, str) and title.lower() == "nan") or (isinstance(title,float) and math.isnan(title)) else title

        # Text entry
        if media_entry_id is None or media_entry_id == "" or math.isnan(media_entry_id):
            sentiment = sentiment_index_to_value(entry["sentiment_idx"])
            
            if entry["locked"] == True:
                print("Locked entries not supported yet")
                text = ""
            else:
                text = entry["text"]
            
            # Create new entry row data
            entry_type = "text"
            entry_data = TextEntryData(title, text, sentiment).json()

        # General media entry
        else:
            media_entry = media_entries[media_entries["id"] == int(media_entry_id)].iloc[0]
            # if media_entry is None:
            #     continue
            media_entry_type = media_entry["media_type"]

            # Link entry
            if media_entry_type == "link":
                # original_path = media_entry["thumbnail_img"]
                # # TODO write to images folder in .innerly, save path below
                # path = ""
                # file_type = path.split(".")[-1]
                link = media_entry["link"]
                entry_type = "link"
                entry_data, _tags = process_link_entry(user_id, link)
                if entry_data.get("path") is None: 
                    continue
                # # Create new entry row data
                # entry_type = "link"
                # entry_data = LinkEntryData(title, path, original_path, file_type, link).json()

            # File entry
            elif media_entry_type == "image_upload_s3":
                filename = media_entry["thumbnail_img"].replace("imgs/","")
                # # TODO write to images folder in .innerly, save path below
                # path = ""
                # file_type = path.split(".")[-1]
                file_content = "application/octet-stream"
                filepath = os.path.join(import_path, "images", filename)
                with open(filepath, 'rb') as f:
                    file_content = f.read()
                stream = BytesIO(file_content)
                file = FileStorage(stream=stream, filename=filepath.split('/')[-1])
                entry_data, _tags = process_file_entry(user_id, file)
                # Create new entry row data
                entry_type = "file"
                # entry_data = FileEntryData(title, path, file_type).json()

            else:
                print("unknow media type:", media_entry_type)
                raise NotImplementedError()
            
        # Create the row and save to the db
        new_entry = Entry()
        new_entry.created_on = created_on
        new_entry.updated_on = updated_on
        new_entry.user_id = user_id
        new_entry.functional_datetime = functional_datetime
        new_entry.entry_type = entry_type
        new_entry.entry_data = entry_data
        new_entry.save()

        print(new_entry.json())

        tags = []
        entry_id = entry["id"]

        # Tags from specifics
        specific_xref_rows = entry_specific_xref[entry_specific_xref["entry_id"] == entry_id]
        specific_ids = set(specific_xref_rows["specific_id"])
        specific_rows = specifics[specifics["id"].isin(specific_ids)]
        specifics_values = set(specific_rows["title"])
        tags.extend(specifics_values)

        # Tags from themes
        theme_xref_rows = entry_theme_xref[entry_theme_xref["entry_id"] == entry_id]
        theme_ids = set(theme_xref_rows["theme_id"])
        theme_rows = themes[themes["id"].isin(theme_ids)]
        themes_values = set(theme_rows["title"])
        tags.extend(themes_values)

        # Save and link tags
        print("Upserting tags:", tags)
        upsert_tags(tags, user_id, new_entry.id)

    print("complete")

def parse_utc_datetime(datetime_str: str) -> datetime:
    # Remove the timezone part (e.g. '+00') by splitting on the plus sign.
    dt_without_offset = datetime_str.rsplit("+", 1)[0]
    # Parse the remaining datetime string.
    pattern = "%Y-%m-%d %H:%M:%S" + (".%f" if "." in datetime_str else "")
    dt = datetime.strptime(dt_without_offset, pattern)
    # Attach the UTC timezone.
    return dt.replace(tzinfo=timezone.utc)