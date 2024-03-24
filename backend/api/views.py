from flask import Blueprint, request

from security import authenticated, encrypt_password, get_token, login_required
from models import User, Entry, Tag

views = Blueprint("views", __name__)

@views.route('/version')
def index():
    return {"version": "1.0.0"}, 200

@views.route('/<share>/signup', methods=['POST'])
def signup(share):

    # TODO validate share

    body = request.get_json()
    if body is None:
        return {"message": "Bad request"}, 400
    
    email = body.get('email')
    password = body.get('password')
    if email is None or password is None:
        return {"message": "Bad request"}, 400
    
    user = User.query.filter(User.email == email).first()
    if user is not None:
        return {"message": "User: " + email + " already exists."}, 409
    
    new_user = User(email=email, password_hash=encrypt_password(password))
    new_user.save()

    token = get_token(new_user)

    return {"token": token, "user": new_user.json()}, 201

@views.route('/login', methods=['POST'])
def login():

    body = request.get_json()
    if body is None:
        return {"message": "Bad request"}, 400
    
    email = body.get('email')
    password = body.get('password')
    if email is None or password is None:
        return {"message": "Bad request"}, 400
    
    user = User.query.filter(User.email == email).first()
    if user is None or not user.authenticated(password):
        return {"message": "Unauthorized"}, 401
    
    token = get_token(user)

    return {"token": token, "user": user.json()}, 200

@views.route('/change_password', methods=['POST'])
@login_required
def reset_password(current_user):

    body = request.get_json()
    if body is None:
        return {"message": "Bad request"}, 400
    
    current_password = body.get('current_password')
    new_password = body.get('new_password')
    if current_password is None or new_password is None:
        return {"message": "Bad request"}, 400
    
    if not authenticated(current_user, current_password):
        return {"message": "Unauthorized"}, 401
    
    current_user.password_hash = encrypt_password(new_password)
    current_user.save()

    return {"success": True}, 200

@views.route('/update/users/<int:id>', methods=['POST'])
@login_required
def update_user(current_user, id):

    if current_user.id != id and not current_user.admin:
        return {"message": "Unauthorized"}, 401
    
    user = User.query.filter(User.id == id).first()

    if user is None:
        return {"message": "User not found"}, 404
    
    body = request.get_json()
    if body is None:
        return {"message": "Bad request"}, 400
    
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
    return None

@views.route('/fetch/<table>', methods=['GET'])
@login_required
def fetch(current_user, table):

    if table != Entry.__tablename__:
        return None

    return None

# POST to put passcode in the body for locked entries.
@views.route('/fetch/entries/<int:id>', methods=['POST'])
@login_required
def fetch_entry(current_user, id):
    return None