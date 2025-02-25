import math
import os
import threading
import uuid
from datetime import datetime, timezone
import zipfile
from flask import Blueprint, request, send_from_directory, current_app

from io import BytesIO
from werkzeug.datastructures import FileStorage
import pandas
from sqlalchemy import Boolean, String, and_, cast, or_

from api.security import authenticated, encrypt_password, get_token, get_user_from_signature, lock_text, login_required, sign_filename, unlock_text, validate_email, validate_password
from api.models import EntryTagXref, User, Entry, Tag, get_datetime
from api.processors.text_processor import process_text_entry, sentiment_index_to_value
from api.processors.file_processor import delete_file, get_user_directory, process_file_entry
from api.processors.link_processor import process_link_entry
from api.tasks import submitImportEntriesTask
from api.processors.entry_models import FileEntryData, LinkEntryData, TextEntryData
from api.settings import INNERLY_DIRECTORY

views = Blueprint('views', __name__)

UNZIPPED_PATH = "~/.innerly/imports/"
SHARE_INIIAL = "todo"
TAG_LIMIT = 32

share_transient = SHARE_INIIAL

@views.route('/version', methods=['GET'])
def index():
    return {'version': '1.0.0'}, 200

@views.route('/share', methods=['GET'])
@login_required
def share(current_user):

    if not current_user.admin:
        return {'message': 'Unauthorized'}, 401

    new_share = str(uuid.uuid4())
    global share_transient
    share_transient = new_share
    return {'share': new_share}, 200

@views.route('/signup', methods=['POST'])
def signup():

    body = request.get_json()
    if body is None:
        return {'message': 'Bad request'}, 400
    
    email = body.get('email')
    password = body.get('password')
    share = body.get('share', None)

    # if share is None or share != share_transient:
    #     return {'message': 'Unauthorized'}, 401

    if email is None or password is None:
        return {'message': 'Email or password missing'}, 400
    
    if not validate_email(email):
        return {'message': 'Invalid email'}, 400
    
    if not validate_password(password):
        return {'message': 'Invalid Password. Password must be at least 8 characters.'}, 400
    
    user = User.query.filter(User.email == email).first()
    if user is not None:
        return {'message': 'User: ' + email + ' already exists.'}, 409
    
    # Check to see if first user, if so, make admin
    user_exists = User.query.first()

    new_user = User(email=email, password_hash=encrypt_password(password), admin=(user_exists == None))
    new_user.save()

    token = get_token(new_user)

    return {'token': token, 'user': new_user.json()}, 201

@views.route('/login', methods=['POST'])
def login():

    body = request.get_json()
    if body is None:
        return {'message': 'Bad request'}, 400
    
    email = body.get('email')
    password = body.get('password')
    if email is None or password is None:
        return {'message': 'Bad request'}, 400
    
    user = User.query.filter(User.email == email).first()
    if user is None or not authenticated(user, password):
        return {'message': 'Unauthorized'}, 401
    
    token = get_token(user)

    return {'token': token, 'user': user.json()}, 200

@views.route('/update_password', methods=['POST'])
@login_required
def reset_password(current_user):

    body = request.get_json()
    if body is None:
        return {'message': 'Bad request'}, 400
    
    current_password = body.get('current_password')
    new_password = body.get('new_password')
    if current_password is None or new_password is None:
        return {'message': 'Bad request missing old or new password.'}, 400
    
    if not authenticated(current_user, current_password):
        return {'message': 'Current password incorrect.'}, 401
    
    current_user.password_hash = encrypt_password(new_password)
    current_user.save()

    return {'success': True}, 200

@views.route('/update/users/<int:id>', methods=['POST'])
@login_required
def update_user(current_user, id):

    if current_user.id != id and not current_user.admin:
        return {'message': 'Unauthorized'}, 401
    
    user = User.query.filter(User.id == id).first()

    if user is None:
        return {'message': 'User not found'}, 404
    
    body = request.get_json()
    if body is None:
        return {'message': 'Bad request'}, 400
    
    # Only thing to update is user settings
    input_settings = body.get('settings')
    if input_settings is not None:
        update_settings = user.settings

        # Sqlite treats initial empty json object as a string.
        if update_settings == '{}':
            update_settings = {}

        if 'sensitivity' in input_settings and input_settings['sensitivity'] in ['default', 'blur', 'both']:
            update_settings['sensitivity'] = input_settings['sensitivity']
        # TODO passcode
            
        user.update(settings=update_settings)
        user.save()

    return {'data': user.json()}, 200

@views.route('/insert/entries', methods=['POST'])
@login_required
def insert_entry(current_user):

    body = None
    file = None

    if request.content_type.startswith('application/json'):
        body = request.get_json()

    elif request.content_type.startswith('multipart/form-data'):
        body = request.form.to_dict()
        file = request.files.get('file')

    else:
        return {'message': 'Bad request. Invalid content type.'}, 400

    if body is None:
        return {'message': 'Bad request'}, 400
    
    entry_type = body.get('entry_type')
    
    if entry_type is None:
        return {'message': 'Invalid entry type'}, 400
    
    entry_data = body.get('entry_data')
    tags = []

    if entry_type == 'text':
        
        if entry_data is None:
            return {'message': 'Entry data missing'}, 400
        
        entry_data, tags = process_text_entry(entry_data)

    elif entry_type == 'file':
        
        if file is None:
            return {'message': 'No file attached'}, 400
        
        entry_data, tags = process_file_entry(current_user.id, file)

    elif entry_type == 'link':
        
        if entry_data is None:
            return {'message': 'Entry data missing'}, 400
        
        link = entry_data.get('link')
        
        if link is None:
            return {'message': 'Bad request. Missing link.'}, 400
        
        entry_data, tags = process_link_entry(current_user.id, link)

    functional_datetime = body.get('functional_datetime')
    if functional_datetime is not None:
        functional_datetime = datetime.strptime(functional_datetime, '%Y-%m-%dT%H:%M:%S.%fZ')

    new_entry = Entry(user_id=current_user.id, entry_type=entry_type, entry_data=entry_data, functional_datetime=functional_datetime)
    new_entry.save()

    upsert_tags(tags, current_user.id, new_entry.id)

    return {'data': new_entry.json(signer=sign_filename)}, 201

@views.route('/update/entries/<int:id>', methods=['POST'])
@login_required
def update_entry(current_user, id):

    entry = Entry.query.filter(Entry.id == id, Entry.user_id == current_user.id).first()
    if entry is None:
        return {'message': 'Entry not found'}, 404
    
    if entry.entry_type != 'text':
        return {'message': 'Entry type not supported for update.'}, 400

    body = request.get_json()
    if body is None:
        return {'message': 'Bad request'}, 400
    
    # Parse valid updates and save
    changes = False
    entry_data = body.get('entry_data')
    if entry_data is not None:
        
        original_entry_data = entry.entry_data

        if 'title' in entry_data:
            original_entry_data['title'] = entry_data['title']
            changes = True

        if 'sentiment' in entry_data:
            original_entry_data['sentiment'] = entry_data['sentiment']
            changes = True

        if 'text' in entry_data:
            
            text = entry_data['text']

            # NOTE we haven't re-asked for the password here, but since the entry was originally locked, we're locking it again.
            if original_entry_data.get('locked', False):
                text = lock_text(current_user.email, text)

            original_entry_data['text'] = text
            changes = True

        entry.update(entry_data=original_entry_data)
    
    tags = body.get('tags')
    if tags is not None:
        entry.update(tags=tags)
        changes = True
        tags = upsert_tags(tags, current_user.id, entry.id)

    if changes:
        entry.save()

    return {'data': entry.json()}, 200

@views.route('/fetch/entries', methods=['GET'])
@login_required
def fetch_entries(current_user):

    limit = request.args.get('limit', 10)
    offset = request.args.get('offset', 0)
    search = request.args.get('search', None)
    tag = request.args.get('tag', None)

    query = Entry.query.filter(Entry.user_id == current_user.id)

    if search:
        # Search titles and tags
        query = query.filter(or_(
            cast(Entry.entry_data.op('->>')('title'), String).ilike(f'%{search}%'),
            and_(
                    or_(
                        cast(Entry.entry_data.op('->>')('locked'), Boolean) == None,
                        cast(Entry.entry_data.op('->>')('locked'), Boolean) == False,
                    ),
                    cast(Entry.entry_data.op('->>')('text'), String).ilike(f'%{search}%')
                )
            )
        )
            # Entry.tags.any(search) # TODO this is exact match case sensitive

    # if tag:TODO seach by tag
    #     # Exact tag search
    #     query = query.filter(func.array_contains(Entry.tags, tag))
    print(str(query))
    entries = query.order_by(Entry.functional_datetime.desc()).limit(limit).offset(offset).all()

    return {'data': [entry.short_json(signer=sign_filename) for entry in entries]}, 200

@views.route('/fetch/tags', methods=['GET'])
@login_required
def fetch_tags(current_user):

    limit = request.args.get('limit', 30)
    offset = request.args.get('offset', 0)
    name = request.args.get('search', None)

    query = Tag.query.filter(Tag.user_id == current_user.id)

    if name:
        query = query.filter(Tag.name.ilike(f'%{name}%'))

    tags = query.order_by(Tag.created_on).limit(limit).offset(offset).all()

    return {'data': [tag.json() for tag in tags]}, 200

# POST to put passcode in the body for locked entries.
@views.route('/fetch/entries/<int:id>', methods=['GET', 'POST'])
@login_required
def fetch_entry(current_user, id):

    entry = Entry.query.filter(Entry.id == id, Entry.user_id == current_user.id).first()

    if entry is None:
        return {'message': 'Entry not found'}, 404

    # TODO passcode stuff
    if request.method == 'POST' and entry.entry_data.get('locked', False):
        body = request.get_json()
        if body is None:
            return {'message': 'Bad request'}, 400
        
        password = body.get('password')
        if password is None:
            return {'message': 'Password required to unlock entries.'}, 400
        
        if not authenticated(current_user, password):
            return {'message': 'Unauthorized'}, 401
        
        entry_data = entry.entry_data
        unlocked_text = unlock_text(current_user.email, entry_data.get('text', ''))
        entry_data['text'] = unlocked_text
        entry.update(entry_data=entry_data)

    return {'data': entry.json()}, 200

@views.route('/delete/entries/<int:id>', methods=['POST'])
@login_required
def delete_entry(current_user, id):

    entry = Entry.query.filter(Entry.id == id, Entry.user_id == current_user.id).first()
    if entry is None:
        return {'message': 'Entry not found'}, 404
    
    if 'path' in entry.entry_data:
        path = entry.entry_data['path']
        delete_file(current_user.id, path)

    entry.delete()

    return {'success': True}, 200

@views.route('/lock/entries/<int:id>', methods=['POST'])
@login_required
def lock_entry(current_user, id):

    entry = Entry.query.filter(Entry.id == id, Entry.user_id == current_user.id).first()
    if entry is None:
        return {'message': 'Entry not found'}, 404
    
    body = request.get_json()
    if body is None:
        return {'message': 'Bad request'}, 400
    
    password = body.get('password')
    if password is None:
        return {'message': 'Password required to lock entries.'}, 400
    
    if not authenticated(current_user, password):
        return {'message': 'Unauthorized'}, 401
    
    entry_data = entry.entry_data
    locked_text = lock_text(current_user.email, entry_data.get('text', ''))
    
    entry_data['locked'] = True
    entry_data['text'] = locked_text
    entry.update(entry_data=entry_data)
    
    entry.save()

    return {'data': entry.json()}, 200

@views.route('/unlock/entries/<int:id>', methods=['POST'])
@login_required
def unlock_entry(current_user, id):

    entry = Entry.query.filter(Entry.id == id, Entry.user_id == current_user.id).first()
    if entry is None:
        return {'message': 'Entry not found'}, 404
    
    body = request.get_json()
    if body is None:
        return {'message': 'Bad request'}, 400
    
    password = body.get('password')
    if password is None:
        return {'message': 'Password required to unlock entries.'}, 400
    
    if not authenticated(current_user, password):
        return {'message': 'Unauthorized'}, 401
    
    entry_data = entry.entry_data
    unlocked_text = unlock_text(current_user.email, entry_data.get('text', ''))
    
    entry_data['locked'] = False
    entry_data['text'] = unlocked_text
    entry.update(entry_data=entry_data)
    
    entry.save()

    return {'data': entry.json()}, 200

@views.route('/static/<filename>', methods=['GET'])
def get_file(filename):

    signature = request.args.get('signature')

    if signature is None:
        return {'message': 'Unauthorized'}, 401
    
    user = get_user_from_signature(signature)
    if user is None:
        return {'message': 'Unauthorized'}, 401

    base_path = get_user_directory(user.id)

    return send_from_directory(base_path, filename)

@views.route('/submit/task/<task>', methods=['POST'])
@login_required
def submit_task(current_user, task):

    body = request.get_json()
    if body is None:
        return {'message': 'Bad request'}, 400
    
    links = body.get('links')
    if links is None:
        return {'message': 'Bad request'}, 400
    
    submitImportEntriesTask(links, current_user.id)

    return {'success': True}, 200

@views.route('/import')
def import_entries():

    current_user = 7
    import_entries("",current_user,"","")
    # thread = threading.Thread(target=import_entries_wrapper, args=(current_app,"",current_user,"",""))
    # thread.daemon = True  # Ensures thread won't prevent app shutdown
    # thread.start()

    return {"status": "submitted"}


def upsert_tags(tags, user_id, entry_id):
    
    if tags is not None and len(tags) > 0:

        tags = [tag.lower() for tag in tags]
        existing_tags = Tag.query.filter(Tag.user_id == user_id, Tag.name.in_(tags)).all()
        existing_tags = {tag.name: tag for tag in existing_tags}
        
        for tag in tags:
            if tag not in existing_tags:
                new_tag = Tag(user_id=user_id, name=tag)
                new_tag.save()

                EntryTagXref(entry_id=entry_id, tag_id=new_tag.id).save()
            else: 
                EntryTagXref(entry_id=entry_id, tag_id=existing_tags[tag].id).save()

        return tags
    

def import_entries_wrapper(app, *args):
    with app.app_context():
        import_entries(*args)

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
            
            if entry["locked"]:
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