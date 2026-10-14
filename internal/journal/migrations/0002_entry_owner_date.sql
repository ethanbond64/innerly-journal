-- Timeline pagination and account-scoped calendar queries.
CREATE INDEX IF NOT EXISTS ix_entries_user_datetime ON entries(user_id, functional_datetime DESC, id DESC);
