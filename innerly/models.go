
import (
	"time"
)

type BaseModel struct {
    created_on time.Time
    updated_on time.Time
}

type User struct {
    BaseModel
    id int
    email string
    password_hash string
    settings map[string]any
}

type Entry struct {
    BaseModel
    id int
    user_id int
    functional_datetime time.Time
    entry_type string
    entry_data map[string]any
}

type Tag struct {
    BaseModel
    id int
    user_id string
    name string
}

type EntryTagXref struct {
    BaseModel
    id int
    entry_id int
    tag_id int
}