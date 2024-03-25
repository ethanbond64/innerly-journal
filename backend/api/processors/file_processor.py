import os
from imghdr import what as get_format
import os
from uuid import uuid4
from werkzeug.utils import secure_filename

from api.security import json_abort
from api.processors.entry_models import FileEntryData
from api.models import User

JPG = 'jpg'
PNG = 'png'
GIF = 'gif'
JPEG = 'jpeg'
ALLOWED_EXTENSIONS = {JPG, PNG, GIF, JPEG}
JPEG_MARK = b'\xff\xd8\xff\xe2\x02\x1cICC_PROFILE\x00\x01\x01\x00\x00\x02\x0clcms\x02\x10\x00\x00'

BASE_DIRECTORY = os.path.expanduser('~/.innerly/') # TODO ADD USER and get this dynamically
STATIC_DIRECTORY = 'static/'
USER_DIRECTORY_PREFIX = 'user-'

def process_file_entry(user: User, file) -> tuple:

    user_directory = get_user_directory(user.id)

    path, original_filename, file_type = save_file(user_directory, file)

    return FileEntryData(original_filename, path, file_type).json(), []

# Validates the file, saves it to the file system and returns the path, file type, and original filename
def save_file(directory, file) -> tuple:

    original_filename, extension = parse_file(file)
    
    new_filename = str(uuid4()) + '.' + extension
    
    if not os.path.exists(directory):
        os.makedirs(directory)

    true_path = os.path.join(directory, new_filename)
    file.save(true_path)

    path = get_public_path(new_filename)

    return path, original_filename, extension
    
def parse_file(file):

    filename = secure_filename(file.filename)

    if filename != '':

        file_ext_valid = validate_image(file.stream)
        
        if not allowed_file(filename) or file_ext_valid == None:

            json_abort(400)
        
        return filename, file_ext_valid


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def validate_image(stream):
    
    header = stream.read(512)
    stream.seek(0)

    file_format = get_format(None, header)
    
    if not file_format:
        file_format = test_jpeg2(header)
    
    if file_format == JPEG:
        return  JPG
    
    return file_format


# CUSTOM BASED ON HEIC CONVERTED TO JPG, I MADE THIS, NEEDS TESTING
def test_jpeg2(h):
    '''JPEG with heic? header'''
    if len(h) >= 32 and h[:32] == JPEG_MARK:
        return JPG
    return None

def get_user_directory(user_id):
    return os.path.join(BASE_DIRECTORY, STATIC_DIRECTORY, USER_DIRECTORY_PREFIX + str(user_id))

def get_public_path(filename):
    return os.path.join(STATIC_DIRECTORY, filename)