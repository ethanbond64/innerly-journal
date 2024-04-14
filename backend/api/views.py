import uuid
from datetime import datetime
from flask import Blueprint, request, send_from_directory

from sqlalchemy import String, cast, or_

from api.security import authenticated, encrypt_password, get_token, get_user_from_signature, login_required, sign_filename, validate_email, validate_password
from api.models import EntryTagXref, User, Entry, Tag, get_datetime
from api.processors.text_processor import process_text_entry
from api.processors.file_processor import delete_file, get_user_directory, process_file_entry
from api.processors.link_processor import process_link_entry
from api.tasks import submitImportEntriesTask

views = Blueprint('views', __name__)

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
            original_entry_data['text'] = entry_data['text']
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
            cast(Entry.entry_data.op('->>')('title'), String).ilike(f'%{search}%')
            # Entry.tags.any(search) # TODO this is exact match case sensitive
        ))

    # if tag:TODO seach by tag
    #     # Exact tag search
    #     query = query.filter(func.array_contains(Entry.tags, tag))

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
@views.route('/fetch/entries/<int:id>', methods=['GET'])
@login_required
def fetch_entry(current_user, id):

    entry = Entry.query.filter(Entry.id == id, Entry.user_id == current_user.id).first()

    # TODO passcode stuff

    if entry is None:
        return {'message': 'Entry not found'}, 404

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

