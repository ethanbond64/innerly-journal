package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Text in a list response is cut to this many characters.
const previewLength = 64

// The width of the activity grid, and the furthest back one request may reach.
const (
	activityDays    = 371
	activityDaysMax = 731
)

// User setting: encrypt new text entries before they are first written.
const lockByDefault = "lock_by_default"

const dateLayout = "2006-01-02"

var errEntryNotFound = errors.New("entry not found")

type EntryService struct {
	db *sql.DB

	// The signed-in user. A desktop session has exactly one, so it stands in
	// for the current_user the HTTP handlers were given by @login_required.
	user *User
}

func NewEntryService(db *sql.DB, user *User) *EntryService {
	return &EntryService{db: db, user: user}
}

// ActivityPoint is the little the activity grid draws with: when an entry is
// for, how it felt and how long it was. Full entries would be far too much to
// ship for a year at a time.
type ActivityPoint struct {
	FunctionalDatetime time.Time `json:"functional_datetime"`
	Sentiment          string    `json:"sentiment"`
	Words              int       `json:"words"`
}

// InsertEntry — POST /api/insert/entries
//
// filePath is the already-saved upload for a file entry, standing in for the
// multipart body the HTTP API took. locked overrides the user's
// lock_by_default setting when it is non-nil.
func (e *EntryService) InsertEntry(entryType string, entryData map[string]any, functionalDatetime string,
	filePath string, password string, locked *bool) (*Entry, error) {

	var tags []string
	var submittedText string

	switch entryType {

	case "text":
		if entryData == nil {
			return nil, errors.New("entry data missing")
		}

		entryData, tags = processTextEntry(entryData)
		submittedText, _ = entryData["text"].(string)

		if e.lockOnInsert(locked) {
			var err error
			if entryData, err = lockEntryData(e.user, password, entryData); err != nil {
				return nil, err
			}
		}

	case "file":
		if filePath == "" {
			return nil, errors.New("no file attached")
		}

		var err error
		entryData, tags, err = processFileEntry(e.user.ID, filePath)
		if err != nil {
			return nil, err
		}

	case "link":
		if entryData == nil {
			return nil, errors.New("entry data missing")
		}

		link, _ := entryData["link"].(string)
		if link == "" {
			return nil, errors.New("bad request, missing link")
		}

		var err error
		entryData, tags, err = processLinkEntry(e.user.ID, link)
		if err != nil {
			return nil, err
		}

	default:
		return nil, errors.New("invalid entry type")
	}

	at, err := parseFunctionalDatetime(functionalDatetime)
	if err != nil {
		return nil, err
	}

	entry := &Entry{
		UserID:             e.user.ID,
		EntryType:          entryType,
		EntryData:          entryData,
		FunctionalDatetime: at,
	}

	if err := entry.Insert(e.db); err != nil {
		return nil, err
	}

	if entry.Tags, err = e.upsertTags(tags, entry.ID); err != nil {
		return nil, err
	}

	// The writer just supplied this text, so it goes back in the clear even
	// when the entry is locked at rest.
	withPlainText(entry, submittedText)

	return entry, nil
}

// UpdateEntry — POST /api/update/entries/<id>
//
// Text entries only. changes carries the entry_data fields being edited;
// passing nil tags leaves the entry's tags alone.
func (e *EntryService) UpdateEntry(id int, changes map[string]any, tags []string) (*Entry, error) {

	entry, err := e.fetchOwnedEntry(id)
	if err != nil {
		return nil, err
	}

	if entry.EntryType != "text" {
		return nil, errors.New("entry type not supported for update")
	}

	var submittedText string
	locked, _ := entry.EntryData["locked"].(bool)

	if title, ok := changes["title"]; ok {
		entry.EntryData["title"] = title
	}

	if sentiment, ok := changes["sentiment"]; ok {
		entry.EntryData["sentiment"] = sentiment
	}

	if text, ok := changes["text"]; ok {
		submittedText, _ = text.(string)

		// Don't edit with unencrypted text coming from the client.
		if locked && isLockedText(submittedText) {
			return nil, errors.New("entry must be unlocked before it can be edited")
		}

		entry.EntryData["text"] = submittedText
		entry.EntryData["word_count"] = countWords(submittedText)

		// The entry was locked before this edit, so it is locked again. Note
		// no password is asked for here; the cached lock key covers it.
		if locked {
			entry.EntryData, err = lockEntryData(e.user, "", entry.EntryData)
			if err != nil {
				return nil, err
			}
		}
	}

	if err := entry.Update(e.db); err != nil {
		return nil, err
	}

	if tags != nil {
		if entry.Tags, err = e.upsertTags(tags, entry.ID); err != nil {
			return nil, err
		}
	} else if entry.Tags, err = e.tagNames(entry.ID); err != nil {
		return nil, err
	}

	withPlainText(entry, submittedText)

	return entry, nil
}

// FetchEntries — GET /api/fetch/entries
//
// Text is truncated to a preview. An empty search, tag or date is no filter.
func (e *EntryService) FetchEntries(limit int, offset int, search string, tag string, date string) ([]Entry, error) {

	where := []string{"user_id = ?"}
	args := []any{e.user.ID}

	// A single day +/- 1 for timezone offset.
	if date != "" {
		anchor, err := time.Parse(dateLayout, date)
		if err != nil {
			return nil, fmt.Errorf("bad request, expected date as YYYY-MM-DD: %w", err)
		}

		where = append(where, "functional_datetime >= ?", "functional_datetime <= ?")
		args = append(args, anchor.AddDate(0, 0, -1), anchor.AddDate(0, 0, 2))
	}

	// Titles, and the text of entries that are readable.
	if search != "" {
		where = append(where, `(json_extract(entry_data, '$.title') LIKE ?
			OR (COALESCE(json_extract(entry_data, '$.locked'), 0) = 0
				AND json_extract(entry_data, '$.text') LIKE ?))`)

		pattern := "%" + search + "%"
		args = append(args, pattern, pattern)
	}

	query := fmt.Sprintf(`SELECT id, user_id, functional_datetime, entry_type, entry_data, created_on, updated_on
		FROM entries WHERE %s ORDER BY functional_datetime DESC LIMIT ? OFFSET ?`, strings.Join(where, " AND "))

	rows, err := e.db.Query(query, append(args, limit, offset)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []Entry

	for rows.Next() {
		entry, err := scanEntry(rows)
		if err != nil {
			return nil, err
		}

		if text, ok := entry.EntryData["text"].(string); ok && len(text) > previewLength {
			entry.EntryData["text"] = text[:previewLength]
		}

		if entry.Tags, err = e.tagNames(entry.ID); err != nil {
			return nil, err
		}

		entries = append(entries, *entry)
	}

	return entries, rows.Err()
}

// FetchEntry — GET/POST /api/fetch/entries/<id>
//
// A password is required to read a locked entry, and unlocks it in place the
// way the POST form of the route does.
func (e *EntryService) FetchEntry(id int, password string) (*Entry, error) {

	entry, err := e.fetchOwnedEntry(id)
	if err != nil {
		return nil, err
	}

	if locked, _ := entry.EntryData["locked"].(bool); locked && password != "" {

		if !authenticated(e.user, password) {
			return nil, errUnauthorized
		}

		if entry.EntryData, err = unlockEntryData(e.user, password, entry.EntryData); err != nil {
			return nil, err
		}
	}

	if entry.Tags, err = e.tagNames(entry.ID); err != nil {
		return nil, err
	}

	return entry, nil
}

// DeleteEntry — POST /api/delete/entries/<id>
func (e *EntryService) DeleteEntry(id int) error {

	entry, err := e.fetchOwnedEntry(id)
	if err != nil {
		return err
	}

	if path, ok := entry.EntryData["path"].(string); ok {
		deleteFile(e.user.ID, path)
	}

	return entry.Delete(e.db)
}

// FetchActivity — GET /api/fetch/activity
//
// The window ends today unless before is given, which is how the client pages
// back a year at a time.
func (e *EntryService) FetchActivity(days int, before string) ([]ActivityPoint, error) {

	if days <= 0 {
		days = activityDays
	}
	days = min(days, activityDaysMax)

	anchor := time.Now().UTC()
	var until *time.Time

	if before != "" {
		parsed, err := time.Parse(dateLayout, before)
		if err != nil {
			return nil, fmt.Errorf("bad request, expected before as YYYY-MM-DD: %w", err)
		}

		anchor = parsed
		end := anchor.AddDate(0, 0, 2)
		until = &end
	}

	// A day of slack on either end, because the client buckets these into days
	// in its own timezone while the stored datetimes are UTC.
	since := anchor.AddDate(0, 0, -(days + 1))

	query := `SELECT functional_datetime, entry_data FROM entries
		WHERE user_id = ? AND functional_datetime >= ?`
	args := []any{e.user.ID, since}

	if until != nil {
		query += " AND functional_datetime <= ?"
		args = append(args, *until)
	}

	rows, err := e.db.Query(query+" ORDER BY functional_datetime ASC", args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var activity []ActivityPoint

	for rows.Next() {
		var at time.Time
		var encoded []byte

		if err := rows.Scan(&at, &encoded); err != nil {
			return nil, err
		}

		entryData, err := decodeEntryData(encoded)
		if err != nil {
			return nil, err
		}

		sentiment, _ := entryData["sentiment"].(string)

		activity = append(activity, ActivityPoint{
			FunctionalDatetime: at,
			Sentiment:          sentiment,
			Words:              entryWordCount(entryData),
		})
	}

	return activity, rows.Err()
}

// FetchMemories — GET /api/fetch/memories
//
// The other years this date has been written on, newest first. The date's own
// year is not one of its memories, so it is left out.
func (e *EntryService) FetchMemories(date string) ([]string, error) {

	anchor, err := time.Parse(dateLayout, date)
	if err != nil {
		return nil, fmt.Errorf("bad request, expected date as YYYY-MM-DD: %w", err)
	}

	rows, err := e.db.Query(
		`SELECT DISTINCT strftime('%Y', functional_datetime) AS year FROM entries
		 WHERE user_id = ? AND strftime('%m-%d', functional_datetime) = ? AND year != ?
		 ORDER BY year DESC`,
		e.user.ID, anchor.Format("01-02"), anchor.Format("2006"),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	years := []string{}

	for rows.Next() {
		var year string
		if err := rows.Scan(&year); err != nil {
			return nil, err
		}
		years = append(years, year)
	}

	return years, rows.Err()
}

// FetchTags — GET /api/fetch/tags
func (e *EntryService) FetchTags(limit int, offset int, search string) ([]Tag, error) {

	query := `SELECT id, user_id, name, created_on, updated_on FROM tags WHERE user_id = ?`
	args := []any{e.user.ID}

	if search != "" {
		query += " AND name LIKE ?"
		args = append(args, "%"+search+"%")
	}

	rows, err := e.db.Query(query+" ORDER BY created_on LIMIT ? OFFSET ?", append(args, limit, offset)...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tags []Tag

	for rows.Next() {
		var tag Tag
		if err := rows.Scan(&tag.ID, &tag.UserID, &tag.Name, &tag.CreatedOn, &tag.UpdatedOn); err != nil {
			return nil, err
		}
		tags = append(tags, tag)
	}

	return tags, rows.Err()
}

// LockEntry — POST /api/lock/entries/<id>
//
// The password is optional: the cached lock key covers a session that has
// already unlocked once.
func (e *EntryService) LockEntry(id int, password string) (*Entry, error) {

	entry, err := e.fetchOwnedEntry(id)
	if err != nil {
		return nil, err
	}

	if entry.EntryType != "text" {
		return nil, errors.New("entry type not supported for locking")
	}

	// Do nothing if already locked.
	if locked, _ := entry.EntryData["locked"].(bool); locked {
		return entry, nil
	}

	if entry.EntryData, err = lockEntryData(e.user, password, entry.EntryData); err != nil {
		return nil, err
	}

	if err := entry.Update(e.db); err != nil {
		return nil, err
	}

	return entry, nil
}

// UnlockEntry — POST /api/unlock/entries/<id>
//
// Unlike a locked read, this writes the entry back in the clear.
func (e *EntryService) UnlockEntry(id int, password string) (*Entry, error) {

	entry, err := e.fetchOwnedEntry(id)
	if err != nil {
		return nil, err
	}

	if password == "" {
		return nil, errors.New("password required to unlock entries")
	}

	if !authenticated(e.user, password) {
		return nil, errUnauthorized
	}

	if entry.EntryData, err = unlockEntryData(e.user, password, entry.EntryData); err != nil {
		return nil, err
	}

	entry.EntryData["locked"] = false

	if err := entry.Update(e.db); err != nil {
		return nil, err
	}

	return entry, nil
}

// GetFile — GET /api/static/<filename>
//
// Reads a file entry's attachment out of the user's own directory. The HTTP
// route signed these paths because a browser fetched them on its own; here the
// caller is already the signed-in session.
func (e *EntryService) GetFile(filename string) ([]byte, error) {

	// Keep the lookup inside the user's directory whatever the caller passed.
	return os.ReadFile(filepath.Join(userDirectory(e.user.ID), filepath.Base(filename)))
}

// ---- Helpers -----------------------------------------------------------

// fetchOwnedEntry loads one of the current user's entries, which is how every
// by-id route scopes its lookup.
func (e *EntryService) fetchOwnedEntry(id int) (*Entry, error) {

	row := e.db.QueryRow(
		`SELECT id, user_id, functional_datetime, entry_type, entry_data, created_on, updated_on
		 FROM entries WHERE id = ? AND user_id = ?`,
		id, e.user.ID,
	)

	entry, err := scanEntry(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errEntryNotFound
	}

	return entry, err
}

// row is what both Query rows and QueryRow satisfy, so one scan covers both.
type row interface {
	Scan(dest ...any) error
}

func scanEntry(r row) (*Entry, error) {

	var entry Entry
	var encoded []byte

	err := r.Scan(&entry.ID, &entry.UserID, &entry.FunctionalDatetime, &entry.EntryType,
		&encoded, &entry.CreatedOn, &entry.UpdatedOn)
	if err != nil {
		return nil, err
	}

	if entry.EntryData, err = decodeEntryData(encoded); err != nil {
		return nil, err
	}

	return &entry, nil
}

func decodeEntryData(encoded []byte) (map[string]any, error) {

	entryData := map[string]any{}

	if len(encoded) == 0 {
		return entryData, nil
	}

	if err := json.Unmarshal(encoded, &entryData); err != nil {
		return nil, err
	}

	return entryData, nil
}

// upsertTags lowercases and de-duplicates the given names, creates the ones
// this user does not have yet, and re-points the entry at exactly that set.
func (e *EntryService) upsertTags(names []string, entryID int) ([]string, error) {

	if _, err := e.db.Exec(`DELETE FROM entry_tag_xref WHERE entry_id = ?`, entryID); err != nil {
		return nil, err
	}

	if len(names) == 0 {
		return []string{}, nil
	}

	seen := map[string]bool{}
	tags := []string{}

	for _, name := range names {
		name = strings.ToLower(name)

		if name == "" || seen[name] {
			continue
		}
		seen[name] = true

		var tagID int
		err := e.db.QueryRow(`SELECT id FROM tags WHERE user_id = ? AND name = ?`, e.user.ID, name).Scan(&tagID)

		if errors.Is(err, sql.ErrNoRows) {
			tag := &Tag{UserID: e.user.ID, Name: name}
			if err := tag.Insert(e.db); err != nil {
				return nil, err
			}
			tagID = tag.ID
		} else if err != nil {
			return nil, err
		}

		xref := &EntryTagXref{EntryID: entryID, TagID: tagID}
		if err := xref.Insert(e.db); err != nil {
			return nil, err
		}

		tags = append(tags, name)
	}

	return tags, nil
}

// tagNames reads back the names an entry is tagged with.
func (e *EntryService) tagNames(entryID int) ([]string, error) {

	rows, err := e.db.Query(
		`SELECT tags.name FROM tags
		 JOIN entry_tag_xref ON tags.id = entry_tag_xref.tag_id
		 WHERE entry_tag_xref.entry_id = ?`,
		entryID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	names := []string{}

	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		names = append(names, name)
	}

	return names, rows.Err()
}

// lockOnInsert decides whether a new text entry is encrypted before it is ever
// written. The caller's flag wins; without one the user's setting applies.
func (e *EntryService) lockOnInsert(requested *bool) bool {

	if requested != nil {
		return *requested
	}

	if setting, ok := e.user.Settings[lockByDefault].(bool); ok {
		return setting
	}

	return true
}

// withPlainText puts the text the writer just supplied back on a locked entry.
// It is a property of this response, never of the stored entry.
func withPlainText(entry *Entry, text string) {

	if text == "" {
		return
	}

	if locked, _ := entry.EntryData["locked"].(bool); !locked {
		return
	}

	entry.EntryData["text"] = text
	entry.TextUnlocked = true
}

// entryWordCount reads the length a text entry carries. Entries written before
// that field existed are counted from their text, which is only possible while
// they are unlocked.
func entryWordCount(entryData map[string]any) int {

	if count, ok := entryData["word_count"].(float64); ok {
		return int(count)
	}

	if locked, _ := entryData["locked"].(bool); locked {
		return 0
	}

	text, _ := entryData["text"].(string)

	return countWords(text)
}

func countWords(text string) int {
	return len(strings.Fields(text))
}

func parseFunctionalDatetime(value string) (time.Time, error) {

	if value == "" {
		return time.Now().UTC(), nil
	}

	return time.Parse("2006-01-02T15:04:05.000Z", value)
}
