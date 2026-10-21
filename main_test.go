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
	"runtime"
	"strings"
	"testing"

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

// This checks release orchestration, not Apple's services or cryptography.
// All signing, notarization and Wails commands are fakes; no credentials are used.
func TestMacOSReleaseGates(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("release script uses macOS plist tools")
	}
	mock := `#!/usr/bin/env bash
set -eu
case "$(basename "$0")" in
  codesign|spctl) exit 0 ;;
  xcrun)
    [[ "$1" != --find ]] || exit 0
    if [[ "$1 $2" == 'notarytool submit' ]]; then
      if [[ "${INNERLY_TEST_RELEASE_FAIL:-}" == app-notary && "$3" == */submission.zip ]] ||
         [[ "${INNERLY_TEST_RELEASE_FAIL:-}" == dmg-notary && "$3" == *.dmg ]]; then
        printf '{"status":"Invalid","id":"test"}\n'
      else
        printf '{"status":"Accepted","id":"test"}\n'
      fi
    elif [[ "$1 $2" == 'stapler staple' && "${INNERLY_TEST_RELEASE_FAIL:-}" == staple ]]; then
      exit 1
    fi
    ;;
  wails3)
    case "$1 ${2:-}" in
      'version ') awk '$1 == "github.com/wailsapp/wails/v3" {print $2; exit}' go.mod ;;
      'tool package')
        while [[ "$1" != -out ]]; do shift; done
        touch "$2/Innerly.dmg"
        ;;
      'updater manifest')
        while [[ "$1" != -output ]]; do shift; done
        printf '{}\n' > "$2"
        ;;
      'updater verify') [[ "${INNERLY_TEST_RELEASE_FAIL:-}" != verify ]] ;;
      *) exit 1 ;;
    esac
    ;;
  *) exit 1 ;;
esac
`
	for _, failure := range []string{"", "build", "app-notary", "dmg-notary", "staple", "verify"} {
		t.Run("failure="+failure, func(t *testing.T) {
			dir := t.TempDir()
			put := func(path string, content []byte, mode os.FileMode) {
				t.Helper()
				path = filepath.Join(dir, path)
				if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
					t.Fatal(err)
				}
				if err := os.WriteFile(path, content, mode); err != nil {
					t.Fatal(err)
				}
			}
			for _, path := range []string{"scripts/release-macos.sh", "scripts/release-version.sh", "go.mod"} {
				content, err := os.ReadFile(path)
				if err != nil {
					t.Fatal(err)
				}
				put(path, content, 0700)
			}
			put("CHANGELOG.md", []byte("## v0.1.0\nFixture release notes\n"), 0600)
			plist, err := os.ReadFile("build/darwin/Info.plist")
			if err != nil {
				t.Fatal(err)
			}
			put("build/bin/Innerly.app/Contents/Info.plist", []byte(strings.ReplaceAll(string(plist), "CHANGELOG_VERSION", "0.1.0")), 0600)
			put("build/bin/Innerly.app/Contents/MacOS/Innerly", []byte("test-only executable\n"), 0700)
			put("scripts/desktop.sh", []byte("#!/bin/bash\n[[ \"${INNERLY_TEST_RELEASE_FAIL:-}\" != build ]]\n"), 0700)
			put("updater.key", []byte("test-only private key"), 0600)
			put("updater.key.pub", []byte("test-only public key"), 0600)
			put(".work/gopath/bin/wails3", []byte(mock), 0700)
			for _, tool := range []string{"codesign", "spctl", "xcrun"} {
				put("mock-bin/"+tool, []byte(mock), 0700)
			}
			outputs := []string{"manifest.json", "Innerly-0.1.0-mac-universal.zip", "Innerly-0.1.0-mac-universal.zip.sha256",
				"Innerly-0.1.0-mac-universal.dmg", "Innerly-0.1.0-mac-universal.dmg.sha256"}
			for _, name := range outputs {
				put("release/"+name, []byte("stale output"), 0600)
			}
			cmd := exec.Command("bash", "scripts/release-macos.sh", "--identity", "test-only identity",
				"--keychain-profile", "test-only profile", "--update-key", "updater.key", "--update-public-key", "updater.key.pub")
			cmd.Dir = dir
			cmd.Env = append(os.Environ(), "PATH="+filepath.Join(dir, "mock-bin")+":"+os.Getenv("PATH"), "INNERLY_TEST_RELEASE_FAIL="+failure)
			output, err := cmd.CombinedOutput()
			if (err != nil) != (failure != "") {
				t.Fatalf("unexpected release result: %v\n%s", err, output)
			}
			for _, name := range outputs {
				_, err := os.Stat(filepath.Join(dir, "release", name))
				if failure == "" && err != nil || failure != "" && !os.IsNotExist(err) {
					t.Errorf("unexpected output %s: %v", name, err)
				}
			}
		})
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
