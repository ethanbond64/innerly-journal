-- Version 0 is an unversioned Python/early desktop database.
-- IF NOT EXISTS adopts that schema without replacing any existing records.
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, email VARCHAR(128) NOT NULL UNIQUE,
    password_hash VARCHAR(512) NOT NULL, admin BOOLEAN,
    settings JSON NOT NULL DEFAULT '"{}"', usage JSON NOT NULL DEFAULT '"{}"',
    created_on DATETIME, updated_on DATETIME
);
CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
    functional_datetime DATETIME, entry_type VARCHAR(64) NOT NULL, entry_data JSON NOT NULL,
    created_on DATETIME, updated_on DATETIME
);
CREATE INDEX IF NOT EXISTS ix_entries_functional_datetime ON entries(functional_datetime);
CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY, name VARCHAR(255) NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id),
    day_tag BOOLEAN NOT NULL DEFAULT 0, created_on DATETIME, updated_on DATETIME,
    UNIQUE(name, user_id)
);
CREATE TABLE IF NOT EXISTS entry_tag_xref (
    id INTEGER PRIMARY KEY, entry_id INTEGER NOT NULL REFERENCES entries(id), tag_id INTEGER NOT NULL REFERENCES tags(id),
    created_on DATETIME, updated_on DATETIME, UNIQUE(entry_id, tag_id)
);
CREATE TABLE IF NOT EXISTS date_tag_xref (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), functional_datetime DATETIME,
    tag_id INTEGER NOT NULL REFERENCES tags(id), created_on DATETIME, updated_on DATETIME,
    UNIQUE(user_id, functional_datetime, tag_id)
);
