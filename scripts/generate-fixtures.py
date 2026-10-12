import base64
import csv
import io
import json
import os
from pathlib import Path
import shutil
import sys
import zipfile

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

root = Path(__file__).resolve().parents[1]
home = root / '.work' / 'fixture-home'
if home.exists():
    shutil.rmtree(home)
data = home / '.innerly'
data.mkdir(parents=True)
os.environ['HOME'] = str(home)
(data / 'config.json').write_text(json.dumps({'secret': Fernet.generate_key().decode()}))
sys.path.insert(0, str(root / 'backend'))
from api.app import create_app
from api.extensions import db
from api.models import Entry, User, upsert_tags

output = root / 'internal' / 'journal' / 'testdata'
output.mkdir(exist_ok=True)
app = create_app()
client = app.test_client()
account = client.post('/api/signup', json={'email': 'owner@example.com', 'password': 'journal-password'}).get_json()
headers = {'Authorization': 'Bearer ' + account['token']}
response = client.post('/api/insert/entries', headers=headers, json={
    'entry_type': 'text', 'entry_data': {'title': 'Python fixture', 'text': 'Private 世界 from Python'},
    'password': 'journal-password', 'locked': True, 'functional_datetime': '2020-06-15T12:00:00.000Z'
})
assert response.status_code == 201
client.post('/api/signup', json={'email': 'other@example.com', 'password': 'journal-password'})
client.post('/api/insert/date_tags', headers=headers, json={'name': 'holiday', 'functional_datetime': '2020-06-15T23:59:00.000Z'})
with app.app_context():
    entry = db.session.get(Entry, 1)
    entry.update(entry_data={**entry.entry_data, 'future_metadata': {'keep': True}})
    entry.save()
    upsert_tags(['Travel'], 1, 1)
    user = db.session.get(User, 2)
    user.update(settings='{}')
    user.save()
    db.session.remove()
    db.engine.dispose()
shutil.copyfile(data / 'database.db', output / 'python-journal.db')

key = bytes(range(32))
iv = bytes(range(12))
sealed = AESGCM(key).encrypt(iv, 'Legacy encrypted 世界'.encode(), b'archive-passcode')
base = {'created_on': '2020-01-01 12:00:00+00', 'updated_on': '2020-01-01 12:00:00+00',
        'functional_timestamp': '2020-01-01 12:00:00+00', 'title': 'Imported', 'text': '',
        'sentiment_idx': '1', 'locked': 'false', 'media_entry_id': '', 'iv': '', 'cipher_text': '', 'tag': ''}
rows = {
    'entries.csv': [dict(base, id='1', text='Imported 世界 text'),
                    dict(base, id='2', locked='true', iv=repr(iv), cipher_text=repr(sealed[:-16]), tag=repr(sealed[-16:])),
                    dict(base, id='3', media_entry_id='3.0'), dict(base, id='4', media_entry_id='404.0')],
    'media_entries.csv': [{'id': '3', 'media_type': 'image_upload_s3', 'thumbnail_img': 'old/path/pixel.png'}],
    'specifics.csv': [{'id': '1', 'title': 'Travel'}],
    'themes.csv': [{'id': '1', 'title': 'Travel'}],
    'entry_specific_xref.csv': [{'entry_id': '1', 'specific_id': '1'}],
    'entry_theme_xref.csv': [{'entry_id': '1', 'theme_id': '1'}],
}
with zipfile.ZipFile(output / 'legacy.zip', 'w') as archive:
    for name, records in rows.items():
        stream = io.StringIO()
        writer = csv.DictWriter(stream, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows(records)
        archive.writestr(name, stream.getvalue())
    archive.writestr('secret.json', json.dumps({'secret': base64.b64encode(key).decode()}))
    archive.writestr('images/pixel.png', base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='))
