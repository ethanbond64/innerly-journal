package journal

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func ok(t *testing.T, r Result) {
	t.Helper()
	if r.Error != nil {
		t.Fatal(r.Error)
	}
}
func hasCode(t *testing.T, r Result, code string) {
	t.Helper()
	if r.Error == nil || r.Error.Code != code {
		t.Fatalf("wanted %s: %+v", code, r)
	}
}
func decoded[T any](t *testing.T, r Result) T {
	t.Helper()
	ok(t, r)
	b, err := json.Marshal(r.Data)
	if err != nil {
		t.Fatal(err)
	}
	var result T
	if err = json.Unmarshal(b, &result); err != nil {
		t.Fatal(err)
	}
	return result
}
func stored(t *testing.T, a *App, id int64) map[string]any {
	t.Helper()
	var value string
	if err := a.db.QueryRow("SELECT entry_data FROM entries WHERE id=?", id).Scan(&value); err != nil {
		t.Fatal(err)
	}
	return object(value)
}
func login(t *testing.T, a *App, email, password string) {
	t.Helper()
	ok(t, a.Login(Credentials{email, password}))
}
func backdated(t *testing.T, a *App, value, date string, locked bool) Entry {
	t.Helper()
	return entryResult(t, a.InsertEntry(EntryInput{EntryType: "text", EntryData: map[string]any{"text": value}, FunctionalDatetime: date, Locked: &locked, Password: "journal-password"}))
}

// TestSignupLoginAndAuthorization checks local account creation, password checks, and user-data redaction.
func TestSignupLoginAndAuthorization(t *testing.T) {
	a := testApp(t)
	owner := decoded[User](t, a.CurrentUser())
	if !owner.Admin {
		t.Fatal(owner)
	}
	for _, input := range []Credentials{{"invalid", "journal-password"}, {"new@example.com", "short"}} {
		hasCode(t, a.Signup(input), "invalid-input")
	}
	hasCode(t, a.Signup(Credentials{"owner@example.com", "journal-password"}), "conflict")
	other := decoded[User](t, a.Signup(Credentials{"other@example.com", "journal-password"}))
	if other.Admin {
		t.Fatal(other)
	}
	hasCode(t, a.UpdateUser(owner.ID, map[string]any{"lock_by_default": false}), "unauthorized")
	ok(t, a.Logout())
	hasCode(t, a.FetchEntries(Query{}), "unauthorized")
	hasCode(t, a.Login(Credentials{"owner@example.com", "wrong"}), "unauthorized")
	login(t, a, "owner@example.com", "journal-password")
	b, _ := json.Marshal(a.CurrentUser().Data)
	if bytes.Contains(b, []byte("password_hash")) {
		t.Fatal(string(b))
	}
}

// TestSessionRequiresLoginAfterRestart replaces token expiry with the desktop's nonpersistent local session.
func TestSessionRequiresLoginAfterRestart(t *testing.T) {
	a := testApp(t)
	e := createText(t, a, "private", true)
	dir := a.config.DataDir
	CloseApp(a)
	b, err := NewApp(Config{DataDir: dir})
	if err != nil {
		t.Fatal(err)
	}
	defer CloseApp(b)
	hasCode(t, b.FetchEntry(e.ID, "journal-password"), "unauthorized")
	login(t, b, "owner@example.com", "journal-password")
	ok(t, b.FetchEntry(e.ID, "journal-password"))
}

// TestEntryOwnership prevents a different local account from reading or changing an owner's entries.
func TestEntryOwnership(t *testing.T) {
	a := testApp(t)
	e := createText(t, a, "owner", true)
	ok(t, a.Signup(Credentials{"other@example.com", "journal-password"}))
	for _, r := range []Result{a.FetchEntry(e.ID, ""), a.UpdateEntry(e.ID, EntryInput{EntryData: map[string]any{"text": "changed"}}), a.DeleteEntry(e.ID), a.LockEntry(e.ID, "journal-password"), a.UnlockEntry(e.ID, "journal-password")} {
		hasCode(t, r, "not-found")
	}
	if len(decoded[[]Entry](t, a.FetchEntries(Query{}))) != 0 {
		t.Fatal("owner leaked")
	}
}

// TestSearchPaginationAndPreviews checks case-insensitive title/text matching, date ordering, and Unicode previews.
func TestSearchPaginationAndPreviews(t *testing.T) {
	a := testApp(t)
	older := backdated(t, a, "needle "+strings.Repeat("世", 100), "2020-01-01T12:00:00Z", false)
	newer := backdated(t, a, "private needle", "2020-01-03T12:00:00Z", true)
	ok(t, a.UpdateEntry(newer.ID, EntryInput{EntryData: map[string]any{"title": "Needle title"}}))
	backdated(t, a, "needle", "2020-01-02T12:00:00Z", true)
	rows := decoded[[]Entry](t, a.FetchEntries(Query{Search: "NEEDLE"}))
	if len(rows) != 2 || rows[0].ID != newer.ID || rows[1].ID != older.ID || len([]rune(text(rows[1].EntryData["text"]))) != 64 {
		t.Fatal(rows)
	}
	page := decoded[[]Entry](t, a.FetchEntries(Query{Search: "needle", Limit: 1, Offset: 1}))
	if len(page) != 1 || page[0].ID != older.ID {
		t.Fatal(page)
	}
}

// TestSearchEntryTags includes locked entry tags exactly once without matching day-only or foreign tags.
func TestSearchEntryTags(t *testing.T) {
	a := testApp(t)
	older := backdated(t, a, "private", "2020-01-01T12:00:00Z", true)
	newer := backdated(t, a, "Travel notes", "2020-01-02T12:00:00Z", false)
	backdated(t, a, "unrelated", "2020-01-03T12:00:00Z", false)
	for _, e := range []Entry{older, newer} {
		for _, name := range []string{"travel", "travelogue"} {
			_, err := a.db.Exec("INSERT OR IGNORE INTO tags(name,user_id,day_tag) VALUES(?,1,0)", name)
			if err != nil {
				t.Fatal(err)
			}
			_, err = a.db.Exec("INSERT INTO entry_tag_xref(entry_id,tag_id) SELECT ?,id FROM tags WHERE name=? AND user_id=1", e.ID, name)
			if err != nil {
				t.Fatal(err)
			}
		}
	}
	ok(t, a.InsertDateTag(DayInput{"travel", "2020-01-03T23:59:00Z"}))
	before := stored(t, a, older.ID)
	rows := decoded[[]Entry](t, a.FetchEntries(Query{Search: "RAV"}))
	if len(rows) != 2 || rows[0].ID != newer.ID || rows[1].ID != older.ID {
		t.Fatal(rows)
	}
	if !reflect.DeepEqual(before, stored(t, a, older.ID)) {
		t.Fatal("search changed encrypted data")
	}
	for index, id := range []int64{newer.ID, older.ID} {
		rows = decoded[[]Entry](t, a.FetchEntries(Query{Search: "RAV", Limit: 1, Offset: index}))
		if len(rows) != 1 || rows[0].ID != id {
			t.Fatal(rows)
		}
	}
	if len(decoded[[]Entry](t, a.FetchEntries(Query{Search: "RAV", Limit: 1, Offset: 2}))) != 0 {
		t.Fatal("duplicate")
	}
	ok(t, a.Signup(Credentials{"other@example.com", "journal-password"}))
	if len(decoded[[]Entry](t, a.FetchEntries(Query{Search: "RAV"}))) != 0 {
		t.Fatal("foreign tags leaked")
	}
}

// TestTextCountsAndSentiment verifies representative persisted word counts and sentiment without testing helper internals.
func TestTextCountsAndSentiment(t *testing.T) {
	a := testApp(t)
	for _, c := range []struct {
		value     string
		words     int
		sentiment string
	}{{"", 0, "neutral"}, {"hello\t世界\n café", 3, "neutral"}, {"happy", 1, "positive"}, {"sad", 1, "negative"}} {
		e := createText(t, a, c.value, false)
		if number(e.EntryData["word_count"]) != c.words || e.EntryData["sentiment"] != c.sentiment {
			t.Fatal(e)
		}
	}
}

// TestSettingsAndDefaultLocking checks settings persistence, timeout validation, and the first-save encryption default.
func TestSettingsAndDefaultLocking(t *testing.T) {
	a := testApp(t)
	settings := map[string]any{"lock_by_default": false, "sensitivity": "blur", "lock_ttl_value": 2, "lock_ttl_unit": "hours"}
	ok(t, a.UpdateUser(1, settings))
	for _, pair := range []struct {
		value any
		unit  string
	}{{0, "hours"}, {true, "hours"}, {8, "days"}, {1, "weeks"}} {
		hasCode(t, a.UpdateUser(1, map[string]any{"lock_ttl_value": pair.value, "lock_ttl_unit": pair.unit}), "invalid-input")
	}
	ok(t, a.UpdateUser(1, map[string]any{"sensitivity": "both"}))
	u := decoded[User](t, a.CurrentUser())
	if u.Settings["lock_by_default"] != false || number(u.Settings["lock_ttl_value"]) != 2 {
		t.Fatal(u)
	}
	e := entryResult(t, a.InsertEntry(EntryInput{EntryType: "text", EntryData: map[string]any{"text": "unlocked default"}}))
	if stored(t, a, e.ID)["text"] != "unlocked default" {
		t.Fatal(e)
	}
}

// TestLockedEntryReadEditAndUnlock keeps private text encrypted until an explicit permanent unlock.
func TestLockedEntryReadEditAndUnlock(t *testing.T) {
	a := testApp(t)
	e := createText(t, a, "Private 世界", true)
	ciphertext := text(stored(t, a, e.ID)["text"])
	if !e.TextUnlocked || ciphertext == "Private 世界" {
		t.Fatal(e)
	}
	if entryResult(t, a.FetchEntry(e.ID, "")).EntryData["text"] != ciphertext {
		t.Fatal("plaintext leak")
	}
	if entryResult(t, a.FetchEntry(e.ID, "journal-password")).EntryData["text"] != "Private 世界" {
		t.Fatal("decrypt failed")
	}
	hasCode(t, a.FetchEntry(e.ID, "wrong"), "unauthorized")
	hasCode(t, a.UpdateEntry(e.ID, EntryInput{EntryData: map[string]any{"text": ciphertext}}), "conflict")
	edited := entryResult(t, a.UpdateEntry(e.ID, EntryInput{EntryData: map[string]any{"text": "New private text"}}))
	if edited.EntryData["text"] != "New private text" || stored(t, a, e.ID)["text"] == "New private text" {
		t.Fatal(edited)
	}
	ok(t, a.UnlockEntry(e.ID, "journal-password"))
	data := stored(t, a, e.ID)
	if flag(data["locked"]) || data["text"] != "New private text" {
		t.Fatal(data)
	}
}

// TestDefaultLockingAndReauthentication exercises access-time expiration and isolation of cached write keys.
func TestDefaultLockingAndReauthentication(t *testing.T) {
	a := testApp(t)
	input := EntryInput{EntryType: "text", EntryData: map[string]any{"text": "private"}}
	hasCode(t, a.InsertEntry(input), "lock-auth-expired")
	ok(t, a.AuthenticateLock("journal-password"))
	e := entryResult(t, a.InsertEntry(input))
	if !flag(stored(t, a, e.ID)["locked"]) {
		t.Fatal(e)
	}
	future := time.Now().Add(2 * time.Hour)
	a.now = func() time.Time { return future }
	hasCode(t, a.InsertEntry(input), "lock-auth-expired")
	hasCode(t, a.AuthenticateLock("wrong"), "lock-auth-expired")
	ok(t, a.AuthenticateLock("journal-password"))
	ok(t, a.InsertEntry(input))
	ok(t, a.Signup(Credentials{"other@example.com", "journal-password"}))
	hasCode(t, a.InsertEntry(input), "lock-auth-expired")
}

// TestPasswordChangeRekeysOnlySelectedEntries preserves public entries unless lock-all is requested.
func TestPasswordChangeRekeysOnlySelectedEntries(t *testing.T) {
	a := testApp(t)
	private := createText(t, a, "private", true)
	public := createText(t, a, "public", false)
	r := a.UpdatePassword(PasswordInput{"journal-password", "new-password", false})
	ok(t, r)
	if r.Reencrypted != 1 {
		t.Fatal(r)
	}
	if entryResult(t, a.FetchEntry(private.ID, "new-password")).EntryData["text"] != "private" || stored(t, a, public.ID)["text"] != "public" {
		t.Fatal("rekey failed")
	}
	hasCode(t, a.Login(Credentials{"owner@example.com", "journal-password"}), "unauthorized")
	login(t, a, "owner@example.com", "new-password")
	r = a.UpdatePassword(PasswordInput{"new-password", "final-password", true})
	ok(t, r)
	if r.Reencrypted != 2 {
		t.Fatal(r)
	}
	if entryResult(t, a.FetchEntry(public.ID, "final-password")).EntryData["text"] != "public" {
		t.Fatal("lock all failed")
	}
}

// TestPasswordChangeMinimumLength rejects weak passwords without changing stored records, including lock-all requests.
func TestPasswordChangeMinimumLength(t *testing.T) {
	a := testApp(t)
	e := createText(t, a, "private", true)
	before := stored(t, a, e.ID)
	var hash string
	a.db.QueryRow("SELECT password_hash FROM users WHERE id=1").Scan(&hash)
	for _, password := range []string{"", "short", "1234567"} {
		for _, all := range []bool{false, true} {
			hasCode(t, a.UpdatePassword(PasswordInput{"journal-password", password, all}), "invalid-input")
			if !reflect.DeepEqual(stored(t, a, e.ID), before) {
				t.Fatal("entry changed")
			}
		}
	}
	var after string
	a.db.QueryRow("SELECT password_hash FROM users WHERE id=1").Scan(&after)
	if hash != after {
		t.Fatal("hash changed")
	}
	ok(t, a.UpdatePassword(PasswordInput{"journal-password", "12345678", true}))
	login(t, a, "owner@example.com", "12345678")
}

// TestPasswordChangeRollsBackOnCorruptEntry ensures one corrupt record rolls back the whole rekey transaction.
func TestPasswordChangeRollsBackOnCorruptEntry(t *testing.T) {
	a := testApp(t)
	first := createText(t, a, "first", true)
	broken := createText(t, a, "second", true)
	data := stored(t, a, broken.ID)
	data["text"] = "b'corrupt'"
	a.db.Exec("UPDATE entries SET entry_data=? WHERE id=?", jsonString(data), broken.ID)
	before := stored(t, a, first.ID)
	hasCode(t, a.UpdatePassword(PasswordInput{"journal-password", "new-password", false}), "conflict")
	if !reflect.DeepEqual(before, stored(t, a, first.ID)) {
		t.Fatal("partial commit")
	}
	login(t, a, "owner@example.com", "journal-password")
	ok(t, a.FetchEntry(first.ID, "journal-password"))
}

// TestDayTagsLifecycle verifies normalized idempotent day tags, deletion, and suggestion cleanup.
func TestDayTagsLifecycle(t *testing.T) {
	a := testApp(t)
	first := decoded[DateTag](t, a.InsertDateTag(DayInput{" Holiday ", "2020-01-01T23:59:00Z"}))
	again := decoded[DateTag](t, a.InsertDateTag(DayInput{"holiday", "2020-01-01T23:59:00Z"}))
	if first.ID != again.ID || first.Name != "holiday" {
		t.Fatal(first, again)
	}
	second := decoded[DateTag](t, a.InsertDateTag(DayInput{"holiday", "2020-01-02T23:59:00Z"}))
	ok(t, a.DeleteDateTag(first.ID))
	if len(decoded[[]Tag](t, a.FetchDateTags(Query{Search: "HOL"}))) != 1 {
		t.Fatal("tag lost")
	}
	ok(t, a.DeleteDateTag(second.ID))
	if len(decoded[[]Tag](t, a.FetchDateTags(Query{}))) != 0 || len(decoded[[]Tag](t, a.FetchTags(Query{}))) != 1 {
		t.Fatal("cleanup failed")
	}
	for _, name := range []string{"", " ", strings.Repeat("x", 256)} {
		hasCode(t, a.InsertDateTag(DayInput{name, "2020-01-01T23:59:00Z"}), "invalid-input")
	}
}

// TestActivityMemoriesAndDateQueries checks historical candidate dates and word counts without revealing private text.
func TestActivityMemoriesAndDateQueries(t *testing.T) {
	a := testApp(t)
	backdated(t, a, "three secret words", "2020-06-15T12:00:00Z", true)
	backdated(t, a, "two words", "2019-06-15T12:00:00Z", false)
	activity := decoded[[]map[string]any](t, a.FetchActivity(Query{Before: "2020-06-15", Days: 2}))
	if len(activity) != 1 || number(activity[0]["words"]) != 3 || len(activity[0]) != 3 {
		t.Fatal(activity)
	}
	memories := decoded[map[string][]string](t, a.FetchMemories("2024-06-15"))
	if !reflect.DeepEqual(memories["datetimes"], []string{"2020-06-15T12:00:00Z", "2019-06-15T12:00:00Z"}) {
		t.Fatal(memories)
	}
	if len(decoded[[]Entry](t, a.FetchEntries(Query{Date: "2020-06-15"}))) != 1 {
		t.Fatal("date mismatch")
	}
	hasCode(t, a.FetchEntries(Query{Date: "bad"}), "invalid-input")
	hasCode(t, a.FetchActivity(Query{Before: "bad"}), "invalid-input")
	hasCode(t, a.FetchMemories("bad"), "invalid-input")
}

var pngBytes, _ = base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=")

// TestImageUploadAndRetrieval validates image bytes and verifies account-scoped media access without signed HTTP sessions.
func TestImageUploadAndRetrieval(t *testing.T) {
	a := testApp(t)
	e := entryResult(t, a.InsertEntry(EntryInput{EntryType: "file", Filename: "photo.txt", ContentBase64: base64.StdEncoding.EncodeToString(pngBytes)}))
	if e.EntryData["file_type"] != "png" {
		t.Fatal(e)
	}
	handler := MediaHandler(a)
	r := httptest.NewRecorder()
	handler.ServeHTTP(r, httptest.NewRequest("GET", text(e.EntryData["path"]), nil))
	if r.Code != 200 || !bytes.Equal(r.Body.Bytes(), pngBytes) || r.Header().Get("Cache-Control") != "no-store" {
		t.Fatal(r)
	}
	hasCode(t, a.LockEntry(e.ID, "journal-password"), "invalid-input")
	hasCode(t, a.UpdateEntry(e.ID, EntryInput{}), "invalid-input")
	hasCode(t, a.InsertEntry(EntryInput{EntryType: "file", Filename: "fake.png", ContentBase64: base64.StdEncoding.EncodeToString([]byte("not an image"))}), "invalid-input")
	ok(t, a.Logout())
	r = httptest.NewRecorder()
	handler.ServeHTTP(r, httptest.NewRequest("GET", text(e.EntryData["path"]), nil))
	if r.Code != 401 {
		t.Fatal(r.Code)
	}
	ok(t, a.Signup(Credentials{"other@example.com", "journal-password"}))
	r = httptest.NewRecorder()
	handler.ServeHTTP(r, httptest.NewRequest("GET", text(e.EntryData["path"]), nil))
	if r.Code != 404 {
		t.Fatal(r.Code)
	}
}

// TestLegacySchemaUpgradePreservesJournal reopens an old schema without losing existing records or tag identity.
func TestLegacySchemaUpgradePreservesJournal(t *testing.T) {
	a := testApp(t)
	e := createText(t, a, "old journal", false)
	if _, err := a.db.Exec("PRAGMA user_version=0; ALTER TABLE tags DROP COLUMN day_tag; INSERT INTO tags(name,user_id) VALUES('legacy',1)"); err != nil {
		t.Fatal(err)
	}
	dir := a.config.DataDir
	CloseApp(a)
	b, err := NewApp(Config{DataDir: dir})
	if err != nil {
		t.Fatal(err)
	}
	defer CloseApp(b)
	login(t, b, "owner@example.com", "journal-password")
	if entryResult(t, b.FetchEntry(e.ID, "")).EntryData["text"] != "old journal" {
		t.Fatal("lost entry")
	}
	tags := decoded[[]Tag](t, b.FetchTags(Query{}))
	if len(tags) != 1 || tags[0].DayTag {
		t.Fatal(tags)
	}
	ok(t, b.InsertDateTag(DayInput{"legacy", "2020-01-01T23:59:00Z"}))
	if len(decoded[[]Tag](t, b.FetchTags(Query{}))) != 1 {
		t.Fatal("duplicated tag")
	}
}

// TestMediaTraversalAndSymlinks prevents media requests from exposing journal files outside the selected account directory.
func TestMediaTraversalAndSymlinks(t *testing.T) {
	a := testApp(t)
	os.MkdirAll(a.getUserDirectory(1), 0700)
	os.Symlink(filepath.Join(a.config.DataDir, "database.db"), filepath.Join(a.getUserDirectory(1), "leak.png"))
	for _, url := range []string{"/media/../database.db", "/media/leak.png", "/media/sub/file.png"} {
		r := httptest.NewRecorder()
		MediaHandler(a).ServeHTTP(r, httptest.NewRequest("GET", url, nil))
		if r.Code != 404 {
			t.Fatal(url, r.Code)
		}
	}
}
