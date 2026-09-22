
import (
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
}

// Table: tags
type Tag struct {
	BaseModel
	ID     int    `json:"id" db:"id"`
	UserID string `json:"user_id" db:"user_id"`
	Name   string `json:"name" db:"name"`
}

// Table: entry_tag_xref
type EntryTagXref struct {
	BaseModel
	ID      int `json:"id" db:"id"`
	EntryID int `json:"entry_id" db:"entry_id"`
	TagID   int `json:"tag_id" db:"tag_id"`
}