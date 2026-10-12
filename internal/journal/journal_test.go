package journal

import (
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func testApp(t *testing.T) *App {
	t.Helper()
	a, err := NewApp(Config{DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { CloseApp(a) })
	result := a.Signup(Credentials{Email: "owner@example.com", Password: "journal-password"})
	if result.Error != nil {
		t.Fatal(result.Error)
	}
	return a
}
func entryResult(t *testing.T, r Result) Entry {
	t.Helper()
	if r.Error != nil {
		t.Fatal(r.Error)
	}
	b, _ := json.Marshal(r.Data)
	var e Entry
	if err := json.Unmarshal(b, &e); err != nil {
		t.Fatal(err)
	}
	return e
}
func createText(t *testing.T, a *App, text string, locked bool) Entry {
	t.Helper()
	return entryResult(t, a.InsertEntry(EntryInput{EntryType: "text", EntryData: map[string]any{"text": text}, Locked: &locked, Password: "journal-password"}))
}

// TestEntryLifecycle verifies that Unicode edits persist across reopen and deletion removes the entry.
func TestEntryLifecycle(t *testing.T) {
	a := testApp(t)
	e := createText(t, a, "Hello 世界", false)
	e = entryResult(t, a.UpdateEntry(e.ID, EntryInput{EntryData: map[string]any{"text": "Updated café text", "title": "Trip"}}))
	if e.EntryData["word_count"] != float64(3) {
		t.Fatal(e)
	}
	dir := a.config.DataDir
	CloseApp(a)
	reopened, err := NewApp(Config{DataDir: dir})
	if err != nil {
		t.Fatal(err)
	}
	defer CloseApp(reopened)
	if r := reopened.Login(Credentials{Email: "owner@example.com", Password: "journal-password"}); r.Error != nil {
		t.Fatal(r)
	}
	if e = entryResult(t, reopened.FetchEntry(e.ID, "")); e.EntryData["text"] != "Updated café text" {
		t.Fatal(e)
	}
	if r := reopened.DeleteEntry(e.ID); r.Error != nil {
		t.Fatal(r)
	}
	if r := reopened.FetchEntry(e.ID, ""); r.Error == nil || r.Error.Code != "not-found" {
		t.Fatal(r)
	}
}

// TestLegacyEncryption verifies Python password hashes and both stored encryption versions before rekeying.
func TestLegacyEncryption(t *testing.T) {
	a := testApp(t)
	b, err := os.ReadFile(filepath.Join("..", "..", "backend", "tests", "fixtures", "encryption.json"))
	if err != nil {
		t.Fatal(err)
	}
	var f map[string]string
	if err := json.Unmarshal(b, &f); err != nil {
		t.Fatal(err)
	}
	key, err := deriveScryptKey(User{Email: f["email"]}, f["password"])
	if err != nil || hex.EncodeToString(key) != f["key_hex"] {
		t.Fatal("scrypt compatibility", err)
	}
	a.db.Exec("UPDATE users SET password_hash=? WHERE id=1", f["password_hash"])
	for _, version := range []int{0, 1} {
		e := createText(t, a, "placeholder", false)
		e.EntryData["locked"] = true
		e.EntryData["lock_version"] = version
		if version == 0 {
			e.EntryData["text"] = f["v0"]
		} else {
			e.EntryData["text"] = f["v1"]
		}
		b, _ := json.Marshal(e.EntryData)
		a.db.Exec("UPDATE entries SET entry_data=? WHERE id=?", string(b), e.ID)
		read := entryResult(t, a.FetchEntry(e.ID, "journal-password"))
		if read.EntryData["text"] != f["text"] {
			t.Fatal(read)
		}
	}
	r := a.UpdatePassword(PasswordInput{CurrentPassword: "journal-password", NewPassword: "12345678"})
	if r.Error != nil || r.Reencrypted != 2 {
		t.Fatal(r)
	}
	for _, id := range []int64{1, 2} {
		e := entryResult(t, a.FetchEntry(id, "12345678"))
		if e.EntryData["text"] != f["text"] {
			t.Fatal(e)
		}
	}
}
