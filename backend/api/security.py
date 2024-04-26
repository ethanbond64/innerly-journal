import base64
import os
import re
import datetime
from functools import wraps
from http import HTTPStatus
from cryptography.fernet import Fernet

from flask import abort, jsonify
from flask_jwt_extended import create_access_token, get_jwt_identity, jwt_required
from werkzeug.security import generate_password_hash, check_password_hash

from api.models import User
from api.settings import SECRET_KEY

IDENTITY_PADDING = '-innerly-auth'
UNAUTHORIZED = {'message': 'Requires authentication'}
EMAIL_REGEX = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b'

cipher_suite = Fernet(SECRET_KEY)

def json_abort(status_code, data=None):
    response = jsonify(data)
    response.status_code = status_code
    abort(response)

def login_required(function):
    @wraps(function)
    @jwt_required(locations=['headers'])
    def decorator(*args, **kwargs):
        identity = get_jwt_identity()

        if identity is None or not identity.endswith(IDENTITY_PADDING):
            json_abort(HTTPStatus.UNAUTHORIZED, UNAUTHORIZED)
            return

        user = get_user(identity)

        if user is None:
            json_abort(HTTPStatus.UNAUTHORIZED, UNAUTHORIZED)
            return

        return function(user, *args, **kwargs)

    return decorator

def validate_email(email):
    return re.fullmatch(EMAIL_REGEX, email)

def validate_password(password):
    return len(password) >= 8

def encrypt_password(password):
    if password:
        return generate_password_hash(password, method="pbkdf2")
    return None

def authenticated(user: User, password):
    if password:
        return check_password_hash(user.password_hash, password)
    return False

def get_token(user: User):
        return create_access_token(identity=get_user_identity(user.id), expires_delta=datetime.timedelta(hours=12))

def get_user_identity(user_id):
    return str(user_id) + IDENTITY_PADDING

def get_user(identity):
    user_id = identity.replace(IDENTITY_PADDING, '')
    return User.query.filter(User.id == user_id).first()

def sign_filename(filename, user_id):
    payload = str(filename) + "$" + datetime.datetime.now().isoformat() + "$"+ get_user_identity(user_id)
    signature_bytes = cipher_suite.encrypt(payload.encode())
    return base64.urlsafe_b64encode(signature_bytes).decode()

def get_user_from_signature(signature):
    user = None
    bytes_signature = base64.urlsafe_b64decode(signature).decode()
    decrypted_data = cipher_suite.decrypt(bytes_signature).decode()
    if IDENTITY_PADDING in decrypted_data and decrypted_data.endswith(IDENTITY_PADDING):
        user_identity = decrypted_data.split('$')[-1]
        timestamp = decrypted_data.split('$')[-2]
        if datetime.datetime.now() - datetime.datetime.fromisoformat(timestamp) < datetime.timedelta(hours=12):
            user = get_user(user_identity)
    return user

def create_32_byte_key(key_base):
    
    key = key_base
    while len(key) < 32:
        key += key_base

    return base64.urlsafe_b64encode(bytes(key[:32], 'utf-8'))

def lock_text(key_input, text):

    key = create_32_byte_key(key_input)
    fernet = Fernet(key)
    
    return str(fernet.encrypt(text.encode()))

def unlock_text(key_input, text):

        key = create_32_byte_key(key_input)
        fernet = Fernet(key)
        
        text_as_bytes = text[2:-1].encode()
        return fernet.decrypt(text_as_bytes).decode()