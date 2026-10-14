package journal

import (
	"encoding/base64"
	"strings"
	"time"
)

type Credentials struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}
type PasswordInput struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
	LockAll         bool   `json:"lock_all"`
}
type Query struct {
	Search string `json:"search"`
	Limit  int    `json:"limit"`
	Offset int    `json:"offset"`
	Date   string `json:"date"`
	Days   int    `json:"days"`
	Before string `json:"before"`
}
type DayInput struct {
	Name               string `json:"name"`
	FunctionalDatetime string `json:"functional_datetime"`
}

func (a *App) Signup(input Credentials) Result {
	a.mu.Lock()
	defer a.mu.Unlock()
	if !emailPattern.MatchString(input.Email) || !validatePassword(input.Password) {
		return outcome(nil, failure("invalid-input", "A valid email and password of at least 8 characters are required."))
	}
	hash, err := encryptPassword(input.Password)
	if err != nil {
		return outcome(nil, err)
	}
	tx, err := a.db.Begin()
	if err != nil {
		return outcome(nil, err)
	}
	defer tx.Rollback()
	var count int
	if err = tx.QueryRow("SELECT count(*) FROM users WHERE email=?", input.Email).Scan(&count); err != nil {
		return outcome(nil, err)
	}
	if count > 0 {
		return outcome(nil, failure("conflict", "Account already exists."))
	}
	if err = tx.QueryRow("SELECT count(*) FROM users").Scan(&count); err != nil {
		return outcome(nil, err)
	}
	now := timestamp(a.now())
	r, err := tx.Exec("INSERT INTO users(email,password_hash,admin,settings,usage,created_on,updated_on) VALUES(?,?,?,'{}','{}',?,?)", input.Email, hash, count == 0, now, now)
	if err != nil {
		return outcome(nil, err)
	}
	id, err := r.LastInsertId()
	if err != nil {
		return outcome(nil, err)
	}
	if err = tx.Commit(); err != nil {
		return outcome(nil, err)
	}
	delete(a.keys, a.userID)
	a.userID = id
	u, err := a.user(a.userID)
	return outcome(u, err)
}
func (a *App) Login(input Credentials) Result {
	a.mu.Lock()
	defer a.mu.Unlock()
	var id int64
	err := a.db.QueryRow("SELECT id FROM users WHERE email=?", input.Email).Scan(&id)
	if err != nil {
		return outcome(nil, failure("unauthorized", "Incorrect email or password."))
	}
	u, err := a.user(id)
	if err != nil || !authenticated(u, input.Password) {
		return outcome(nil, failure("unauthorized", "Incorrect email or password."))
	}
	delete(a.keys, a.userID)
	a.userID = id
	_, err = a.getScryptKey(u, input.Password, false)
	return outcome(u, err)
}
func (a *App) UpdateUser(id int64, settings map[string]any) Result {
	return a.run(func(current User) (any, error) {
		if current.ID != id && !current.Admin {
			return nil, failure("unauthorized", "Unauthorized.")
		}
		u, err := a.user(id)
		if err != nil {
			return nil, failure("not-found", "User not found.")
		}
		if _, one := settings["lock_ttl_value"]; one || settings["lock_ttl_unit"] != nil {
			if _, err = parseLockTTL(settings); err != nil {
				return nil, err
			}
			u.Settings["lock_ttl_value"] = settings["lock_ttl_value"]
			u.Settings["lock_ttl_unit"] = settings["lock_ttl_unit"]
		}
		if value, ok := settings["lock_by_default"].(bool); ok {
			u.Settings["lock_by_default"] = value
		}
		if value := text(settings["sensitivity"]); value == "default" || value == "blur" || value == "both" {
			u.Settings["sensitivity"] = value
		}
		_, err = a.db.Exec("UPDATE users SET settings=?,updated_on=? WHERE id=?", jsonString(u.Settings), timestamp(a.now()), id)
		return u, err
	})
}
func (a *App) InsertEntry(input EntryInput) Result {
	return a.run(func(u User) (any, error) {
		data := input.EntryData
		if data == nil {
			data = map[string]any{}
		}
		var err error
		submitted := ""
		switch input.EntryType {
		case "text":
			if input.Draft {
				value := text(data["text"])
				data = map[string]any{"title": data["title"], "text": value, "word_count": countWords(value), "sentiment": "neutral"}
			} else {
				data = processTextEntry(data)
			}
			submitted = text(data["text"])
			locked := true
			if value, ok := u.Settings["lock_by_default"].(bool); ok {
				locked = value
			}
			if input.Locked != nil {
				locked = *input.Locked
			}
			if locked {
				err = a.lockEntryData(u, input.Password, data)
			}
		case "file":
			if len(input.ContentBase64) > maxResponseBytes*2 {
				return nil, failure("invalid-input", "Image is too large.")
			}
			var content []byte
			content, err = base64.StdEncoding.DecodeString(input.ContentBase64)
			if err == nil {
				data, err = a.processFileEntry(u.ID, input.Filename, content)
			}
		case "link":
			data, err = a.processLinkEntry(a.ctx, u.ID, text(data["link"]))
		default:
			return nil, failure("invalid-input", "Invalid entry type.")
		}
		if err != nil {
			return nil, err
		}
		when := a.now()
		if input.FunctionalDatetime != "" {
			when, err = parseDate(input.FunctionalDatetime)
			if err != nil {
				return nil, err
			}
		}
		now := timestamp(a.now())
		result, err := a.db.Exec(`INSERT INTO entries(user_id,functional_datetime,entry_type,entry_data,created_on,updated_on)
            SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND password_hash=?)`,
			u.ID, timestamp(when), input.EntryType, jsonString(data), now, now, u.ID, u.PasswordHash)
		if err != nil {
			return nil, err
		}
		changed, err := result.RowsAffected()
		if err != nil {
			return nil, err
		}
		if changed == 0 {
			return nil, failure("lock-auth-expired", "Account changed in another window. Please enter your password.")
		}
		id, _ := result.LastInsertId()
		e, err := a.entry(id, u.ID)
		if err != nil {
			return nil, err
		}
		if input.EntryType == "text" && flag(data["locked"]) {
			e.EntryData["text"] = submitted
			e.TextUnlocked = true
		}
		return a.responseEntry(e, false), nil
	})
}
func (a *App) UpdateEntry(id int64, input EntryInput) Result {
	return a.run(func(u User) (any, error) {
		e, err := a.entry(id, u.ID)
		if err != nil {
			return nil, err
		}
		if e.EntryType != "text" {
			return nil, failure("invalid-input", "Only text entries can be edited.")
		}
		for _, name := range []string{"title", "sentiment"} {
			if v, ok := input.EntryData[name]; ok {
				e.EntryData[name] = v
			}
		}
		submitted, changed := input.EntryData["text"]
		if changed {
			if flag(e.EntryData["locked"]) && strings.HasPrefix(text(submitted), "b'gAAAA") {
				return nil, failure("conflict", "Entry must be unlocked before editing.")
			}
			e.EntryData["text"] = text(submitted)
			e.EntryData["word_count"] = countWords(text(submitted))
			if !input.Draft {
				if _, specified := input.EntryData["sentiment"]; !specified {
					e.EntryData["sentiment"] = getSentiment(text(submitted))
				}
			}
			if flag(e.EntryData["locked"]) {
				if err = a.lockEntryData(u, "", e.EntryData); err != nil {
					return nil, err
				}
			}
		}
		if err = a.saveEntry(e, u); err != nil {
			return nil, err
		}
		if changed && flag(e.EntryData["locked"]) {
			e.EntryData["text"] = submitted
			e.TextUnlocked = true
		}
		return e, nil
	})
}
func (a *App) FetchEntry(id int64, password string) Result {
	return a.run(func(u User) (any, error) {
		e, err := a.entry(id, u.ID)
		if err != nil {
			return nil, err
		}
		if password != "" && flag(e.EntryData["locked"]) {
			if !authenticated(u, password) {
				return nil, failure("unauthorized", "Incorrect password.")
			}
			key, err := a.getScryptKey(u, password, false)
			if err != nil {
				return nil, err
			}
			plain, err := unlockTextAtVersion(u, e.EntryData, key)
			if err != nil {
				return nil, err
			}
			e.EntryData["text"] = plain
			e.TextUnlocked = true
		}
		return a.responseEntry(e, false), nil
	})
}
func (a *App) DeleteEntry(id int64) Result {
	return a.run(func(u User) (any, error) {
		if _, err := a.entry(id, u.ID); err != nil {
			return nil, err
		}
		_, err := a.db.Exec("DELETE FROM entries WHERE id=? AND user_id=?", id, u.ID)
		return nil, err
	})
}
func (a *App) LockEntry(id int64, password string) Result {
	return a.run(func(u User) (any, error) {
		e, err := a.entry(id, u.ID)
		if err != nil {
			return nil, err
		}
		if e.EntryType != "text" {
			return nil, failure("invalid-input", "Only text entries can be locked.")
		}
		if !flag(e.EntryData["locked"]) {
			if err = a.lockEntryData(u, password, e.EntryData); err != nil {
				return nil, err
			}
			err = a.saveEntry(e, u)
		}
		return e, err
	})
}
func (a *App) UnlockEntry(id int64, password string) Result {
	return a.run(func(u User) (any, error) {
		e, err := a.entry(id, u.ID)
		if err != nil {
			return nil, err
		}
		if !authenticated(u, password) {
			return nil, failure("unauthorized", "Incorrect password.")
		}
		key, err := a.getScryptKey(u, password, false)
		if err != nil {
			return nil, err
		}
		if flag(e.EntryData["locked"]) {
			plain, err := unlockTextAtVersion(u, e.EntryData, key)
			if err != nil {
				return nil, err
			}
			e.EntryData["text"] = plain
			e.EntryData["locked"] = false
			err = a.saveEntry(e, u)
			return e, err
		}
		return e, nil
	})
}
func (a *App) AuthenticateLock(password string) Result {
	return a.run(func(u User) (any, error) { _, err := a.getScryptKey(u, password, false); return nil, err })
}
func (a *App) UpdatePassword(input PasswordInput) Result {
	count := 0
	r := a.run(func(u User) (any, error) {
		if !authenticated(u, input.CurrentPassword) {
			return nil, failure("unauthorized", "Current password incorrect.")
		}
		if !validatePassword(input.NewPassword) {
			return nil, failure("invalid-input", "Password must be at least 8 characters.")
		}
		oldKey, err := deriveScryptKey(u, input.CurrentPassword)
		if err != nil {
			return nil, err
		}
		newKey, err := deriveScryptKey(u, input.NewPassword)
		if err != nil {
			return nil, err
		}
		hash, err := encryptPassword(input.NewPassword)
		if err != nil {
			return nil, err
		}
		tx, err := a.db.Begin()
		if err != nil {
			return nil, err
		}
		defer tx.Rollback()
		var currentHash string
		if err = tx.QueryRow("SELECT password_hash FROM users WHERE id=?", u.ID).Scan(&currentHash); err != nil {
			return nil, err
		}
		if currentHash != u.PasswordHash {
			return nil, failure("conflict", "Password changed in another window. Please try again.")
		}
		// Load under the same write transaction that changes the hash. Entries
		// inserted by another window must not slip between the snapshot and rekey.
		entries, err := textEntries(tx, u.ID)
		if err != nil {
			return nil, err
		}
		for _, e := range entries {
			if !flag(e.EntryData["locked"]) && !input.LockAll {
				continue
			}
			plain := text(e.EntryData["text"])
			if flag(e.EntryData["locked"]) {
				plain, err = unlockTextAtVersion(u, e.EntryData, oldKey)
				if err != nil {
					return nil, failure("conflict", "Could not re-encrypt your locked entries. Password unchanged.")
				}
			}
			ciphertext, err := lockText(newKey, plain)
			if err != nil {
				return nil, err
			}
			e.EntryData["text"] = ciphertext
			e.EntryData["locked"] = true
			e.EntryData["lock_version"] = 1
			if _, err = tx.Exec("UPDATE entries SET entry_data=?,updated_on=? WHERE id=?", jsonString(e.EntryData), timestamp(a.now()), e.ID); err != nil {
				return nil, err
			}
			count++
		}
		if _, err = tx.Exec("UPDATE users SET password_hash=?,updated_on=? WHERE id=?", hash, timestamp(a.now()), u.ID); err != nil {
			return nil, err
		}
		if err = tx.Commit(); err != nil {
			return nil, err
		}
		a.keys[u.ID] = cachedKey{Key: newKey, Expires: a.now().Add(getLockTTL(u)), PasswordHash: hash}
		return nil, nil
	})
	if r.Error == nil {
		r.Reencrypted = count
	}
	return r
}
func (a *App) FetchEntries(q Query) Result {
	return a.run(func(u User) (any, error) {
		entries, err := a.searchEntries(u.ID, q)
		for i, e := range entries {
			entries[i] = a.responseEntry(e, true)
		}
		return entries, err
	})
}
func (a *App) FetchActivity(q Query) Result {
	return a.run(func(u User) (any, error) {
		days := q.Days
		if days == 0 {
			days = 371
		}
		if days < 1 {
			days = 1
		}
		if days > 731 {
			days = 731
		}
		anchor := a.now()
		var err error
		if q.Before != "" {
			anchor, err = time.Parse("2006-01-02", q.Before)
			if err != nil {
				return nil, failure("invalid-input", "Invalid date.")
			}
		}
		end := ""
		if q.Before != "" {
			end = timestamp(anchor.AddDate(0, 0, 2))
		}
		entries, err := a.activityEntries(u.ID, timestamp(anchor.AddDate(0, 0, -days-1)), end)
		if err != nil {
			return nil, err
		}
		result := []map[string]any{}
		for _, e := range entries {
			words := number(e.EntryData["word_count"])
			if _, ok := e.EntryData["word_count"]; !ok && !flag(e.EntryData["locked"]) {
				words = countWords(text(e.EntryData["text"]))
			}
			result = append(result, map[string]any{"functional_datetime": e.FunctionalDatetime, "sentiment": e.EntryData["sentiment"], "words": words})
		}
		return result, nil
	})
}
func (a *App) FetchMemories(date string) Result {
	return a.run(func(u User) (any, error) {
		anchor, err := time.Parse("2006-01-02", date)
		if err != nil {
			return nil, failure("invalid-input", "Invalid date.")
		}
		rows, err := a.db.Query("SELECT DISTINCT functional_datetime FROM entries WHERE user_id=? AND strftime('%m-%d',functional_datetime) IN (?,?,?) ORDER BY functional_datetime DESC", u.ID, anchor.AddDate(0, 0, -1).Format("01-02"), anchor.Format("01-02"), anchor.AddDate(0, 0, 1).Format("01-02"))
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		dates := []string{}
		for rows.Next() {
			var date string
			if err = rows.Scan(&date); err != nil {
				return nil, err
			}
			dates = append(dates, publicTime(date))
		}
		return map[string]any{"datetimes": dates}, rows.Err()
	})
}
func (a *App) InsertDateTag(input DayInput) Result {
	return a.run(func(u User) (any, error) {
		name := strings.ToLower(strings.TrimSpace(input.Name))
		if len([]rune(name)) < 1 || len([]rune(name)) > 255 {
			return nil, failure("invalid-input", "A valid tag name is required.")
		}
		when, err := parseDate(input.FunctionalDatetime)
		if err != nil {
			return nil, err
		}
		now := timestamp(a.now())
		tx, err := a.db.Begin()
		if err != nil {
			return nil, err
		}
		defer tx.Rollback()
		_, err = tx.Exec("INSERT INTO tags(name,user_id,day_tag,created_on,updated_on) VALUES(?,?,1,?,?) ON CONFLICT(name,user_id) DO UPDATE SET day_tag=1", name, u.ID, now, now)
		if err != nil {
			return nil, err
		}
		var tagID, id int64
		if err = tx.QueryRow("SELECT id FROM tags WHERE user_id=? AND name=?", u.ID, name).Scan(&tagID); err != nil {
			return nil, err
		}
		_, err = tx.Exec("INSERT OR IGNORE INTO date_tag_xref(user_id,functional_datetime,tag_id,created_on,updated_on) VALUES(?,?,?,?,?)", u.ID, timestamp(when), tagID, now, now)
		if err != nil {
			return nil, err
		}
		err = tx.QueryRow("SELECT id FROM date_tag_xref WHERE user_id=? AND functional_datetime=? AND tag_id=?", u.ID, timestamp(when), tagID).Scan(&id)
		if err != nil {
			return nil, err
		}
		err = tx.Commit()
		return DateTag{id, tagID, name, when.Format(time.RFC3339Nano)}, err
	})
}
func (a *App) DeleteDateTag(id int64) Result {
	return a.run(func(u User) (any, error) {
		var tag int64
		if err := a.db.QueryRow("SELECT tag_id FROM date_tag_xref WHERE id=? AND user_id=?", id, u.ID).Scan(&tag); err != nil {
			return nil, failure("not-found", "Day tag not found.")
		}
		tx, err := a.db.Begin()
		if err != nil {
			return nil, err
		}
		defer tx.Rollback()
		if _, err = tx.Exec("DELETE FROM date_tag_xref WHERE id=?", id); err != nil {
			return nil, err
		}
		_, err = tx.Exec("UPDATE tags SET day_tag=0 WHERE id=? AND NOT EXISTS(SELECT 1 FROM date_tag_xref WHERE tag_id=?)", tag, tag)
		if err != nil {
			return nil, err
		}
		return nil, tx.Commit()
	})
}
func (a *App) FetchTaggedDays() Result {
	return a.run(func(u User) (any, error) {
		rows, err := a.db.Query("SELECT x.id,x.tag_id,t.name,x.functional_datetime FROM date_tag_xref x JOIN tags t ON t.id=x.tag_id WHERE x.user_id=? ORDER BY x.functional_datetime DESC", u.ID)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		result := []DateTag{}
		for rows.Next() {
			var tag DateTag
			if err = rows.Scan(&tag.ID, &tag.TagID, &tag.Name, &tag.FunctionalDatetime); err != nil {
				return nil, err
			}
			tag.FunctionalDatetime = publicTime(tag.FunctionalDatetime)
			result = append(result, tag)
		}
		return result, rows.Err()
	})
}
func (a *App) tags(u User, q Query, days bool) (any, error) {
	where := "user_id=?"
	if days {
		where += " AND day_tag=1"
	}
	if q.Limit <= 0 {
		q.Limit = 30
	}
	order := "created_on"
	if days {
		order = "name"
	}
	rows, err := a.db.Query("SELECT id,user_id,name,day_tag FROM tags WHERE "+where+" AND lower(name) LIKE lower(?) ORDER BY "+order+" LIMIT ? OFFSET ?", u.ID, "%"+q.Search+"%", q.Limit, q.Offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []Tag{}
	for rows.Next() {
		var tag Tag
		if err = rows.Scan(&tag.ID, &tag.UserID, &tag.Name, &tag.DayTag); err != nil {
			return nil, err
		}
		result = append(result, tag)
	}
	return result, rows.Err()
}
func (a *App) FetchTags(q Query) Result {
	return a.run(func(u User) (any, error) { return a.tags(u, q, false) })
}
func (a *App) FetchDateTags(q Query) Result {
	return a.run(func(u User) (any, error) { return a.tags(u, q, true) })
}
