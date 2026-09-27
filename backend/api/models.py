from datetime import datetime, timezone
from sqlalchemy import inspect, text
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm.attributes import flag_modified

from api.extensions import db

PREIVEW_LENGTH = 64

def get_datetime():
    return datetime.now(timezone.utc)

def getattr_typed(object, key):
    value = getattr(object, key)
    if isinstance(value, datetime):
        value = value.isoformat() + 'Z'
    return value

class BaseModel(object):
    created_on = db.Column(db.DateTime(), default=get_datetime)
    updated_on = db.Column(db.DateTime(), default=get_datetime, onupdate=get_datetime)

    def save(self):
        db.session.add(self)
        db.session.commit()
        return self

    def update(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)
            if (type(value) == dict):
                flag_modified(self, key)
                

    def delete(self):
        db.session.delete(self)
        return db.session.commit()

    def json(self):
        return {c.name: getattr_typed(self, c.name) for c in self.__table__.columns}

class User(db.Model, BaseModel):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(128), unique=True, index=True, nullable=False, server_default='')
    password_hash = db.Column(db.String(512), nullable=False, server_default='')
    admin = db.Column(db.Boolean, default=False)
    settings = db.Column(JSON, nullable=False, default='{}')
    usage = db.Column(JSON, nullable=False, default='{}')

    def json(self):
        j = super().json()
        del j['password_hash']
        return j

class Entry(db.Model, BaseModel):
    __tablename__ = 'entries'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    functional_datetime = db.Column(db.DateTime(), default=get_datetime, index=True)
    entry_type = db.Column(db.String(64), nullable=False, default='text')
    entry_data = db.Column(JSON, nullable=False, default='{}')

    def json(self, signer = None):
        j = super().json()

        tags = Tag.query.join(EntryTagXref, Tag.id == EntryTagXref.tag_id).filter(EntryTagXref.entry_id == self.id).all()
        j['tags'] = [tag.name for tag in tags]

        if signer != None and 'entry_data' in j and 'path' in j['entry_data']:
            if j['entry_data'].get('file_type') != 'external':
                path = j['entry_data']['path']
                signature = signer(path, self.user_id)
                j['entry_data']['path'] = '/api/' + str(path) + '?signature=' + signature
        return j


    def short_json(self, signer = None):
        j = self.json(signer=signer)
        if 'entry_data' in j and 'text' in j['entry_data']:
            j['entry_data']['text'] = j['entry_data']['text'][:PREIVEW_LENGTH] 
        return j

class Tag(db.Model, BaseModel):
    __tablename__ = 'tags'
    __table_args__ = (db.UniqueConstraint('name', 'user_id', name='_name_user_id_uc'),)

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    # One row per name per user, so a tag used on days and a tag used on entries with the
    # same name are the same row. This marks a tag as offered for days; it is not exclusive.
    # Sqlite keeps a quoted default as text, and 'FALSE' read back as a boolean is true, so the
    # default is the number sqlite actually stores a false in.
    day_tag = db.Column(db.Boolean, nullable=False, default=False, server_default=text('0'))

class EntryTagXref(db.Model, BaseModel):
    __tablename__ = 'entry_tag_xref'
    __table_args__ = (db.UniqueConstraint('entry_id', 'tag_id', name='_entry_tag_uc'),)

    id = db.Column(db.Integer, primary_key=True)
    entry_id = db.Column(db.Integer, db.ForeignKey('entries.id'), nullable=False)
    tag_id = db.Column(db.Integer, db.ForeignKey('tags.id'), nullable=False)

# A tag on a day itself, with no entry behind it. The datetime follows the same convention
# the entries do — the local day at 23:59, stored as UTC — so the client buckets both into
# days the same way. The constraint therefore holds a day to one row per tag only as long as
# that convention is kept, so nothing should write here with a time of its own choosing.
class DateTagXref(db.Model, BaseModel):
    __tablename__ = 'date_tag_xref'
    __table_args__ = (db.UniqueConstraint('user_id', 'functional_datetime', 'tag_id', name='_user_date_tag_uc'),)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    functional_datetime = db.Column(db.DateTime(), default=get_datetime, index=True)
    tag_id = db.Column(db.Integer, db.ForeignKey('tags.id'), nullable=False)

# Tables missing from an existing database are created by db.create_all() on startup, but a
# column added to a table that already exists is not, and there is no migration tool here by
# design. Each entry is a column this application expects and the DDL to add it, applied once,
# in the order they were introduced.
COLUMN_MIGRATIONS = [
    ('tags', 'day_tag', 'day_tag BOOLEAN NOT NULL DEFAULT 0'),
]

def apply_column_migrations():

    inspector = inspect(db.engine)

    for table, column, ddl in COLUMN_MIGRATIONS:

        if not inspector.has_table(table):
            continue

        if column in {existing['name'] for existing in inspector.get_columns(table)}:
            continue

        db.session.execute(text(f'ALTER TABLE {table} ADD COLUMN {ddl}'))
        db.session.commit()


def upsert_tags(tags, user_id, entry_id):

    if tags is not None and len(tags) > 0:

        tags = list(set(tag.lower() for tag in tags))
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