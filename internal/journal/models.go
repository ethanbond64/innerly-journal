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
func (a *App) user(id int64) (User, error) {
	var u User
	var settings, usage string
	var created, updated sql.NullString
	err := a.db.QueryRow("SELECT id,email,password_hash,admin,settings,usage,created_on,updated_on FROM users WHERE id=?", id).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Admin, &settings, &usage, &created, &updated)
	u.Settings, u.Usage = object(settings), object(usage)
	u.CreatedOn, u.UpdatedOn = publicTime(created.String), publicTime(updated.String)
	return u, err
}

// A single query returns entries and their tags, avoiding two extra DB queries per card.
const entryColumns = `e.id,e.user_id,e.functional_datetime,e.entry_type,e.entry_data,e.created_on,e.updated_on,
    (SELECT json_group_array(t.name) FROM entry_tag_xref x JOIN tags t ON t.id=x.tag_id
     WHERE x.entry_id=e.id AND t.user_id=e.user_id)`

type rowScanner interface{ Scan(...any) error }

func scanEntry(row rowScanner) (Entry, error) {
	var e Entry
	var data, when, tags string
	var created, updated sql.NullString
	err := row.Scan(&e.ID, &e.UserID, &when, &e.EntryType, &data, &created, &updated, &tags)
	if err == sql.ErrNoRows {
		return e, failure("not-found", "Entry not found.")
	}
	if err != nil {
		return e, err
	}
	e.EntryData = object(data)
	e.FunctionalDatetime = publicTime(when)
	e.CreatedOn, e.UpdatedOn = publicTime(created.String), publicTime(updated.String)
	e.Tags = []string{}
	err = json.Unmarshal([]byte(tags), &e.Tags)
	return e, err
}
func readEntries(rows *sql.Rows, err error) ([]Entry, error) {
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	entries := []Entry{}
	for rows.Next() {
		entry, err := scanEntry(rows)
		if err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}
	return entries, rows.Err()
}
func (a *App) entry(id, userID int64) (Entry, error) {
	return scanEntry(a.db.QueryRow("SELECT "+entryColumns+" FROM entries e WHERE e.id=? AND e.user_id=?", id, userID))
}
func textEntries(tx *sql.Tx, userID int64) ([]Entry, error) {
	return readEntries(tx.Query("SELECT "+entryColumns+" FROM entries e WHERE e.user_id=? AND e.entry_type='text'", userID))
}
func (a *App) searchEntries(userID int64, q Query) ([]Entry, error) {
	start, end := "", ""
	if q.Date != "" {
		date, err := time.Parse("2006-01-02", q.Date)
		if err != nil {
			return nil, failure("invalid-input", "Invalid date.")
		}
		start, end = timestamp(date.AddDate(0, 0, -1)), timestamp(date.AddDate(0, 0, 2))
	}
	if q.Limit <= 0 {
		q.Limit = 10
	}
	if q.Offset < 0 {
		q.Offset = 0
	}
	pattern := "%" + q.Search + "%"
	return readEntries(a.db.Query("SELECT "+entryColumns+` FROM entries e
        WHERE e.user_id=? AND (?='' OR e.functional_datetime BETWEEN ? AND ?)
        AND (?='' OR lower(json_extract(e.entry_data,'$.title')) LIKE lower(?)
        OR (coalesce(json_extract(e.entry_data,'$.locked'),0)=0 AND lower(json_extract(e.entry_data,'$.text')) LIKE lower(?))
        OR EXISTS(SELECT 1 FROM entry_tag_xref x JOIN tags t ON t.id=x.tag_id
            WHERE x.entry_id=e.id AND t.user_id=e.user_id AND lower(t.name) LIKE lower(?)))
        ORDER BY e.functional_datetime DESC,e.id DESC LIMIT ? OFFSET ?`,
		userID, start, start, end, q.Search, pattern, pattern, pattern, q.Limit, q.Offset))
}
func (a *App) activityEntries(userID int64, start, end string) ([]Entry, error) {
	return readEntries(a.db.Query("SELECT "+entryColumns+` FROM entries e
        WHERE e.user_id=? AND e.functional_datetime>=? AND (?='' OR e.functional_datetime<=?)
        ORDER BY e.functional_datetime`, userID, start, end, end))
}
func (a *App) saveEntry(e Entry, u User) error {
	// Another window may have rekeyed after this operation read its User/Entry.
	result, err := a.db.Exec(`UPDATE entries SET entry_data=?,updated_on=? WHERE id=? AND user_id=?
        AND EXISTS(SELECT 1 FROM users WHERE id=? AND password_hash=?)`,
		jsonString(e.EntryData), timestamp(a.now()), e.ID, u.ID, u.ID, u.PasswordHash)
	if err != nil {
		return err
	}
	changed, err := result.RowsAffected()
	if err == nil && changed == 0 {
		return failure("lock-auth-expired", "Account changed in another window. Please enter your password.")
	}
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
