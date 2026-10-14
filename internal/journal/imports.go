package journal

import (
	"archive/zip"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"database/sql"
	"encoding/base64"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

var requiredCSVs = []string{"entries.csv", "media_entries.csv", "specifics.csv", "themes.csv", "entry_specific_xref.csv", "entry_theme_xref.csv"}

type ImportInput struct {
	Path     string `json:"path"`
	Passcode string `json:"passcode"`
}
type ImportFailure struct {
	EntryID   string `json:"entry_id"`
	EntryType string `json:"entry_type"`
	Error     string `json:"error"`
	Link      string `json:"link,omitempty"`
	File      string `json:"file,omitempty"`
}
type ImportJobState struct {
	Status    string          `json:"status"`
	Total     int             `json:"total"`
	Processed int             `json:"processed"`
	Failures  int             `json:"failures"`
	Errors    []ImportFailure `json:"errors"`
}
type importJob struct {
	state  ImportJobState
	cancel context.CancelFunc
}

func (a *App) ImportFiles() Result {
	return a.run(func(u User) (any, error) {
		entries, err := os.ReadDir(filepath.Join(a.config.DataDir, "imports"))
		if err != nil {
			return nil, err
		}
		files := []string{}
		for _, entry := range entries {
			if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".zip") {
				files = append(files, entry.Name())
			}
		}
		sort.Strings(files)
		return files, nil
	})
}
func (a *App) StartImport(input ImportInput) Result {
	r := a.run(func(u User) (any, error) {
		if job := a.jobs[u.ID]; job != nil && job.state.Status == "running" {
			return nil, failure("conflict", "An import is already in progress.")
		}
		if input.Path == "" || filepath.Base(input.Path) != input.Path || strings.ContainsAny(input.Path, "/\\") {
			return nil, failure("invalid-input", "Choose an archive from the imports directory.")
		}
		archive, err := zip.OpenReader(filepath.Join(a.config.DataDir, "imports", input.Path))
		if err != nil {
			return nil, failure("invalid-input", "Unable to open ZIP archive.")
		}
		files := map[string]*zip.File{}
		for _, file := range archive.File {
			files[file.Name] = file
		}
		for _, name := range requiredCSVs {
			if files[name] == nil {
				archive.Close()
				return nil, failure("invalid-input", "Missing required file: "+name)
			}
		}
		secret := ""
		if file := files["secret.json"]; file != nil {
			stream, err := file.Open()
			if err != nil {
				archive.Close()
				return nil, err
			}
			var value map[string]string
			err = json.NewDecoder(stream).Decode(&value)
			stream.Close()
			if err != nil {
				archive.Close()
				return nil, failure("invalid-input", "Unable to read secret.json.")
			}
			secret = value["secret"]
		}
		ctx, cancel := context.WithCancel(a.ctx)
		job := &importJob{state: ImportJobState{Status: "running", Errors: []ImportFailure{}}, cancel: cancel}
		a.jobs[u.ID] = job
		a.workers.Add(1)
		go func() {
			defer a.workers.Done()
			defer archive.Close()
			defer cancel()
			a.importEntries(ctx, u.ID, input.Passcode, secret, files, job)
		}()
		return nil, nil
	})
	r.Started = r.Error == nil
	return r
}
func (a *App) ImportStatus() Result {
	return a.run(func(u User) (any, error) {
		job := a.jobs[u.ID]
		if job == nil {
			return nil, failure("not-found", "No import job found.")
		}
		state := job.state
		state.Errors = append([]ImportFailure{}, state.Errors...)
		return state, nil
	})
}
func (a *App) CancelImport() Result {
	return a.run(func(u User) (any, error) {
		job := a.jobs[u.ID]
		if job == nil || job.state.Status != "running" {
			return nil, failure("not-found", "No running import to cancel.")
		}
		job.cancel()
		return nil, nil
	})
}
func readCSVRows(file *zip.File) ([]map[string]string, error) {
	stream, err := file.Open()
	if err != nil {
		return nil, err
	}
	defer stream.Close()
	reader := csv.NewReader(stream)
	reader.FieldsPerRecord = -1
	header, err := reader.Read()
	if err == io.EOF {
		return []map[string]string{}, nil
	}
	if err != nil {
		return nil, err
	}
	result := []map[string]string{}
	for {
		values, err := reader.Read()
		if err == io.EOF {
			return result, nil
		}
		if err != nil {
			return nil, err
		}
		row := map[string]string{}
		for i, key := range header {
			if i < len(values) {
				row[key] = values[i]
			}
		}
		result = append(result, row)
	}
}
func (a *App) importEntries(ctx context.Context, userID int64, passcode, secret string, files map[string]*zip.File, job *importJob) {
	tables := map[string][]map[string]string{}
	for _, name := range requiredCSVs {
		rows, err := readCSVRows(files[name])
		if err != nil {
			a.mu.Lock()
			job.state.Status = "failed"
			job.state.Failures++
			job.state.Errors = append(job.state.Errors, ImportFailure{Error: err.Error()})
			a.mu.Unlock()
			return
		}
		tables[name] = rows
	}
	media := map[string]map[string]string{}
	for _, row := range tables["media_entries.csv"] {
		media[row["id"]] = row
	}
	names := map[string]string{}
	for _, kind := range []string{"specific", "theme"} {
		table := kind + "s.csv"
		for _, row := range tables[table] {
			names[kind+row["id"]] = row["title"]
		}
	}
	tags := map[string][]string{}
	for _, kind := range []string{"specific", "theme"} {
		for _, row := range tables["entry_"+kind+"_xref.csv"] {
			if name := names[kind+row[kind+"_id"]]; name != "" {
				tags[row["entry_id"]] = append(tags[row["entry_id"]], name)
			}
		}
	}
	a.mu.Lock()
	job.state.Total = len(tables["entries.csv"])
	a.mu.Unlock()
	for _, row := range tables["entries.csv"] {
		if ctx.Err() != nil {
			break
		}
		err := a.importEntry(ctx, userID, row, media, tags[row["id"]], files, passcode, secret)
		a.mu.Lock()
		if err == nil {
			job.state.Processed++
		} else {
			job.state.Failures++
			failure := ImportFailure{EntryID: row["id"], EntryType: "text", Error: err.Error()}
			if n, e := strconv.ParseFloat(row["media_entry_id"], 64); e == nil {
				if m := media[strconv.Itoa(int(n))]; m != nil {
					failure.EntryType = m["media_type"]
					failure.Link = m["link"]
					failure.File = m["thumbnail_img"]
				}
			}
			job.state.Errors = append(job.state.Errors, failure)
		}
		a.mu.Unlock()
	}
	a.mu.Lock()
	job.state.Status = "complete"
	if ctx.Err() != nil {
		job.state.Status = "cancelled"
	}
	a.mu.Unlock()
}
func (a *App) importEntry(ctx context.Context, userID int64, row map[string]string, media map[string]map[string]string, tags []string, files map[string]*zip.File, passcode, secret string) error {
	times := []string{}
	for _, field := range []string{"created_on", "updated_on", "functional_timestamp"} {
		value := row[field]
		if i := strings.LastIndex(value, "+"); i >= 0 {
			value = value[:i]
		}
		when, err := parseDate(value)
		if err != nil {
			return err
		}
		times = append(times, timestamp(when))
	}
	kind := "text"
	var data map[string]any
	mediaID, mediaErr := strconv.ParseFloat(row["media_entry_id"], 64)
	if mediaErr != nil || math.IsNaN(mediaID) {
		title := row["title"]
		if strings.EqualFold(title, "nan") {
			title = ""
		}
		value := row["text"]
		words := countWords(value)
		locked := strings.EqualFold(row["locked"], "true")
		if locked && passcode != "" && secret != "" {
			var err error
			value, err = unlockImportText(secret, passcode, row)
			if err != nil {
				return err
			}
			words = countWords(value)
		} else if locked {
			words = 0
		}
		sentiment, _ := strconv.ParseFloat(row["sentiment_idx"], 64)
		if row["sentiment_idx"] == "" {
			sentiment = 1
		}
		data = map[string]any{"title": title, "text": value, "word_count": words, "sentiment": sentimentIndexToValue(int(sentiment))}
	} else {
		m := media[strconv.Itoa(int(mediaID))]
		if m == nil {
			return fmt.Errorf("media entry not found")
		}
		var err error
		switch m["media_type"] {
		case "link":
			kind = "link"
			data, err = a.processLinkEntry(ctx, userID, m["link"])
			if err == nil && data["path"] == nil {
				err = fmt.Errorf("failed to fetch link preview")
			}
		case "image_upload_s3":
			kind = "file"
			name := path.Base(m["thumbnail_img"])
			file := files["images/"+name]
			if file == nil {
				return fmt.Errorf("image not found: %s", name)
			}
			stream, e := file.Open()
			if e != nil {
				return e
			}
			body, e := io.ReadAll(io.LimitReader(stream, maxResponseBytes+1))
			stream.Close()
			if e != nil {
				return e
			}
			data, err = a.processFileEntry(userID, name, body)
		default:
			return fmt.Errorf("unknown media type: %s", m["media_type"])
		}
		if err != nil {
			return err
		}
	}
	data["import_id"] = row["id"]
	tx, err := a.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var id int64
	err = tx.QueryRow("SELECT id FROM entries WHERE user_id=? AND json_extract(entry_data,'$.import_id')=?", userID, row["id"]).Scan(&id)
	if err == sql.ErrNoRows {
		result, e := tx.Exec("INSERT INTO entries(user_id,entry_type,entry_data,created_on,updated_on,functional_datetime) VALUES(?,?,?,?,?,?)", userID, kind, jsonString(data), times[0], times[1], times[2])
		if e != nil {
			return e
		}
		id, err = result.LastInsertId()
	} else if err == nil {
		_, err = tx.Exec("UPDATE entries SET entry_type=?,entry_data=?,created_on=?,updated_on=?,functional_datetime=? WHERE id=?", kind, jsonString(data), times[0], times[1], times[2], id)
	}
	if err != nil {
		return err
	}
	if _, err = tx.Exec("DELETE FROM entry_tag_xref WHERE entry_id=?", id); err != nil {
		return err
	}
	for _, tag := range tags {
		name := strings.ToLower(tag)
		_, err = tx.Exec("INSERT OR IGNORE INTO tags(name,user_id,day_tag,created_on,updated_on) VALUES(?,?,0,?,?)", name, userID, times[0], times[1])
		if err != nil {
			return err
		}
		_, err = tx.Exec("INSERT OR IGNORE INTO entry_tag_xref(entry_id,tag_id) SELECT ?,id FROM tags WHERE name=? AND user_id=?", id, name, userID)
		if err != nil {
			return err
		}
	}
	return tx.Commit()
}
func parseBytesRepr(value string) ([]byte, error) {
	value = strings.TrimSpace(value)
	if len(value) >= 3 && value[0] == 'b' && (value[1] == '\'' || value[1] == '"') && value[len(value)-1] == value[1] {
		quote := value[1]
		body := value[2 : len(value)-1]
		result := []byte{}
		for len(body) > 0 {
			r, _, tail, err := strconv.UnquoteChar(body, quote)
			if err != nil || r > 255 {
				return nil, fmt.Errorf("invalid bytes representation")
			}
			result = append(result, byte(r))
			body = tail
		}
		return result, nil
	}
	return base64.StdEncoding.DecodeString(value)
}
func unlockImportText(secret, passcode string, row map[string]string) (string, error) {
	key, err := base64.StdEncoding.DecodeString(strings.TrimSpace(secret))
	if err != nil {
		key = []byte(secret)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	iv, err := parseBytesRepr(row["iv"])
	if err != nil {
		return "", err
	}
	ciphertext, err := parseBytesRepr(row["cipher_text"])
	if err != nil {
		return "", err
	}
	tag, err := parseBytesRepr(row["tag"])
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCMWithNonceSize(block, len(iv))
	if err != nil {
		return "", err
	}
	plain, err := gcm.Open(nil, iv, append(ciphertext, tag...), []byte(passcode))
	return string(plain), err
}
