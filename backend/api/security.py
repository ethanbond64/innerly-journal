import datetime
from functools import wraps
from http import HTTPStatus

from flask import abort, jsonify
from flask_jwt_extended import create_access_token, get_jwt_identity, jwt_required
from werkzeug.security import generate_password_hash, check_password_hash

from models import User

IDENTITY_PADDING = '-innerly-auth'
UNAUTHORIZED = {'message': 'Requires authentication'}

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
        
        user_id = identity.replace(IDENTITY_PADDING, '')
        user = User.query.filter(User.id == user_id).first()

        if user is None:
            json_abort(HTTPStatus.UNAUTHORIZED, UNAUTHORIZED)
            return

        return function(user, *args, **kwargs)

    return decorator

def encrypt_password(password):
    if password:
        return generate_password_hash(password)
    return None

def authenticated(user: User, password):
    if password:
        return check_password_hash(user.password_hash, password)
    return False

def get_token(user: User):
        return create_access_token(identity=user.id + IDENTITY_PADDING, expires_delta=datetime.timedelta(hours=12))