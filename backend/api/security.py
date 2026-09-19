import base64
import hashlib
import os
import re
import datetime
from functools import wraps
from http import HTTPStatus
from typing import Any, Dict, Tuple, Optional

from cryptography.fernet import Fernet

from flask import abort, jsonify, request
from itsdangerous import BadSignature, URLSafeTimedSerializer
from werkzeug.security import generate_password_hash, check_password_hash

from api.models import User, Entry
from api.settings import SECRET_KEY

IDENTITY_PADDING = '-innerly-auth'
UNAUTHORIZED = {'message': 'Requires authentication'}
LOCK_AUTH_EXPIRED = 'lock-auth-expired'
EMAIL_REGEX = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b'
TOKEN_MAX_AGE = datetime.timedelta(days=5)
TOKEN_SALT = 'innerly-auth-token'
CURRENT_LOCK_VERSION = 1

SCRYPT_KEY_MEMORY_TTL = datetime.timedelta(minutes=15)
SCRYPT_N, SCRYPT_R, SCRYPT_P = 2**14, 8, 1
SCRYPT_KEY_LEN = 32
SCRYPT_SALT_LEN = 16

# How long the lock key stays cached, chosen by the user as a count plus a unit.
LOCK_TTL_VALUE = 'lock_ttl_value'
LOCK_TTL_UNIT = 'lock_ttl_unit'
LOCK_TTL_UNITS = ('seconds', 'minutes', 'hours', 'days')
LOCK_TTL_MAX = datetime.timedelta(days=7)

cipher_suite = Fernet(SECRET_KEY)
token_serializer = URLSafeTimedSerializer(SECRET_KEY, salt=TOKEN_SALT)

# Global dict of user id to tuple (entry lock key, expiry) # TODO spawn a thread that clears expired tuples every minute
WRITE_LOCK_KEY_HASHTABLE: Dict[int, Tuple[str, datetime.datetime]] = {}

def json_abort(status_code, data=None):
    response = jsonify(data)
    response.status_code = status_code
    abort(response)

def login_required(function):
    @wraps(function)
    def decorator(*args, **kwargs):
        identity = get_identity_from_header()

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
        return token_serializer.dumps(get_user_identity(user.id))

# Reads the bearer token from the Authorization header, returning the identity it
# was signed with, or None if the header is absent, malformed, tampered with, or
# older than TOKEN_MAX_AGE.
def get_identity_from_header():
    scheme, _, token = request.headers.get('Authorization', '').partition(' ')

    if scheme.lower() != 'bearer':
        return None

    token = token.strip()
    if not token:
        return None

    try:
        identity = token_serializer.loads(token, max_age=int(TOKEN_MAX_AGE.total_seconds()))
    except BadSignature:
        # Also covers SignatureExpired, which subclasses BadSignature.
        return None

    return identity if isinstance(identity, str) else None

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

    if type(key_input) == str:
        key = create_32_byte_key(key_input)
    elif type(key_input) == bytes:
        key = base64.urlsafe_b64encode(key_input)
    else:
        raise TypeError('key_input must be str or bytes')

    fernet = Fernet(key)
    
    return str(fernet.encrypt(text.encode()))


# The lifetime these settings describe, or None if they do not describe a usable one.
def parse_lock_ttl(settings: Dict[str, Any]) -> Optional[datetime.timedelta]:

    value = settings.get(LOCK_TTL_VALUE)
    unit = settings.get(LOCK_TTL_UNIT)

    if not isinstance(value, int) or isinstance(value, bool) or value < 1:
        return None

    if unit not in LOCK_TTL_UNITS:
        return None

    ttl = datetime.timedelta(**{unit: value})

    return ttl if ttl <= LOCK_TTL_MAX else None


def get_lock_ttl(user: User) -> datetime.timedelta:

    settings = user.settings if isinstance(user.settings, dict) else {}

    return parse_lock_ttl(settings) or SCRYPT_KEY_MEMORY_TTL


def get_scrypt_key(user: User, password: str, read_cache=False):

    global WRITE_LOCK_KEY_HASHTABLE

    scrypt_key, expiry = None, None

    if read_cache:
        scrypt_key, expiry = WRITE_LOCK_KEY_HASHTABLE.get(user.id, (None, None))

    if scrypt_key is None or (expiry is not None and expiry < datetime.datetime.now()):

        if user.id in WRITE_LOCK_KEY_HASHTABLE:
            del WRITE_LOCK_KEY_HASHTABLE[user.id]

        if not authenticated(user, password):
            json_abort(HTTPStatus.UNAUTHORIZED, {LOCK_AUTH_EXPIRED: True})

        scrypt_salt = SECRET_KEY + TOKEN_SALT
        scrypt_key =  hashlib.scrypt(password.encode("utf-8"), salt=scrypt_salt.encode("utf-8"),
                                     n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P,
                              maxmem=128 * SCRYPT_N * SCRYPT_R * 2, dklen=SCRYPT_KEY_LEN)

        WRITE_LOCK_KEY_HASHTABLE[user.id] = (scrypt_key, datetime.datetime.now() + get_lock_ttl(user))

    return scrypt_key


def lock_entry_data(user: User, password: Optional[str], entry_data: Dict[str, Any]) -> Dict[str, Any]:

    copied_entry_data = dict(entry_data)

    scrypt_key = get_scrypt_key(user, password, read_cache=True)
    text = entry_data.get('text', '')

    copied_entry_data['text'] = lock_text(scrypt_key, text)
    copied_entry_data['locked'] = True
    copied_entry_data['lock_version'] = CURRENT_LOCK_VERSION

    return copied_entry_data

def unlock_text(key_input, text):

        if type(key_input) == str:
            key = create_32_byte_key(key_input)
        elif type(key_input) == bytes:
            key = base64.urlsafe_b64encode(key_input)
        else:
            raise TypeError('key_input must be str or bytes')

        fernet = Fernet(key)
        
        text_as_bytes = text[2:-1].encode()
        return fernet.decrypt(text_as_bytes).decode()

def unlock_entry_data(user: User, password, entry: Entry):

    copied_entry_data = dict(entry.entry_data)

    locked_text = copied_entry_data.get('text', '')
    lock_version = copied_entry_data.get('lock_version', 0)

    # Scrypt key on unlock must come from the request, not the in-memory cache, which is write-only.
    scrypt_key = get_scrypt_key(user, password, read_cache=False)

    if lock_version == 0:

        copied_entry_data['text'] = unlock_text(user.email, locked_text)

        # TODO migrate to version 1 behind the scenes, require password + save
        # new_locked_entry_data = lock_entry_data(user, password, copied_entry_data)
        # entry.update(entry_data=new_locked_entry_data)
        # entry.save()

    elif lock_version == 1:
        copied_entry_data['text'] = unlock_text(scrypt_key, locked_text)

    else:
        raise RuntimeError('Lock version not supported')

    return copied_entry_data
