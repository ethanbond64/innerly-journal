package journal

import (
	"database/sql"
	"fmt"
	"path/filepath"
	"sync"
	"testing"
)

// TestVersionedMigrations adopts version-zero data, applies new migrations, and reopens idempotently.
func TestVersionedMigrations(t *testing.T) {
	a := testApp(t)
	entry := createText(t, a, "preserved journal", false)
	if _, err := a.db.Exec("PRAGMA user_version=1; DROP INDEX ix_entries_user_datetime"); err != nil {
		t.Fatal(err)
	}
	dir := a.config.DataDir
	CloseApp(a)
	for i := 0; i < 2; i++ {
		b, err := NewApp(Config{DataDir: dir})
		if err != nil {
			t.Fatal(err)
		}
		var version, indexes int
		if err = b.db.QueryRow("PRAGMA user_version").Scan(&version); err != nil {
			t.Fatal(err)
		}
		if err = b.db.QueryRow("SELECT count(*) FROM sqlite_master WHERE name='ix_entries_user_datetime'").Scan(&indexes); err != nil {
			t.Fatal(err)
		}
		if version != 2 || indexes != 1 {
			t.Fatalf("version=%d indexes=%d", version, indexes)
		}
		login(t, b, "owner@example.com", "journal-password")
		if entryResult(t, b.FetchEntry(entry.ID, "")).EntryData["text"] != "preserved journal" {
			t.Fatal("data changed")
		}
		CloseApp(b)
	}
}

// TestMigrationFailureDoesNotAdvanceVersion verifies rollback and refuses databases created by a newer app.
func TestMigrationFailureDoesNotAdvanceVersion(t *testing.T) {
	for _, future := range []bool{false, true} {
		t.Run(fmt.Sprint(future), func(t *testing.T) {
			dir := t.TempDir()
			db, err := sql.Open("sqlite", filepath.Join(dir, "database.db"))
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			version := 0
			setup := "CREATE VIEW entries AS SELECT 1 AS user_id, '' AS functional_datetime"
			if future {
				version = 999
				setup = "PRAGMA user_version=999"
			}
			if _, err = db.Exec(setup); err != nil {
				t.Fatal(err)
			}
			if app, err := NewApp(Config{DataDir: dir}); err == nil {
				CloseApp(app)
				t.Fatal("expected migration refusal")
			}
			var actual, users int
			if err = db.QueryRow("PRAGMA user_version").Scan(&actual); err != nil {
				t.Fatal(err)
			}
			if err = db.QueryRow("SELECT count(*) FROM sqlite_master WHERE name='users'").Scan(&users); err != nil {
				t.Fatal(err)
			}
			if actual != version || users != 0 {
				t.Fatalf("partial migration: version=%d users=%d", actual, users)
			}
		})
	}
}

// TestIndependentDesktopSessions keeps simultaneous accounts and logout isolated while sharing the same database.
func TestIndependentDesktopSessions(t *testing.T) {
	a := testApp(t)
	b, err := NewApp(Config{DataDir: a.config.DataDir})
	if err != nil {
		t.Fatal(err)
	}
	defer CloseApp(b)
	hasCode(t, b.CurrentUser(), "unauthorized")
	ok(t, b.Signup(Credentials{"other@example.com", "other-password"}))
	owner := createText(t, a, "owner only", false)
	other := createText(t, b, "other only", false)
	hasCode(t, a.FetchEntry(other.ID, ""), "not-found")
	hasCode(t, b.FetchEntry(owner.ID, ""), "not-found")
	for _, app := range []*App{a, b} {
		if entries := decoded[[]Entry](t, app.FetchEntries(Query{})); len(entries) != 1 {
			t.Fatal(entries)
		}
	}
	ok(t, a.Logout())
	ok(t, b.CurrentUser())
	ok(t, b.UpdateEntry(other.ID, EntryInput{EntryData: map[string]any{"text": "still independent"}}))
}

// TestConcurrentDesktopStartup serializes initial schema adoption across independent app instances.
func TestConcurrentDesktopStartup(t *testing.T) {
	dir := t.TempDir()
	var workers sync.WaitGroup
	errors := make(chan error, 4)
	for i := 0; i < 4; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			app, err := NewApp(Config{DataDir: dir})
			if err == nil {
				CloseApp(app)
			}
			errors <- err
		}()
	}
	workers.Wait()
	close(errors)
	for err := range errors {
		if err != nil {
			t.Fatal(err)
		}
	}
}

// TestRekeyInvalidatesOtherWindowCache prevents a previously warmed window from reusing an obsolete write key.
func TestRekeyInvalidatesOtherWindowCache(t *testing.T) {
	a := testApp(t)
	b, err := NewApp(Config{DataDir: a.config.DataDir})
	if err != nil {
		t.Fatal(err)
	}
	defer CloseApp(b)
	login(t, a, "owner@example.com", "journal-password")
	login(t, b, "owner@example.com", "journal-password")
	locked := true
	ok(t, a.UpdatePassword(PasswordInput{CurrentPassword: "journal-password", NewPassword: "new-password"}))
	input := EntryInput{EntryType: "text", EntryData: map[string]any{"text": "new private entry"}, Locked: &locked}
	hasCode(t, b.InsertEntry(input), "lock-auth-expired")
	ok(t, b.AuthenticateLock("new-password"))
	entry := entryResult(t, b.InsertEntry(input))
	if entryResult(t, a.FetchEntry(entry.ID, "new-password")).EntryData["text"] != "new private entry" {
		t.Fatal("wrong key")
	}
}

// TestDraftAnalysisWaitsForSave keeps draft counts and encryption intact while deferring sentiment to explicit Save.
func TestDraftAnalysisWaitsForSave(t *testing.T) {
	a := testApp(t)
	login(t, a, "owner@example.com", "journal-password")
	locked := true
	entry := entryResult(t, a.InsertEntry(EntryInput{EntryType: "text", EntryData: map[string]any{"text": "happy wonderful love"}, Locked: &locked, Draft: true}))
	data := stored(t, a, entry.ID)
	if data["sentiment"] != "neutral" || !flag(data["locked"]) || data["text"] == "happy wonderful love" {
		t.Fatal(data)
	}
	result := entryResult(t, a.UpdateEntry(entry.ID, EntryInput{EntryData: map[string]any{"text": "happy wonderful love"}}))
	if result.EntryData["sentiment"] != getSentiment("happy wonderful love") || result.EntryData["sentiment"] == "neutral" {
		t.Fatal(result)
	}
	entryResult(t, a.UpdateEntry(entry.ID, EntryInput{EntryData: map[string]any{"text": "sad awful hate"}, Draft: true}))
	if stored(t, a, entry.ID)["sentiment"] != result.EntryData["sentiment"] {
		t.Fatal("draft recomputed sentiment")
	}
}
