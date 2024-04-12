from datetime import datetime, timezone
from api.extensions import db
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm.attributes import flag_modified

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
        if signer != None and 'entry_data' in j and 'path' in j['entry_data']:
            path = j['entry_data']['path']
            signature = signer(path, self.user_id)
            j['entry_data']['path'] = str(path) + '?signature=' + signature
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

class EntryTagXref(db.Model, BaseModel):
    __tablename__ = 'entry_tag_xref'
    __table_args__ = (db.UniqueConstraint('entry_id', 'tag_id', name='_entry_tag_uc'),)

    id = db.Column(db.Integer, primary_key=True)
    entry_id = db.Column(db.Integer, db.ForeignKey('entries.id'), nullable=False)
    tag_id = db.Column(db.Integer, db.ForeignKey('tags.id'), nullable=False)