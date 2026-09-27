package main

import (
	"database/sql"
	"encoding/json"
	"time"
)

type BaseModel struct {
	CreatedOn time.Time `json:"created_on" db:"created_on"`
	UpdatedOn time.Time `json:"updated_on" db:"updated_on"`
}

// Table: users
type User struct {
	BaseModel
	ID           int            `json:"id" db:"id"`
	Email        string         `json:"email" db:"email"`
	PasswordHash string         `json:"-" db:"password_hash"`
	Settings     map[string]any `json:"settings" db:"settings"`
}

// Table: entries
type Entry struct {
	BaseModel
	ID                 int            `json:"id" db:"id"`
	UserID             int            `json:"user_id" db:"user_id"`
	FunctionalDatetime time.Time      `json:"functional_datetime" db:"functional_datetime"`
	EntryType          string         `json:"entry_type" db:"entry_type"`
	EntryData          map[string]any `json:"entry_data" db:"entry_data"`

	// Tags is read from entry_tag_xref rather than a column of its own, and
	// TextUnlocked marks a response carrying text the writer just supplied for
	// an entry that is locked at rest. Neither is ever written back.
	Tags         []string `json:"tags" db:"-"`
	TextUnlocked bool     `json:"text_unlocked,omitempty" db:"-"`
}

// Table: tags
type Tag struct {
	BaseModel
	ID     int    `json:"id" db:"id"`
	UserID int    `json:"user_id" db:"user_id"`
	Name   string `json:"name" db:"name"`
}

// Table: entry_tag_xref
type EntryTagXref struct {
	BaseModel
	ID      int `json:"id" db:"id"`
	EntryID int `json:"entry_id" db:"entry_id"`
	TagID   int `json:"tag_id" db:"tag_id"`
}

// ---- Tags --------------------------------------------------------------

// Insert writes a new tag row and back-fills the generated id.
func (t *Tag) Insert(db *sql.DB) error {

	now := time.Now().UTC()
	t.CreatedOn = now
	t.UpdatedOn = now

	result, err := db.Exec(
		`INSERT INTO tags (user_id, name, created_on, updated_on) VALUES (?, ?, ?, ?)`,
		t.UserID, t.Name, t.CreatedOn, t.UpdatedOn,
	)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return err
	}

	t.ID = int(id)
	return nil
}

// Insert writes a new entry/tag join row and back-fills the generated id.
func (x *EntryTagXref) Insert(db *sql.DB) error {

	now := time.Now().UTC()
	x.CreatedOn = now
	x.UpdatedOn = now

	result, err := db.Exec(
		`INSERT INTO entry_tag_xref (entry_id, tag_id, created_on, updated_on) VALUES (?, ?, ?, ?)`,
		x.EntryID, x.TagID, x.CreatedOn, x.UpdatedOn,
	)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return err
	}

	x.ID = int(id)
	return nil
}

// ---- Users -------------------------------------------------------------

// Insert writes a new user row and back-fills the generated id.
func (u *User) Insert(db *sql.DB) error {

	settings, err := json.Marshal(u.Settings)
	if err != nil {
		return err
	}

	now := time.Now().UTC()
	u.CreatedOn = now
	u.UpdatedOn = now

	result, err := db.Exec(
		`INSERT INTO users (email, password_hash, settings, created_on, updated_on) VALUES (?, ?, ?, ?, ?)`,
		u.Email, u.PasswordHash, string(settings), u.CreatedOn, u.UpdatedOn,
	)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return err
	}

	u.ID = int(id)
	return nil
}

// Update writes the user's settings back to its row. Settings are the only
// updatable column.
func (u *User) Update(db *sql.DB) error {

	settings, err := json.Marshal(u.Settings)
	if err != nil {
		return err
	}

	u.UpdatedOn = time.Now().UTC()

	_, err = db.Exec(
		`UPDATE users SET settings = ?, updated_on = ? WHERE id = ?`,
		string(settings), u.UpdatedOn, u.ID,
	)
	return err
}

// ---- Entries -----------------------------------------------------------

// Insert writes a new entry row and back-fills the generated id.
func (e *Entry) Insert(db *sql.DB) error {

	entryData, err := json.Marshal(e.EntryData)
	if err != nil {
		return err
	}

	now := time.Now().UTC()
	e.CreatedOn = now
	e.UpdatedOn = now

	result, err := db.Exec(
		`INSERT INTO entries (user_id, functional_datetime, entry_type, entry_data, created_on, updated_on)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		e.UserID, e.FunctionalDatetime, e.EntryType, string(entryData), e.CreatedOn, e.UpdatedOn,
	)
	if err != nil {
		return err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return err
	}

	e.ID = int(id)
	return nil
}

// Update writes the entry's current values back to its row.
func (e *Entry) Update(db *sql.DB) error {

	entryData, err := json.Marshal(e.EntryData)
	if err != nil {
		return err
	}

	e.UpdatedOn = time.Now().UTC()

	_, err = db.Exec(
		`UPDATE entries SET functional_datetime = ?, entry_type = ?, entry_data = ?, updated_on = ?
		 WHERE id = ?`,
		e.FunctionalDatetime, e.EntryType, string(entryData), e.UpdatedOn, e.ID,
	)
	return err
}

// Delete removes the entry's row.
func (e *Entry) Delete(db *sql.DB) error {

	_, err := db.Exec(`DELETE FROM entries WHERE id = ?`, e.ID)
	return err
}
