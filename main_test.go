package main

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/wailsapp/wails/v3/pkg/updater"
	"github.com/wailsapp/wails/v3/pkg/updater/providers/github"
	"innerly/internal/journal"
)

// Invalid helper plumbing must exit before creating even the journal directory.
// Never provide real targets: this test must not perform an update/swap.
func TestHelperDispatchBeforeJournal(t *testing.T) {
	if os.Getenv("INNERLY_TEST_HELPER_CHILD") == "1" {
		main()
		os.Exit(99)
	}
	data := filepath.Join(t.TempDir(), "must-not-exist")
	cmd := exec.Command(os.Args[0], "-test.run=^TestHelperDispatchBeforeJournal$")
	cmd.Env = append(os.Environ(), "INNERLY_TEST_HELPER_CHILD=1", "INNERLY_DATA_DIR="+data,
		"WAILS_UPDATER_HELPER=1", "WAILS_UPDATER_HELPER_TARGET=", "WAILS_UPDATER_HELPER_NEW=")
	err := cmd.Run()
	if exit, ok := err.(*exec.ExitError); !ok || exit.ExitCode() != 2 {
		t.Fatalf("expected helper exit 2, got %v", err)
	}
	if _, err := os.Stat(data); !os.IsNotExist(err) {
		t.Fatalf("helper touched journal: %v", err)
	}
}

func TestMediaRoutingBeforeAssetOrDevFallback(t *testing.T) {
	store, err := journal.NewApp(journal.Config{DataDir: t.TempDir()})
	if err != nil {
		t.Fatal(err)
	}
	defer journal.CloseApp(store)
	fallback := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte("SPA fallback"))
	})
	handler := mediaMiddleware(func() *journal.App { return store })(fallback)
	for _, path := range []string{"/media/image.png", "/media/sub/image.png", "/media/../database.db"} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest("GET", path, nil))
		if response.Code != http.StatusUnauthorized && response.Code != http.StatusNotFound {
			t.Errorf("%s: unexpected status %d", path, response.Code)
		}
		if response.Header().Get("Content-Type") == "text/html" {
			t.Errorf("%s fell through to assets", path)
		}
	}
	if result := store.Signup(journal.Credentials{Email: "smoke@example.com", Password: "journal-password"}); result.Error != nil {
		t.Fatal(result.Error)
	}
	var content bytes.Buffer
	if err := png.Encode(&content, image.NewRGBA(image.Rect(0, 0, 1, 1))); err != nil {
		t.Fatal(err)
	}
	result := store.InsertEntry(journal.EntryInput{EntryType: "file", Filename: "photo.png", ContentBase64: base64.StdEncoding.EncodeToString(content.Bytes())})
	if result.Error != nil {
		t.Fatal(result.Error)
	}
	entry := result.Data.(journal.Entry)
	path := entry.EntryData["path"].(string)
	for _, want := range []int{http.StatusOK, http.StatusUnauthorized} {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, httptest.NewRequest("GET", path, nil))
		if response.Code != want {
			t.Fatalf("media status: got %d, want %d", response.Code, want)
		}
		if want == http.StatusOK && !bytes.Equal(response.Body.Bytes(), content.Bytes()) {
			t.Fatal("media bytes were changed or replaced by HTML")
		}
		store.Logout()
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest("GET", "/", nil))
	if response.Body.String() != "SPA fallback" {
		t.Fatal("ordinary assets did not reach next handler")
	}
}

func TestUpdateAsset(t *testing.T) {
	assets := []github.ReleaseAsset{
		{Name: "Innerly-0.2.0-mac-universal.dmg"},
		{Name: "Innerly-0.2.0-mac-universal.zip.sha256"},
		{Name: "Innerly-0.2.0-mac-arm64.zip"},
		{Name: "Innerly-0.2.0-mac-universal.zip"},
	}
	if updateAsset(updater.CheckRequest{Platform: "darwin"}, assets) != 3 ||
		updateAsset(updater.CheckRequest{Platform: "darwin"}, assets[:3]) != -1 ||
		updateAsset(updater.CheckRequest{Platform: "linux"}, assets) != -1 {
		t.Fatal("update checks must select only the macOS universal ZIP")
	}
}

func TestChangelogVersion(t *testing.T) {
	script, err := os.ReadFile("scripts/release-version.sh")
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct{ changelog, want string }{
		{"## v0.9.0\n## v0.10.0 - 2026-01-01\n## v0.1.0\n", "0.10.0"},
		{"## v1.0.0\n## v0.99.99\n## v0.100.0\n", "1.0.0"},
		{"## v0.0.9\n## v0.0.10\n", "0.0.10"},
		{"## v01.0.0\n", ""},
		{"# No versions\n", ""},
	} {
		dir := t.TempDir()
		if err := os.Mkdir(filepath.Join(dir, "scripts"), 0700); err != nil {
			t.Fatal(err)
		}
		path := filepath.Join(dir, "scripts", "release-version.sh")
		if err := os.WriteFile(path, script, 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, "CHANGELOG.md"), []byte(tc.changelog), 0600); err != nil {
			t.Fatal(err)
		}
		output, err := exec.Command("bash", path, "--version").CombinedOutput()
		if tc.want == "" {
			if err == nil {
				t.Fatalf("accepted invalid changelog: %q", tc.changelog)
			}
		} else if err != nil || strings.TrimSpace(string(output)) != tc.want {
			t.Fatalf("changelog %q: got %q, %v; want %s", tc.changelog, output, err, tc.want)
		}
	}
}
