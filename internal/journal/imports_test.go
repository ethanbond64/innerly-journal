package journal

import (
	"archive/zip"
	"bytes"
	"encoding/csv"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func waitImport(t *testing.T, a *App) ImportJobState {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for {
		state := decoded[ImportJobState](t, a.ImportStatus())
		if state.Status != "running" {
			return state
		}
		if time.Now().After(deadline) {
			t.Fatal("import did not finish")
		}
		time.Sleep(time.Millisecond * 5)
	}
}
func copyFixture(t *testing.T, name, destination string) {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(destination, data, 0600); err != nil {
		t.Fatal(err)
	}
}

// TestImportArchiveAndReimport imports legacy text, encrypted content, images and tags while isolating failures and replacing prior records.
func TestImportArchiveAndReimport(t *testing.T) {
	a := testApp(t)
	copyFixture(t, "legacy.zip", filepath.Join(a.config.DataDir, "imports", "legacy.zip"))
	files := decoded[[]string](t, a.ImportFiles())
	if len(files) != 1 || files[0] != "legacy.zip" {
		t.Fatal(files)
	}
	for attempt := 0; attempt < 2; attempt++ {
		ok(t, a.StartImport(ImportInput{"legacy.zip", "archive-passcode"}))
		state := waitImport(t, a)
		if state.Status != "complete" || state.Processed != 3 || state.Failures != 1 || state.Total != 4 {
			t.Fatal(state)
		}
		entries := decoded[[]Entry](t, a.FetchEntries(Query{Limit: 20}))
		if len(entries) != 3 {
			t.Fatal(entries)
		}
		seen := map[string]bool{}
		for _, entry := range entries {
			seen[text(entry.EntryData["import_id"])] = true
			switch text(entry.EntryData["import_id"]) {
			case "1":
				if text(entry.EntryData["text"]) != "Imported 世界 text" || len(entry.Tags) != 1 || entry.Tags[0] != "travel" {
					t.Fatal(entry)
				}
			case "2":
				if text(entry.EntryData["text"]) != "Legacy encrypted 世界" || flag(entry.EntryData["locked"]) {
					t.Fatal(entry)
				}
			case "3":
				if entry.EntryType != "file" || entry.EntryData["file_type"] != "png" {
					t.Fatal(entry)
				}
			}
		}
		if len(seen) != 3 {
			t.Fatal(seen)
		}
	}
	ok(t, a.Signup(Credentials{"other@example.com", "journal-password"}))
	hasCode(t, a.ImportStatus(), "not-found")
	if len(decoded[[]Entry](t, a.FetchEntries(Query{}))) != 0 {
		t.Fatal("foreign import leaked")
	}
}

// TestImportMissingCredentialsAndBadPasscode preserves the legacy unlocked fallback and per-entry decryption failure behavior.
func TestImportMissingCredentialsAndBadPasscode(t *testing.T) {
	a := testApp(t)
	copyFixture(t, "legacy.zip", filepath.Join(a.config.DataDir, "imports", "legacy.zip"))
	ok(t, a.StartImport(ImportInput{Path: "legacy.zip"}))
	state := waitImport(t, a)
	if state.Processed != 3 || state.Failures != 1 {
		t.Fatal(state)
	}
	for _, e := range decoded[[]Entry](t, a.FetchEntries(Query{Limit: 20})) {
		if e.EntryData["import_id"] == "2" && (number(e.EntryData["word_count"]) != 0 || flag(e.EntryData["locked"])) {
			t.Fatal(e)
		}
	}
	ok(t, a.StartImport(ImportInput{"legacy.zip", "wrong-passcode"}))
	state = waitImport(t, a)
	if state.Processed != 2 || state.Failures != 2 {
		t.Fatal(state)
	}
}

// TestImportCancellationAndValidation verifies progress cancellation and rejects archives lacking the required CSV files.
func TestImportCancellationAndValidation(t *testing.T) {
	a := testApp(t)
	dir := filepath.Join(a.config.DataDir, "imports")
	if err := os.WriteFile(filepath.Join(dir, "bad.zip"), []byte("not a zip"), 0600); err != nil {
		t.Fatal(err)
	}
	hasCode(t, a.StartImport(ImportInput{Path: "bad.zip"}), "invalid-input")
	file, err := os.Create(filepath.Join(dir, "many.zip"))
	if err != nil {
		t.Fatal(err)
	}
	archive := zip.NewWriter(file)
	for _, name := range requiredCSVs {
		writer, err := archive.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if name == "entries.csv" {
			rows := csv.NewWriter(writer)
			rows.Write([]string{"id", "text", "created_on", "updated_on", "functional_timestamp"})
			for i := 0; i < 2000; i++ {
				rows.Write([]string{strings.Repeat("x", i%10) + time.Now().String(), "many", "2020-01-01 12:00:00+00", "2020-01-01 12:00:00+00", "2020-01-01 12:00:00+00"})
			}
			rows.Flush()
		} else {
			io.WriteString(writer, "id\n")
		}
	}
	archive.Close()
	file.Close()
	ok(t, a.StartImport(ImportInput{Path: "many.zip"}))
	hasCode(t, a.StartImport(ImportInput{Path: "many.zip"}), "conflict")
	ok(t, a.CancelImport())
	state := waitImport(t, a)
	if state.Status != "cancelled" || state.Processed >= 2000 {
		t.Fatal(state)
	}
}

// TestPythonDatabaseCompatibility opens a database produced by Flask and preserves encrypted text through Go edits and rekeying.
func TestPythonDatabaseCompatibility(t *testing.T) {
	dir := t.TempDir()
	copyFixture(t, "python-journal.db", filepath.Join(dir, "database.db"))
	a, err := NewApp(Config{DataDir: dir})
	if err != nil {
		t.Fatal(err)
	}
	defer CloseApp(a)
	login(t, a, "owner@example.com", "journal-password")
	e := entryResult(t, a.FetchEntry(1, "journal-password"))
	if e.EntryData["text"] != "Private 世界 from Python" || e.FunctionalDatetime != "2020-06-15T12:00:00Z" || len(e.Tags) != 1 || e.Tags[0] != "travel" {
		t.Fatal(e)
	}
	days := decoded[[]DateTag](t, a.FetchTaggedDays())
	if len(days) != 1 || days[0].Name != "holiday" {
		t.Fatal(days)
	}
	before := stored(t, a, 1)
	before["future_metadata"] = map[string]any{"keep": true}
	a.db.Exec("UPDATE entries SET entry_data=? WHERE id=1", jsonString(before))
	ok(t, a.UpdateEntry(1, EntryInput{EntryData: map[string]any{"text": "Edited in Go 世界"}}))
	if stored(t, a, 1)["future_metadata"] == nil {
		t.Fatal("unknown metadata lost")
	}
	ok(t, a.UpdatePassword(PasswordInput{"journal-password", "new-password", false}))
	if entryResult(t, a.FetchEntry(1, "new-password")).EntryData["text"] != "Edited in Go 世界" {
		t.Fatal("lost text")
	}
}

// TestImportBytesRepr checks legacy binary quoting against Python-produced ciphertext rather than executing archive content.
func TestImportBytesRepr(t *testing.T) {
	for _, c := range []struct {
		value string
		want  []byte
	}{{`b'\x00\xff\n\t\\\''`, []byte{0, 255, '\n', '\t', '\\', '\''}}, {`b"abc"`, []byte("abc")}, {"YWJj", []byte("abc")}} {
		got, err := parseBytesRepr(c.value)
		if err != nil || !bytes.Equal(got, c.want) {
			t.Fatal(c.value, got, err)
		}
	}
}
