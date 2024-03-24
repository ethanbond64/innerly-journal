from flask import Blueprint, request

from sqlalchemy import func, or_

from security import authenticated, encrypt_password, get_token, login_required
from models import User, Entry, Tag

views = Blueprint('views', __name__)

@views.route('/version')
def index():
    return {'version': '1.0.0'}, 200

@views.route('/<share>/signup', methods=['POST'])
def signup(share):

    # TODO validate share

    body = request.get_json()
    if body is None:
        return {'message': 'Bad request'}, 400
    
    email = body.get('email')
    password = body.get('password')
    if email is None or password is None:
        return {'message': 'Bad request'}, 400
    
    user = User.query.filter(User.email == email).first()
    if user is not None:
        return {'message': 'User: ' + email + ' already exists.'}, 409
    
    new_user = User(email=email, password_hash=encrypt_password(password))
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
    if user is None or not user.authenticated(password):
        return {'message': 'Unauthorized'}, 401
    
    token = get_token(user)

    return {'token': token, 'user': user.json()}, 200

@views.route('/change_password', methods=['POST'])
@login_required
def reset_password(current_user):

    body = request.get_json()
    if body is None:
        return {'message': 'Bad request'}, 400
    
    current_password = body.get('current_password')
    new_password = body.get('new_password')
    if current_password is None or new_password is None:
        return {'message': 'Bad request'}, 400
    
    if not authenticated(current_user, current_password):
        return {'message': 'Unauthorized'}, 401
    
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
        if 'sensitivity' in input_settings and input_settings['sensitivity'] in ['default', 'blur', 'blocked']:
            update_settings['sensitivity'] = input_settings['sensitivity']
        # TODO passcode
        user.settings = update_settings
        user.save()

    return {'data': user.json()}, 200

@views.route('/insert/entries', methods=['POST'])
@login_required
def insert_entry(current_user):
    return None

@views.route('/update/entries/<int:id>', methods=['POST'])
@login_required
def update_entry(current_user, id):

    entry = Entry.query.filter(Entry.id == id, Entry.user_id == current_user.id).first()
    if entry is None:
        return {'message': 'Entry not found'}, 400
    
    if entry.entry_type != 'text':
        return {'message': 'Entry type not supported for update.s'}, 400

    body = request.get_json()
    if body is None:
        return {'message': 'Bad request'}, 400
    
    # TODO validate body and set
    entry_data = body.get('entry_data')
    tags = body.get('tags')
    functional_datetime = body.get('functional_datetime')

    return {'data': entry.json()}, 200

@views.route('/fetch/entries', methods=['GET'])
@login_required
def fetch_entries(current_user):

    limit = request.args.get('limit', 30)
    offset = request.args.get('offset', 0)
    search = request.args.get('search', '')

    return None

@views.route('/fetch/tags', methods=['GET'])
@login_required
def fetch_entries(current_user):

    limit = request.args.get('limit', 10)
    offset = request.args.get('offset', 0)
    search = request.args.get('search', None)
    tag = request.args.get('tag', None)

    q = Entry.query.filter(Entry.user_id == current_user.id)

    if search:
        # Search titles and tags
        q = q.filter(or_(
            func.jsonb_extract_path_text(Entry.entry_data, 'title').like(f'%{search}%')),
            Entry.tags.any_(func.array_contains(Entry.tags, search))
        )

    if tag:
        # Exact tag search
        q = q.filter(Entry.tags.any_(func.array_contains(Entry.tags, tag)))

    entries = q.order_by(Entry.functional_datetime.desc()).limit(limit).offset(offset).all()

    return {'data': [entry.short_json() for entry in entries]}, 200

# POST to put passcode in the body for locked entries.
@views.route('/fetch/entries/<int:id>', methods=['POST'])
@login_required
def fetch_entry(current_user, id):
    return None