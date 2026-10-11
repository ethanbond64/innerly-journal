import base64
import csv
from contextlib import closing
from datetime import datetime, timedelta
import io
import json
import os
from pathlib import Path
import sqlite3
import ssl
import tempfile
import time
import unittest
from unittest.mock import Mock, patch
import zipfile

from cryptography.fernet import Fernet


HOME = tempfile.TemporaryDirectory()
ORIGINAL_HOME = os.environ.get('HOME')
os.environ['HOME'] = HOME.name
DATA = Path(HOME.name) / '.innerly'
DATA.mkdir()
(DATA / 'config.json').write_text(json.dumps({'secret': Fernet.generate_key().decode()}))

from api.app import create_app
from api.extensions import db
from api import security
from api.imports import REQUIRED_CSVS
from api.processors import link_processor


PASSWORD = 'journal-password'
PNG = base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
)


def tearDownModule():
    if ORIGINAL_HOME is None:
        os.environ.pop('HOME', None)
    else:
        os.environ['HOME'] = ORIGINAL_HOME
    HOME.cleanup()


class JournalTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config['TESTING'] = True
        with self.app.app_context():
            db.drop_all()
            db.create_all()
        security.WRITE_LOCK_KEY_HASHTABLE.clear()
        self.client = self.app.test_client()
        self.owner = self.signup('owner@example.com')
        self.other = self.signup('other@example.com')

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.engine.dispose()

    def request(self, method, path, user=None, status=200, **kwargs):
        user = user or self.owner
        response = self.client.open('/api' + path, method=method,
                                    headers={'Authorization': 'Bearer ' + user['token']}, **kwargs)
        self.assertEqual(response.status_code, status, response.get_data(as_text=True))
        return response.get_json()

    def signup(self, email):
        response = self.client.post('/api/signup', json={'email': email, 'password': PASSWORD})
        self.assertEqual(response.status_code, 201)
        return response.get_json()

    def create(self, text='A quiet journal entry', locked=False, user=None, date=None, title=''):
        body = {'entry_type': 'text', 'entry_data': {'title': title, 'text': text},
                'locked': locked, 'password': PASSWORD}
        if date:
            body['functional_datetime'] = date
        return self.request('POST', '/insert/entries', user, 201, json=body)['data']

    def fetch(self, entry, user=None):
        return self.request('GET', f"/fetch/entries/{entry['id']}", user)['data']

    def plaintext(self, entry, password=PASSWORD):
        return self.request('POST', f"/fetch/entries/{entry['id']}", json={'password': password})['data']['entry_data']['text']

    def stored(self, entry):
        with closing(sqlite3.connect(DATA / 'database.db')) as connection:
            row = connection.execute('SELECT entry_data FROM entries WHERE id = ?', (entry['id'],)).fetchone()
        return json.loads(row[0]) if row else None

    def test_signup_login_and_authorization(self):
        """Accounts receive private identities, and invalid credentials cannot access the journal."""
        self.assertTrue(self.owner['user']['admin'])
        self.assertFalse(self.other['user']['admin'])
        self.assertNotIn('password_hash', self.owner['user'])
        login = self.client.post('/api/login', json={'email': 'owner@example.com', 'password': PASSWORD})
        self.assertEqual(login.status_code, 200)
        self.request('GET', '/fetch/entries', login.get_json())
        for body in ({}, {'email': 'owner@example.com', 'password': 'wrong'},
                     {'email': 'missing@example.com', 'password': PASSWORD}):
            with self.subTest(body=body):
                self.assertIn(self.client.post('/api/login', json=body).status_code, (400, 401))
        for header in ('', 'Basic abc', 'Bearer ', 'Bearer invalid', 'Bearer ' + self.owner['token'] + 'x'):
            with self.subTest(header=header):
                response = self.client.get('/api/fetch/entries', headers={'Authorization': header})
                self.assertEqual(response.status_code, 401)
        self.assertEqual(self.client.post('/api/signup', json={'email': 'owner@example.com', 'password': PASSWORD}).status_code, 409)
        for email, password in [('invalid', PASSWORD), ('new@example.com', 'short')]:
            self.assertEqual(self.client.post('/api/signup', json={'email': email, 'password': password}).status_code, 400)

    def test_expired_session_is_rejected(self):
        """A session older than five days no longer grants access."""
        with patch('time.time', return_value=time.time() + 6 * 86400):
            self.request('GET', '/fetch/entries', status=401)

    def test_entry_lifecycle_survives_restart(self):
        """Creating and editing a Unicode entry persists across application startup, and deletion removes it."""
        entry = self.create('Hello 世界\nsecond line', date='2020-02-03T23:59:00.000Z')
        self.request('POST', f"/update/entries/{entry['id']}", json={'entry_data': {'text': 'Updated café text', 'title': 'Trip'}})
        with self.app.app_context():
            db.engine.dispose()
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()
        loaded = self.fetch(entry)
        self.assertEqual(loaded['entry_data']['text'], 'Updated café text')
        self.assertEqual(loaded['entry_data']['title'], 'Trip')
        self.assertEqual(loaded['entry_data']['word_count'], 3)
        self.assertEqual(loaded['functional_datetime'], '2020-02-03T23:59:00Z')
        self.request('POST', f"/delete/entries/{entry['id']}", json={})
        self.request('GET', f"/fetch/entries/{entry['id']}", status=404)
        self.assertIsNone(self.stored(entry))

    def test_entry_ownership(self):
        """Another account cannot read, edit, delete, lock, or unlock an owner's entry."""
        entry = self.create()
        for method, route, body in [('GET', 'fetch', None), ('POST', 'update', {'entry_data': {'text': 'changed'}}),
                                    ('POST', 'delete', {}), ('POST', 'lock', {}), ('POST', 'unlock', {'password': PASSWORD})]:
            with self.subTest(route=route):
                self.request(method, f"/{route}/entries/{entry['id']}", self.other, 404, json=body)
        self.assertEqual(self.request('GET', '/fetch/entries', self.other)['data'], [])
        self.assertEqual(self.fetch(entry)['entry_data']['text'], entry['entry_data']['text'])

    def test_search_pagination_and_previews(self):
        """Search finds titles and unlocked text, excludes private plaintext, and preserves paginated date order."""
        older = self.create('needle ' + 'x' * 100, date='2020-01-01T12:00:00.000Z')
        newer = self.create('private needle', locked=True, title='Needle title', date='2020-01-03T12:00:00.000Z')
        self.create('needle', locked=True, date='2020-01-02T12:00:00.000Z')
        self.create('needle', user=self.other)
        rows = self.request('GET', '/fetch/entries?search=NEEDLE')['data']
        self.assertEqual([row['id'] for row in rows], [newer['id'], older['id']])
        self.assertEqual(len(rows[1]['entry_data']['text']), 64)
        page = self.request('GET', '/fetch/entries?search=needle&limit=1&offset=1')['data']
        self.assertEqual([row['id'] for row in page], [older['id']])
        self.assertEqual(self.request('GET', '/fetch/entries?search=absent')['data'], [])

    def test_search_entry_tags(self):
        """Entry-tag search includes locked entries once, preserves pagination, and excludes day-only tags and other users."""
        older = self.create('Private text', locked=True, date='2020-01-01T12:00:00.000Z')
        newer = self.create('Travel notes', title='Travel', date='2020-01-02T12:00:00.000Z')
        foreign = self.create(user=self.other)
        self.create('Unrelated text', date='2020-01-03T12:00:00.000Z')
        with closing(sqlite3.connect(DATA / 'database.db')) as connection, connection:
            for entry, user, names in [(older, self.owner, ['travel']),
                                       (newer, self.owner, ['travel', 'travelogue']),
                                       (foreign, self.other, ['travel'])]:
                for name in names:
                    connection.execute('INSERT OR IGNORE INTO tags (name, user_id) VALUES (?, ?)',
                                       (name, user['user']['id']))
                    tag_id = connection.execute('SELECT id FROM tags WHERE name = ? AND user_id = ?',
                                                (name, user['user']['id'])).fetchone()[0]
                    connection.execute('INSERT INTO entry_tag_xref (entry_id, tag_id) VALUES (?, ?)',
                                       (entry['id'], tag_id))
        self.request('POST', '/insert/date_tags', status=201,
                     json={'name': 'travel', 'functional_datetime': '2020-01-03T23:59:00.000Z'})
        ciphertext = self.stored(older)['text']
        rows = self.request('GET', '/fetch/entries?search=RAV')['data']
        self.assertEqual([row['id'] for row in rows], [newer['id'], older['id']])
        self.assertTrue(rows[1]['entry_data']['locked'])
        self.assertEqual(rows[1]['entry_data']['text'], ciphertext[:64])
        self.assertEqual(self.stored(older)['text'], ciphertext)
        for offset, entry in enumerate([newer, older]):
            page = self.request('GET', f'/fetch/entries?search=RAV&limit=1&offset={offset}')['data']
            self.assertEqual([row['id'] for row in page], [entry['id']])
        self.assertEqual(self.request('GET', '/fetch/entries?search=RAV&limit=1&offset=2')['data'], [])
        rows = self.request('GET', '/fetch/entries?search=RAV', self.other)['data']
        self.assertEqual([row['id'] for row in rows], [foreign['id']])

    def test_text_counts_and_sentiment(self):
        """Saved text retains Unicode and computes representative word counts and sentiment outcomes."""
        for text, count, sentiment in [('', 0, 'neutral'), ('hello\t世界\n café', 3, 'neutral'),
                                       ('happy', 1, 'positive'), ('sad', 1, 'negative')]:
            with self.subTest(text=text):
                data = self.fetch(self.create(text))['entry_data']
                self.assertEqual((data['text'], data['word_count'], data['sentiment']), (text, count, sentiment))

    def test_settings_and_default_locking(self):
        """Settings persist independently, control default encryption, and cannot be changed by another ordinary user."""
        route = f"/update/users/{self.other['user']['id']}"
        settings = {'lock_by_default': False, 'sensitivity': 'blur', 'lock_ttl_value': 2, 'lock_ttl_unit': 'hours'}
        result = self.request('POST', route, self.other, json={'settings': settings})
        self.assertEqual(result['data']['settings'], settings)
        self.request('POST', f"/update/users/{self.owner['user']['id']}", self.other, 401, json={'settings': settings})
        for value, unit in [(0, 'hours'), (True, 'hours'), (8, 'days'), (1, 'weeks')]:
            self.request('POST', route, self.other, 400, json={'settings': {'lock_ttl_value': value, 'lock_ttl_unit': unit}})
        result = self.request('POST', route, self.other, json={'settings': {'sensitivity': 'both'}})
        self.assertFalse(result['data']['settings']['lock_by_default'])
        self.assertEqual(result['data']['settings']['lock_ttl_value'], 2)
        entry = self.request('POST', '/insert/entries', self.other, 201,
                             json={'entry_type': 'text', 'entry_data': {'text': 'default setting'}})['data']
        self.assertEqual(self.stored(entry)['text'], 'default setting')

    def test_locked_entry_read_edit_and_unlock(self):
        """Private text stays encrypted through reads and edits until the user explicitly unlocks it permanently."""
        entry = self.create('Private 世界', locked=True)
        self.assertTrue(entry['text_unlocked'])
        self.assertEqual(entry['entry_data']['text'], 'Private 世界')
        ciphertext = self.stored(entry)['text']
        self.assertNotEqual(ciphertext, 'Private 世界')
        self.assertEqual(self.fetch(entry)['entry_data']['text'], ciphertext)
        self.assertEqual(self.plaintext(entry), 'Private 世界')
        self.assertEqual(self.stored(entry)['text'], ciphertext)
        self.request('POST', f"/fetch/entries/{entry['id']}", status=401, json={'password': 'wrong'})
        self.request('POST', f"/update/entries/{entry['id']}", status=409, json={'entry_data': {'text': ciphertext}})
        result = self.request('POST', f"/update/entries/{entry['id']}", json={'entry_data': {'text': 'New private text'}})
        self.assertEqual(result['data']['entry_data']['text'], 'New private text')
        self.assertNotEqual(self.stored(entry)['text'], 'New private text')
        self.assertEqual(self.plaintext(entry), 'New private text')
        self.request('POST', f"/unlock/entries/{entry['id']}", json={'password': PASSWORD})
        self.assertFalse(self.stored(entry)['locked'])
        self.assertEqual(self.stored(entry)['text'], 'New private text')

    def test_default_locking_and_reauthentication(self):
        """Default-private saves require authentication, and reauthentication restores saving without repeated passwords."""
        body = {'entry_type': 'text', 'entry_data': {'text': 'private by default'}}
        error = self.request('POST', '/insert/entries', status=401, json=body)
        self.assertTrue(error['lock-auth-expired'])
        self.request('POST', '/lock/auth', json={'password': PASSWORD})
        entry = self.request('POST', '/insert/entries', status=201, json=body)['data']
        self.assertTrue(self.stored(entry)['locked'])
        self.request('POST', '/insert/entries', self.other, 401, json=body)
        future = datetime.now() + timedelta(hours=2)
        with patch('api.security.datetime.datetime') as clock:
            clock.now.return_value = future
            self.request('POST', '/insert/entries', status=401, json=body)
        self.request('POST', '/lock/auth', status=401, json={'password': 'wrong'})
        self.request('POST', '/lock/auth', json={'password': PASSWORD})
        self.request('POST', '/insert/entries', status=201, json=body)

    def test_password_change_rekeys_only_selected_entries(self):
        """Changing a password preserves private text and leaves public entries alone unless lock-all is requested."""
        private = self.create('private', locked=True)
        public = self.create('public')
        foreign = self.create('other private', locked=True, user=self.other)
        foreign_data = self.stored(foreign)
        result = self.request('POST', '/update_password', json={'current_password': PASSWORD, 'new_password': 'new-password'})
        self.assertEqual(result['reencrypted'], 1)
        self.assertEqual(self.plaintext(private, 'new-password'), 'private')
        self.assertEqual(self.stored(public)['text'], 'public')
        self.assertEqual(self.stored(foreign), foreign_data)
        for password, status in [(PASSWORD, 401), ('new-password', 200)]:
            self.assertEqual(self.client.post('/api/login', json={'email': 'owner@example.com', 'password': password}).status_code, status)
        result = self.request('POST', '/update_password', json={'current_password': 'new-password', 'new_password': 'final-password', 'lock_all': True})
        self.assertEqual(result['reencrypted'], 2)
        self.assertEqual(self.plaintext(public, 'final-password'), 'public')
        self.assertTrue(self.stored(public)['locked'])

    def test_password_change_minimum_length(self):
        """Weak new passwords leave account data and entries unchanged, while an eight-character password can rekey them."""
        private = self.create('Private journal', locked=True)
        public = self.create('Public journal')
        before = [self.stored(private), self.stored(public)]
        with closing(sqlite3.connect(DATA / 'database.db')) as connection:
            account = connection.execute('SELECT * FROM users WHERE id = ?', (self.owner['user']['id'],)).fetchone()
        for password in ['', 'short', '1234567']:
            for lock_all in [False, True]:
                with self.subTest(password=password, lock_all=lock_all):
                    self.request('POST', '/update_password', status=400,
                                 json={'current_password': PASSWORD, 'new_password': password, 'lock_all': lock_all})
                    self.assertEqual([self.stored(private), self.stored(public)], before)
                    with closing(sqlite3.connect(DATA / 'database.db')) as connection:
                        self.assertEqual(connection.execute('SELECT * FROM users WHERE id = ?',
                                                           (self.owner['user']['id'],)).fetchone(), account)
        login = self.client.post('/api/login', json={'email': 'owner@example.com', 'password': PASSWORD})
        self.assertEqual(login.status_code, 200)
        self.assertEqual(self.plaintext(private), 'Private journal')
        result = self.request('POST', '/update_password',
                              json={'current_password': PASSWORD, 'new_password': '12345678', 'lock_all': True})
        self.assertEqual(result['reencrypted'], 2)
        for entry, text in [(private, 'Private journal'), (public, 'Public journal')]:
            self.assertTrue(self.stored(entry)['locked'])
            self.assertEqual(self.plaintext(entry, '12345678'), text)
        for password, status in [(PASSWORD, 401), ('12345678', 200)]:
            self.assertEqual(self.client.post('/api/login',
                                             json={'email': 'owner@example.com', 'password': password}).status_code, status)

    def test_password_change_rolls_back_on_corrupt_entry(self):
        """An unreadable encrypted entry prevents a password change without partially rekeying earlier entries."""
        first = self.create('first', locked=True)
        broken = self.create('second', locked=True)
        data = self.stored(broken)
        data['text'] = "b'corrupt'"
        with closing(sqlite3.connect(DATA / 'database.db')) as connection, connection:
            connection.execute('UPDATE entries SET entry_data = ? WHERE id = ?', (json.dumps(data), broken['id']))
        before = self.stored(first)
        self.request('POST', '/update_password', status=409, json={'current_password': PASSWORD, 'new_password': 'new-password'})
        self.assertEqual(self.stored(first), before)
        self.assertEqual(self.plaintext(first), 'first')
        self.assertEqual(self.client.post('/api/login', json={'email': 'owner@example.com', 'password': PASSWORD}).status_code, 200)

    def test_day_tags_lifecycle(self):
        """Day tags normalize names, avoid duplicate associations, and disappear from suggestions after their last removal."""
        body = {'name': '  Holiday  ', 'functional_datetime': '2020-01-01T23:59:00.000Z'}
        first = self.request('POST', '/insert/date_tags', status=201, json=body)['data']
        again = self.request('POST', '/insert/date_tags', json=body)['data']
        self.assertEqual(first['id'], again['id'])
        self.assertEqual(first['name'], 'holiday')
        second = self.request('POST', '/insert/date_tags', status=201,
                              json={**body, 'functional_datetime': '2020-01-02T23:59:00.000Z'})['data']
        self.assertEqual(self.request('GET', '/fetch/tagged_days', self.other)['data'], [])
        self.request('POST', f"/delete/date_tags/{first['id']}", self.other, 404, json={})
        self.request('POST', f"/delete/date_tags/{first['id']}", json={})
        self.assertEqual(len(self.request('GET', '/fetch/date_tags?search=HOL')['data']), 1)
        self.request('POST', f"/delete/date_tags/{second['id']}", json={})
        self.assertEqual(self.request('GET', '/fetch/date_tags')['data'], [])
        self.assertEqual(len(self.request('GET', '/fetch/tags')['data']), 1)
        for name in ['', ' ', 'x' * 256]:
            self.request('POST', '/insert/date_tags', status=400, json={**body, 'name': name})

    def test_activity_memories_and_date_queries(self):
        """Activity exposes counts without plaintext, while date and memories queries remain user-scoped."""
        self.create('three secret words', locked=True, date='2020-06-15T12:00:00.000Z')
        self.create('two words', date='2019-06-15T12:00:00.000Z')
        self.create('foreign', user=self.other, date='2018-06-15T12:00:00.000Z')
        activity = self.request('GET', '/fetch/activity?before=2020-06-15&days=2')['data']
        self.assertEqual(len(activity), 1)
        self.assertEqual(activity[0]['words'], 3)
        self.assertEqual(set(activity[0]), {'functional_datetime', 'sentiment', 'words'})
        memories = self.request('GET', '/fetch/memories?date=2024-06-15')['data']['datetimes']
        self.assertEqual(memories, ['2020-06-15T12:00:00Z', '2019-06-15T12:00:00Z'])
        self.assertEqual(len(self.request('GET', '/fetch/entries?date=2020-06-15')['data']), 1)
        for route in ['/fetch/entries?date=bad', '/fetch/activity?before=bad', '/fetch/memories?date=bad']:
            self.request('GET', route, status=400)

    def test_image_upload_and_signed_retrieval(self):
        """An image uploaded with a misleading extension is stored intact and retrieved through its signed URL."""
        entry = self.request('POST', '/insert/entries', status=201,
                             data={'entry_type': 'file', 'file': (io.BytesIO(PNG), 'photo.txt')})['data']
        self.assertEqual(entry['entry_data']['file_type'], 'png')
        response = self.client.get(entry['entry_data']['path'])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, PNG)
        response.close()
        self.assertEqual(self.client.get(entry['entry_data']['path'].split('?')[0]).status_code, 401)
        self.request('POST', f"/lock/entries/{entry['id']}", status=400, json={'password': PASSWORD})
        self.request('POST', f"/update/entries/{entry['id']}", status=400, json={'entry_data': {'text': 'invalid'}})
        self.request('POST', '/insert/entries', status=400,
                     data={'entry_type': 'file', 'file': (io.BytesIO(b'not an image'), 'fake.png')})

    def test_link_preview_and_network_failure(self):
        """Saving a link downloads its preview, while a failed page request leaves no journal entry."""
        page = b'<meta property="og:title" content="A &amp; B"><meta property="og:image" content="https://example.com/image.png">'
        def response(body, content_type):
            result = io.BytesIO(body)
            result.headers = {'Content-Type': content_type}
            result.geturl = lambda: 'https://example.com/page'
            return result
        with patch.object(link_processor.url_opener, 'open', side_effect=[response(page, 'text/html'), response(PNG, 'image/png')]):
            entry = self.request('POST', '/insert/entries', status=201,
                                 json={'entry_type': 'link', 'entry_data': {'link': 'https://example.com/page'}})['data']
        self.assertEqual(entry['entry_data']['title'], 'A & B')
        image = self.client.get(entry['entry_data']['path'])
        self.assertEqual(image.data, PNG)
        image.close()
        with patch.object(link_processor.url_opener, 'open', side_effect=TimeoutError):
            self.request('POST', '/insert/entries', status=400,
                         json={'entry_type': 'link', 'entry_data': {'link': 'https://example.com/failure'}})
        self.assertEqual(len(self.request('GET', '/fetch/entries')['data']), 1)

    def test_import_archive_and_reimport(self):
        """A real archive imports text and tags asynchronously, and reimport updates rather than duplicates entries."""
        directory = DATA / 'imports'
        directory.mkdir(exist_ok=True)
        archive = directory / 'journal.zip'
        def write_archive(text):
            rows = {
                'entries.csv': [{'id': '42', 'created_on': '2020-01-01 12:00:00+00',
                                 'updated_on': '2020-01-01 12:00:00+00', 'functional_timestamp': '2020-01-01 12:00:00+00',
                                 'title': 'Imported', 'text': text, 'sentiment_idx': '1', 'locked': 'false', 'media_entry_id': ''}],
                'specifics.csv': [{'id': '1', 'title': 'Travel'}],
                'entry_specific_xref.csv': [{'entry_id': '42', 'specific_id': '1'}],
            }
            with zipfile.ZipFile(archive, 'w') as output:
                for name in REQUIRED_CSVS:
                    records = rows.get(name, [])
                    stream = io.StringIO()
                    writer = csv.DictWriter(stream, fieldnames=list(records[0]) if records else ['id'])
                    writer.writeheader()
                    writer.writerows(records)
                    output.writestr(name, stream.getvalue())
        for text in ['Imported 世界 text', 'Revised import']:
            write_archive(text)
            self.request('POST', '/import', json={'path': archive.name})
            deadline = time.monotonic() + 10
            while True:
                progress = self.request('GET', '/import/status')
                if progress['status'] != 'running':
                    break
                self.assertLess(time.monotonic(), deadline, 'Import did not finish')
                time.sleep(0.01)
            self.assertEqual((progress['status'], progress['processed'], progress['failures']), ('complete', 1, 0))
            entries = self.request('GET', '/fetch/entries')['data']
            self.assertEqual(len(entries), 1)
            self.assertEqual(entries[0]['entry_data']['text'], text)
            self.assertEqual(entries[0]['tags'], ['travel'])
            self.assertEqual(self.request('GET', '/fetch/entries', self.other)['data'], [])

    def test_legacy_encryption_and_password_compatibility(self):
        """A fixed historical password hash and both ciphertext versions remain readable and can be rekeyed together."""
        fixture = json.loads(Path(__file__).with_name('fixtures').joinpath('encryption.json').read_text())
        entries = []
        for version in (0, 1):
            entry = self.create('placeholder')
            data = {**self.stored(entry), 'text': fixture[f'v{version}'], 'locked': True, 'lock_version': version}
            with closing(sqlite3.connect(DATA / 'database.db')) as connection, connection:
                connection.execute('UPDATE entries SET entry_data = ? WHERE id = ?', (json.dumps(data), entry['id']))
                connection.execute('UPDATE users SET password_hash = ? WHERE id = ?',
                                   (fixture['password_hash'], self.owner['user']['id']))
            self.assertEqual(self.plaintext(entry), fixture['text'])
            entries.append(entry)
        self.assertEqual(self.client.post('/api/login', json={'email': fixture['email'], 'password': fixture['password']}).status_code, 200)
        result = self.request('POST', '/update_password', json={'current_password': PASSWORD, 'new_password': 'migrated-password'})
        self.assertEqual(result['reencrypted'], 2)
        for entry in entries:
            self.assertEqual(self.plaintext(entry, 'migrated-password'), fixture['text'])
            self.assertEqual(self.stored(entry)['lock_version'], 1)

    def test_legacy_schema_upgrade_preserves_journal(self):
        """Starting with an older tags schema adds day-tag support without losing existing entries or tags."""
        entry = self.create('Old journal')
        with self.app.app_context():
            db.engine.dispose()
        with closing(sqlite3.connect(DATA / 'database.db')) as connection, connection:
            connection.execute('ALTER TABLE tags DROP COLUMN day_tag')
            connection.execute('INSERT INTO tags (name, user_id) VALUES (?, ?)', ('legacy', self.owner['user']['id']))
        self.app = create_app()
        self.client = self.app.test_client()
        self.assertEqual(self.fetch(entry)['entry_data']['text'], 'Old journal')
        tags = self.request('GET', '/fetch/tags')['data']
        self.assertEqual(tags[0]['name'], 'legacy')
        self.assertFalse(tags[0]['day_tag'])
        self.request('POST', '/insert/date_tags', status=201,
                     json={'name': 'legacy', 'functional_datetime': '2020-01-01T23:59:00.000Z'})
        self.assertEqual(len(self.request('GET', '/fetch/tags')['data']), 1)

    def test_link_security_blocks_unsafe_destinations(self):
        """Unsafe URLs and non-public DNS answers are rejected before opening a socket or saving an entry."""
        for url in ['file:///etc/passwd', 'ftp://example.com/file', 'http://example.com/', 'https://',
                    'https://user:pass@example.com', 'https://example.com:bad',
                    'https://example.com/\nheader', 'https://[::1%25lo0]/']:
            with self.subTest(url=url), patch.object(link_processor.socket, 'getaddrinfo') as dns:
                self.request('POST', '/insert/entries', status=400,
                             json={'entry_type': 'link', 'entry_data': {'link': url}})
                dns.assert_not_called()
        for addresses in [['127.0.0.1'], ['10.0.0.1'], ['169.254.169.254'], ['192.168.1.1'],
                          ['172.16.0.1'], ['0.0.0.0'], ['224.0.0.1'], ['::1'], ['fc00::1'],
                          ['fe80::1'], ['::ffff:127.0.0.1'], ['93.184.216.34', '127.0.0.1']]:
            with self.subTest(addresses=addresses):
                answers = [(2, 1, 6, '', (address, 443)) for address in addresses]
                with patch.object(link_processor.socket, 'getaddrinfo', return_value=answers), \
                     patch.object(link_processor.socket, 'socket') as connect:
                    result = self.request('POST', '/insert/entries', status=400,
                                          json={'entry_type': 'link', 'entry_data': {'link': 'https://example.com/'}})
                    self.assertEqual(result['message'], 'Unable to fetch this link safely.')
                    connect.assert_not_called()
        self.assertEqual(self.request('GET', '/fetch/entries')['data'], [])

    def test_link_redirects_pin_public_addresses(self):
        """Redirects and relative thumbnails use validated pinned addresses without following proxy environment settings."""
        page = b'<meta property="og:title" content="Redirected"><meta property="og:image" content="../image.png">'
        bodies = [b'HTTP/1.1 302 Found\r\nLocation: /folder/page\r\nContent-Length: 0\r\n\r\n',
                  b'HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: ' + str(len(page)).encode() + b'\r\n\r\n' + page,
                  b'HTTP/1.1 200 OK\r\nContent-Length: ' + str(len(PNG)).encode() + b'\r\n\r\n' + PNG]
        sockets = [Mock() for _ in bodies]
        for connection, body in zip(sockets, bodies):
            connection.makefile.return_value = io.BytesIO(body)
        answers = [(2, 1, 6, '', ('93.184.216.34', 443))]
        with patch.dict(os.environ, {'https_proxy': 'http://127.0.0.1:9999'}), \
             patch.object(link_processor.socket, 'getaddrinfo', return_value=answers) as dns, \
             patch.object(link_processor.socket, 'socket', side_effect=sockets), \
             patch.object(ssl.SSLContext, 'wrap_socket', lambda context, sock, **kwargs: sock):
            with patch.object(link_processor, 'url_opener', link_processor.build_url_opener()):
                entry = self.request('POST', '/insert/entries', status=201,
                                     json={'entry_type': 'link', 'entry_data': {'link': 'https://example.com/start'}})['data']
        self.assertEqual(entry['entry_data']['title'], 'Redirected')
        self.assertEqual(entry['entry_data']['original_path'], 'https://example.com/image.png')
        self.assertEqual(dns.call_count, 3)
        for connection in sockets:
            connection.connect.assert_called_once_with(('93.184.216.34', 443))
            self.assertIn(b'Host: example.com', connection.sendall.call_args_list[0].args[0])
        image = self.client.get(entry['entry_data']['path'])
        self.assertEqual(image.data, PNG)
        image.close()

    def test_link_redirect_to_private_host_is_blocked(self):
        """A public HTTPS page cannot redirect to an internal address or downgrade to HTTP."""
        for target in ['https://internal.example', 'https://example.com', 'http://example.com']:
            with self.subTest(target=target):
                connection = Mock()
                connection.makefile.return_value = io.BytesIO(
                    f'HTTP/1.1 302 Found\r\nLocation: {target}/secret\r\nContent-Length: 0\r\n\r\n'.encode())
                addresses = [[(2, 1, 6, '', ('93.184.216.34', 443))], [(2, 1, 6, '', ('127.0.0.1', 443))]]
                with patch.object(link_processor.socket, 'getaddrinfo', side_effect=addresses), \
                     patch.object(link_processor.socket, 'socket', return_value=connection) as sockets, \
                     patch.object(ssl.SSLContext, 'wrap_socket', lambda context, sock, **kwargs: sock):
                    self.request('POST', '/insert/entries', status=400,
                                 json={'entry_type': 'link', 'entry_data': {'link': 'https://example.com/'}})
                    sockets.assert_called_once()
        self.assertEqual(self.request('GET', '/fetch/entries')['data'], [])

    def test_unusable_previews_do_not_break_bookmarks(self):
        """Missing, unsafe, unsupported, and failed thumbnails leave a usable bookmark without external image fallbacks."""
        for image in [None, 'https://[broken', 'http://example.com/image', 'https://internal.example/image',
                      'https://example.com/unsupported', 'https://example.com/failure']:
            with self.subTest(image=image):
                page = '<meta property="og:title" content="Bookmark">'
                if image:
                    page += f'<meta property="og:image" content="{image}">'
                body = page.encode()
                first = Mock()
                first.makefile.return_value = io.BytesIO(
                    b'HTTP/1.1 200 OK\r\nContent-Length: ' + str(len(body)).encode() + b'\r\n\r\n' + body)
                second = Mock()
                second.makefile.return_value = io.BytesIO(b'HTTP/1.1 200 OK\r\nContent-Length: 3\r\n\r\nsvg')
                public = [(2, 1, 6, '', ('93.184.216.34', 443))]
                private = [(2, 1, 6, '', ('127.0.0.1', 443))]
                answers = [public, private if image and 'internal' in image else public]
                if image and 'failure' in image:
                    second.connect.side_effect = TimeoutError
                with patch.object(link_processor.socket, 'getaddrinfo', side_effect=answers), \
                     patch.object(link_processor.socket, 'socket', side_effect=[first, second]) as sockets, \
                     patch.object(ssl.SSLContext, 'wrap_socket', lambda context, sock, **kwargs: sock):
                    entry = self.request('POST', '/insert/entries', status=201,
                                         json={'entry_type': 'link', 'entry_data': {'link': 'https://example.com/'}})['data']
                    if image is None or 'internal' in image or image == 'https://[broken' or image.startswith('http://'):
                        self.assertEqual(sockets.call_count, 1)
                data = self.fetch(entry)['entry_data']
                self.assertEqual(data['title'], 'Bookmark')
                self.assertEqual(data['link'], 'https://example.com/')
                self.assertIsNone(data['path'])
                self.assertIsNone(data['original_path'])

    def test_https_keeps_hostname_verification(self):
        """HTTPS pins the public connection address while preserving certificate verification and the original TLS hostname."""
        connection = Mock()
        connection.makefile.return_value = io.BytesIO(b'HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n')
        hostnames = []
        def wrap(context, sock, server_hostname=None, **kwargs):
            self.assertTrue(context.check_hostname)
            self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)
            hostnames.append(server_hostname)
            return sock
        with patch.object(link_processor.socket, 'getaddrinfo', return_value=[(2, 1, 6, '', ('93.184.216.34', 443))]), \
             patch.object(link_processor.socket, 'socket', return_value=connection), \
             patch.object(ssl.SSLContext, 'wrap_socket', wrap):
            self.request('POST', '/insert/entries', status=201,
                         json={'entry_type': 'link', 'entry_data': {'link': 'https://example.com/'}})
        connection.connect.assert_called_once_with(('93.184.216.34', 443))
        self.assertEqual(hostnames, ['example.com'])

    def test_link_redirect_loop_is_bounded(self):
        """Repeated redirects are stopped instead of making unbounded outbound requests."""
        connection = Mock()
        connection.makefile.side_effect = lambda *args: io.BytesIO(
            b'HTTP/1.1 302 Found\r\nLocation: /loop\r\nContent-Length: 0\r\n\r\n')
        with patch.object(link_processor.socket, 'getaddrinfo', return_value=[(2, 1, 6, '', ('93.184.216.34', 443))]), \
             patch.object(link_processor.socket, 'socket', return_value=connection) as sockets, \
             patch.object(ssl.SSLContext, 'wrap_socket', lambda context, sock, **kwargs: sock):
            self.request('POST', '/insert/entries', status=400,
                         json={'entry_type': 'link', 'entry_data': {'link': 'https://example.com/loop'}})
            self.assertLessEqual(sockets.call_count, 6)
        self.assertEqual(self.request('GET', '/fetch/entries')['data'], [])

    def test_link_response_limits(self):
        """Oversized page responses fail without inserting a bookmark, regardless of advertised length."""
        for headers, body in [({'Content-Length': '100'}, b'x'), ({}, b'x' * 33),
                              ({'Content-Length': '1'}, b'x' * 33),
                              ({'Content-Encoding': 'gzip'}, b'compressed'),
                              ({'Content-Length': 'invalid'}, b'x')]:
            with self.subTest(headers=headers):
                response = io.BytesIO(body)
                response.headers = headers
                with patch.object(link_processor, 'MAX_RESPONSE_BYTES', 32), \
                     patch.object(link_processor.url_opener, 'open', return_value=response):
                    self.request('POST', '/insert/entries', status=400,
                                 json={'entry_type': 'link', 'entry_data': {'link': 'https://example.com/large'}})
                self.assertEqual(self.request('GET', '/fetch/entries')['data'], [])

    def test_frontend_and_unknown_api_routes(self):
        """Frontend deep links receive the app shell while unknown API routes remain genuine errors."""
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, 'index.html').write_text('<html>journal</html>')
            with patch('api.app.FRONTEND_DIRECTORY', directory):
                for path in ['/', '/view/123']:
                    response = self.client.get(path)
                    self.assertEqual(response.status_code, 200)
                    self.assertIn(b'journal', response.data)
                    response.close()
                self.assertEqual(self.client.get('/api/unknown').status_code, 404)
            with patch('api.app.FRONTEND_DIRECTORY', directory + '/missing'):
                self.assertEqual(self.client.get('/').status_code, 501)


if __name__ == '__main__':
    unittest.main()
