import datetime
from api.extensions import db
from sqlalchemy import ARRAY, String
from sqlalchemy.dialects.postgresql import JSON
from werkzeug.security import check_password_hash

def get_datetime():
    return datetime.datetime.now()

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

    def delete(self):
        db.session.delete(self)
        return db.session.commit()

    def json(self):
        return {c.name: getattr(self, c.name) for c in self.__table__.columns}


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
    tags = db.Column(ARRAY(String), nullable=False, default=[])

    def short_json(self):
        j = super().json()
        if 'entry_data' in j and 'text' in j['entry_data']:
            del j['entry_data']['text']
        return j

class Tag(db.Model, BaseModel):
    __tablename__ = 'tags'
    __table_args__ = (db.UniqueConstraint('name', 'user_id', name='_name_user_id_uc'),)

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)