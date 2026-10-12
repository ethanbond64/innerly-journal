package journal

import (
	"database/sql"
	"encoding/json"
	"strings"
	"time"
)

type User struct {
	ID           int64          `json:"id"`
	Email        string         `json:"email"`
	PasswordHash string         `json:"-"`
	Admin        bool           `json:"admin"`
	Settings     map[string]any `json:"settings"`
	Usage        map[string]any `json:"usage"`
	CreatedOn    string         `json:"created_on"`
	UpdatedOn    string         `json:"updated_on"`
}
type Entry struct {
	ID                 int64          `json:"id"`
	UserID             int64          `json:"user_id"`
	FunctionalDatetime string         `json:"functional_datetime"`
	EntryType          string         `json:"entry_type"`
	EntryData          map[string]any `json:"entry_data"`
	Tags               []string       `json:"tags"`
	CreatedOn          string         `json:"created_on"`
	UpdatedOn          string         `json:"updated_on"`
	TextUnlocked       bool           `json:"text_unlocked,omitempty"`
}
type Tag struct {
	ID     int64  `json:"id"`
	UserID int64  `json:"user_id"`
	Name   string `json:"name"`
	DayTag bool   `json:"day_tag"`
}
type DateTag struct {
	ID                 int64  `json:"id"`
	TagID              int64  `json:"tag_id"`
	Name               string `json:"name"`
	FunctionalDatetime string `json:"functional_datetime"`
}

func jsonString(v any) string { b, _ := json.Marshal(v); return string(b) }
func object(s string) map[string]any {
	m := map[string]any{}
	json.Unmarshal([]byte(s), &m)
	if m == nil {
		m = map[string]any{}
	}
	return m
}
func text(v any) string { s, _ := v.(string); return s }
func flag(v any) bool   { b, _ := v.(bool); return b }
func number(v any) int {
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	case int64:
		return int(n)
	}
	return 0
}
func parseDate(s string) (time.Time, error) {
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02 15:04:05.999999", "2006-01-02T15:04:05.999999", "2006-01-02"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UTC(), nil
		}
	}
	return time.Time{}, failure("invalid-input", "Invalid date.")
}
func timestamp(t time.Time) string { return t.UTC().Format("2006-01-02 15:04:05.000000") }
func publicTime(s string) string {
	t, err := parseDate(s)
	if err != nil {
		return s
	}
	return t.Format(time.RFC3339Nano)
}
func (a *App) applyColumnMigrations() error {
	_, err := a.db.Exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY,email VARCHAR(128) NOT NULL UNIQUE,password_hash VARCHAR(512) NOT NULL,admin BOOLEAN,settings JSON NOT NULL DEFAULT '"{}"',usage JSON NOT NULL DEFAULT '"{}"',created_on DATETIME,updated_on DATETIME);
 CREATE TABLE IF NOT EXISTS entries (id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),functional_datetime DATETIME,entry_type VARCHAR(64) NOT NULL,entry_data JSON NOT NULL,created_on DATETIME,updated_on DATETIME);
 CREATE INDEX IF NOT EXISTS ix_entries_functional_datetime ON entries(functional_datetime);
 CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY,name VARCHAR(255) NOT NULL,user_id INTEGER NOT NULL REFERENCES users(id),day_tag BOOLEAN NOT NULL DEFAULT 0,created_on DATETIME,updated_on DATETIME,UNIQUE(name,user_id));
 CREATE TABLE IF NOT EXISTS entry_tag_xref (id INTEGER PRIMARY KEY,entry_id INTEGER NOT NULL REFERENCES entries(id),tag_id INTEGER NOT NULL REFERENCES tags(id),created_on DATETIME,updated_on DATETIME,UNIQUE(entry_id,tag_id));
 CREATE TABLE IF NOT EXISTS date_tag_xref (id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),functional_datetime DATETIME,tag_id INTEGER NOT NULL REFERENCES tags(id),created_on DATETIME,updated_on DATETIME,UNIQUE(user_id,functional_datetime,tag_id));`)
	if err != nil {
		return err
	}
	rows, err := a.db.Query("PRAGMA table_info(tags)")
	if err != nil {
		return err
	}
	found := false
	for rows.Next() {
		var cid, notnull, pk int
		var name, kind string
		var def any
		if err = rows.Scan(&cid, &name, &kind, &notnull, &def, &pk); err != nil {
			rows.Close()
			return err
		}
		if name == "day_tag" {
			found = true
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	if !found {
		_, err = a.db.Exec("ALTER TABLE tags ADD COLUMN day_tag BOOLEAN NOT NULL DEFAULT 0")
	}
	return err
}
func (a *App) user(id int64) (User, error) {
	var u User
	var settings, usage string
	var created, updated sql.NullString
	err := a.db.QueryRow("SELECT id,email,password_hash,admin,settings,usage,created_on,updated_on FROM users WHERE id=?", id).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Admin, &settings, &usage, &created, &updated)
	u.Settings = object(settings)
	u.Usage = object(usage)
	u.CreatedOn = publicTime(created.String)
	u.UpdatedOn = publicTime(updated.String)
	return u, err
}
func (a *App) entry(id, userID int64) (Entry, error) {
	var e Entry
	var data, when string
	var created, updated sql.NullString
	err := a.db.QueryRow("SELECT id,user_id,functional_datetime,entry_type,entry_data,created_on,updated_on FROM entries WHERE id=? AND user_id=?", id, userID).Scan(&e.ID, &e.UserID, &when, &e.EntryType, &data, &created, &updated)
	if err == sql.ErrNoRows {
		return e, failure("not-found", "Entry not found.")
	}
	if err != nil {
		return e, err
	}
	e.EntryData = object(data)
	e.FunctionalDatetime = publicTime(when)
	e.CreatedOn = publicTime(created.String)
	e.UpdatedOn = publicTime(updated.String)
	e.Tags = []string{}
	rows, err := a.db.Query("SELECT tags.name FROM tags JOIN entry_tag_xref x ON x.tag_id=tags.id WHERE x.entry_id=?", id)
	if err != nil {
		return e, err
	}
	defer rows.Close()
	for rows.Next() {
		var name string
		if err = rows.Scan(&name); err != nil {
			return e, err
		}
		e.Tags = append(e.Tags, name)
	}
	return e, rows.Err()
}
func (a *App) entries(where string, args ...any) ([]Entry, error) {
	rows, err := a.db.Query("SELECT id FROM entries WHERE "+where, args...)
	if err != nil {
		return nil, err
	}
	ids := []int64{}
	for rows.Next() {
		var id int64
		if err = rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		ids = append(ids, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	result := []Entry{}
	for _, id := range ids {
		e, err := a.entry(id, a.userID)
		if err != nil {
			return nil, err
		}
		result = append(result, e)
	}
	return result, nil
}
func (a *App) saveEntry(e Entry) error {
	_, err := a.db.Exec("UPDATE entries SET entry_data=?,updated_on=? WHERE id=? AND user_id=?", jsonString(e.EntryData), timestamp(a.now()), e.ID, e.UserID)
	return err
}
func (a *App) responseEntry(e Entry, short bool) Entry {
	data := map[string]any{}
	for k, v := range e.EntryData {
		data[k] = v
	}
	e.EntryData = data
	if path := text(data["path"]); path != "" && text(data["file_type"]) != "external" {
		data["path"] = "/media/" + strings.TrimPrefix(path, "static/")
	}
	if short {
		r := []rune(text(data["text"]))
		if len(r) > 64 {
			data["text"] = string(r[:64])
		}
	}
	return e
}
