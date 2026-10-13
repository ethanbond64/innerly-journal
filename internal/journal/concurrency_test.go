package journal

import (
	"sync"
	"testing"
)

// TestConcurrentSignup preserves a single first administrator across independent desktop windows.
func TestConcurrentSignup(t *testing.T) {
	dir := t.TempDir()
	apps := make([]*App, 2)
	for i := range apps {
		app, err := NewApp(Config{DataDir: dir})
		if err != nil {
			t.Fatal(err)
		}
		apps[i] = app
		defer CloseApp(app)
	}
	results := make(chan Result, 2)
	go func() { results <- apps[0].Signup(Credentials{"one@example.com", "journal-password"}) }()
	go func() { results <- apps[1].Signup(Credentials{"two@example.com", "journal-password"}) }()
	admins := 0
	for i := 0; i < 2; i++ {
		if decoded[User](t, <-results).Admin {
			admins++
		}
	}
	if admins != 1 {
		t.Fatalf("got %d first administrators", admins)
	}
}

// TestConcurrentRekeyAndWriting ensures all successful writes remain decryptable when another window changes the password.
func TestConcurrentRekeyAndWriting(t *testing.T) {
	a := testApp(t)
	b, err := NewApp(Config{DataDir: a.config.DataDir})
	if err != nil {
		t.Fatal(err)
	}
	defer CloseApp(b)
	login(t, a, "owner@example.com", "journal-password")
	login(t, b, "owner@example.com", "journal-password")
	locked := true
	entry := createText(t, a, "initial secret", true)
	errors := make(chan *AppError, 1)
	var worker sync.WaitGroup
	worker.Add(1)
	go func() {
		defer worker.Done()
		errors <- b.UpdatePassword(PasswordInput{CurrentPassword: "journal-password", NewPassword: "new-password"}).Error
	}()
	for i := 0; i < 200; i++ {
		input := EntryInput{EntryType: "text", EntryData: map[string]any{"text": "concurrent secret"}, Locked: &locked}
		for _, result := range []Result{a.InsertEntry(input), a.UpdateEntry(entry.ID, input)} {
			if result.Error != nil && result.Error.Code != "lock-auth-expired" {
				t.Fatal(result.Error)
			}
		}
	}
	worker.Wait()
	if err := <-errors; err != nil {
		t.Fatal(err)
	}
	ok(t, a.FetchEntry(entry.ID, "new-password"))
	user, err := a.user(a.userID)
	if err != nil {
		t.Fatal(err)
	}
	key, err := deriveScryptKey(user, "new-password")
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range decoded[[]Entry](t, a.FetchEntries(Query{Limit: 1000})) {
		if _, err = unlockTextAtVersion(user, stored(t, a, entry.ID), key); err != nil {
			t.Fatalf("entry %d: %v", entry.ID, err)
		}
	}
}
