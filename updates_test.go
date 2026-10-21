package main

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha512"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/wailsapp/wails/v3/pkg/updater"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

type updateFixture struct {
	releases  []map[string]any
	files     map[string][]byte
	key       ed25519.PublicKey
	client    *http.Client
	requested []string
}

// All traffic stays in memory. The signing key is generated for this test only;
// no GitHub, Keychain, Developer ID, notarization or actual restart is involved.
func newUpdateFixture(t *testing.T) *updateFixture {
	t.Helper()
	pub, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	var archive bytes.Buffer
	zw := zip.NewWriter(&archive)
	header := &zip.FileHeader{Name: "Innerly.app/Contents/MacOS/Innerly"}
	header.SetMode(0755)
	file, err := zw.CreateHeader(header)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = file.Write([]byte("test-only executable, never launched"))
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	payload := archive.Bytes()
	digest := sha512.Sum512(payload)
	signature, err := private.Sign(rand.Reader, digest[:], &ed25519.Options{Hash: crypto.SHA512})
	if err != nil {
		t.Fatal(err)
	}
	f := &updateFixture{key: pub, files: map[string][]byte{}}
	for _, version := range []string{"0.2.0", "0.3.0", "0.9.0", "0.10.0"} {
		prefix := downloadPrefix("v" + version)
		name := zipName(version)
		manifest := map[string]any{"schemaVersion": 1, "version": version, "channel": "stable", "artifacts": []any{map[string]any{
			"url": prefix + name, "platform": "darwin", "size": len(payload),
			"digestAlgo": "sha512", "digest": base64.StdEncoding.EncodeToString(digest[:]),
			"signatureAlgo": "ed25519ph", "signature": base64.StdEncoding.EncodeToString(signature),
		}}}
		f.files[prefix+"manifest.json"], _ = json.Marshal(manifest)
		f.files[prefix+name] = bytes.Clone(payload)
		f.releases = append(f.releases, map[string]any{"tag_name": "v" + version, "published_at": "2026-01-01T00:00:00Z", "body": "<script>not HTML</script>", "assets": []any{
			map[string]any{"name": name}, map[string]any{"name": "manifest.json"},
		}})
	}
	f.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		f.requested = append(f.requested, r.URL.String())
		if r.Header.Get("Authorization") != "" {
			t.Error("must not send a token")
		}
		status := http.StatusOK
		var body []byte
		if r.URL.Host == "api.github.com" {
			body, _ = json.Marshal(f.releases)
		} else if body = f.files["https://"+r.URL.Host+r.URL.Path]; body == nil {
			status = http.StatusNotFound
		}
		return &http.Response{StatusCode: status, Header: http.Header{}, Body: io.NopCloser(bytes.NewReader(body)), Request: r}, nil
	})}
	return f
}

func TestUpdateCatalog(t *testing.T) {
	f := newUpdateFixture(t)
	var ignored []map[string]any
	_ = json.Unmarshal([]byte(`[{"tag_name":"v0.1.0"},{"tag_name":"v0.0.1"},{"tag_name":"v0.11.0-beta.1"},
		{"tag_name":"v0.12.0","draft":true},{"tag_name":"v0.13.0","prerelease":true},{"tag_name":"0.14.0"}]`), &ignored)
	f.releases = append(f.releases, ignored...)
	p := &releaseProvider{client: f.client}
	releases, err := p.catalog(context.Background(), "0.1.0")
	if err != nil {
		t.Fatal(err)
	}
	var versions []string
	for _, r := range releases {
		versions = append(versions, r.Version)
	}
	// Newest first; drafts, prereleases and anything at or below current are hidden.
	if strings.Join(versions, ",") != "0.14.0,0.10.0,0.9.0,0.3.0,0.2.0" {
		t.Fatal(versions)
	}
	if releases[0].Unavailable == "" || releases[1].Unavailable != "" {
		t.Fatal("a release without the universal ZIP and manifest is not installable", releases)
	}
	if releases[1].Notes != "<script>not HTML</script>" {
		t.Fatal("notes must stay plain text")
	}
	if stableVersion("v0.2.0") != "0.2.0" || stableVersion("0.2.0") != "0.2.0" || stableVersion("0.2") != "" {
		t.Fatal("stable version normalization")
	}
	// Listing releases must not fetch any manifests or payloads.
	if len(f.requested) != 1 {
		t.Fatal("catalog made extra requests", f.requested)
	}
}

func TestUpdateResolveRejectsBadMetadata(t *testing.T) {
	for _, mode := range []string{"valid", "wrong-version", "wrong-url", "arm-only", "dmg", "unknown-version"} {
		t.Run(mode, func(t *testing.T) {
			f := newUpdateFixture(t)
			path := downloadPrefix("v0.2.0") + "manifest.json"
			var m map[string]any
			_ = json.Unmarshal(f.files[path], &m)
			a := m["artifacts"].([]any)[0].(map[string]any)
			switch mode {
			case "wrong-version":
				m["version"] = "0.3.0"
			case "wrong-url":
				a["url"] = "https://evil.example/" + zipName("0.2.0")
			case "arm-only":
				a["url"] = strings.Replace(a["url"].(string), "universal", "arm64", 1)
			case "dmg":
				a["url"] = strings.Replace(a["url"].(string), ".zip", ".dmg", 1)
			}
			f.files[path], _ = json.Marshal(m)
			p := &releaseProvider{client: f.client}
			if _, err := p.catalog(context.Background(), "0.1.0"); err != nil {
				t.Fatal(err)
			}
			version := "0.2.0"
			if mode == "unknown-version" {
				version = "9.9.9" // never offered by the catalog
			}
			_, err := p.resolve(context.Background(), version, "0.1.0")
			if (err == nil) != (mode == "valid") {
				t.Fatal(mode, err)
			}
		})
	}
}

type updaterTestHost struct{}

func (updaterTestHost) Emit(string, ...any) bool         { return true }
func (updaterTestHost) OnEvent(string, func(any)) func() { return func() {} }
func (updaterTestHost) OpenWindow(updater.WindowOptions) updater.WindowHandle {
	panic("must not open native updater UI")
}
func (updaterTestHost) Quit() { panic("tests must never restart the real application") }

// Wails performs the real download, hashing, signature check and extraction
// here. Only the chosen version may be installed, and only if it authenticates.
func TestWailsUpdateVerificationAndSelection(t *testing.T) {
	for _, mode := range []string{"valid", "wrong-key", "corrupted", "missing-asset"} {
		t.Run(mode, func(t *testing.T) {
			f := newUpdateFixture(t)
			p := &releaseProvider{client: f.client}
			if _, err := p.catalog(context.Background(), "0.1.0"); err != nil {
				t.Fatal(err)
			}
			selected, err := p.resolve(context.Background(), "0.2.0", "0.1.0") // NOT the latest (0.10.0)
			if err != nil {
				t.Fatal(err)
			}
			p.selected = selected
			key := bytes.Clone(f.key)
			switch mode {
			case "wrong-key":
				key[0] ^= 1
			case "corrupted":
				f.files[downloadPrefix("v0.2.0")+zipName("0.2.0")][0] ^= 1
			case "missing-asset":
				delete(f.files, downloadPrefix("v0.2.0")+zipName("0.2.0"))
			}
			engine := updater.New(updaterTestHost{})
			if err := engine.Init(updater.Config{CurrentVersion: "0.1.0", PublicKey: key, Providers: []updater.Provider{p}, Window: updater.WindowNone}); err != nil {
				t.Fatal(err)
			}
			release, err := engine.Check(context.Background())
			if err != nil || release.Version != "0.2.0" {
				t.Fatal(release, err)
			}
			err = engine.DownloadAndInstall(context.Background()) // never Restart
			if mode == "valid" {
				if err != nil {
					t.Fatal(err)
				}
				staged := engine.DownloadedPath()
				if filepath.Base(staged) != "Innerly.app" {
					t.Fatal(staged)
				}
				if _, err := os.Stat(filepath.Join(staged, "Contents", "MacOS", "Innerly")); err != nil {
					t.Fatal(err)
				}
				exe, _ := os.Executable()
				u := &UpdateService{engine: engine, target: filepath.Join(filepath.Dir(exe), "Innerly.app")}
				u.discardStaged()
				if _, err := os.Stat(staged); !os.IsNotExist(err) {
					t.Fatal("did not clean staging", err)
				}
			} else if err == nil || engine.State() == updater.StateReady {
				t.Fatal("unauthenticated update reached ready state", err)
			}
			last := f.requested[len(f.requested)-1]
			if !strings.Contains(last, "/v0.2.0/"+zipName("0.2.0")) {
				t.Fatal("selection changed", last)
			}
		})
	}
}

// This runner replaces PlistBuddy. It reads no signing identity and no bundle.
func macTools(identifier, version string) commandRunner {
	return func(_ context.Context, name string, args ...string) ([]byte, error) {
		if filepath.Base(name) != "PlistBuddy" {
			return nil, errors.New("unexpected command")
		}
		if args[1] == "Print :CFBundleIdentifier" {
			return []byte(identifier + "\n"), nil
		}
		return []byte(version + "\n"), nil
	}
}

func TestMacUpdateValidation(t *testing.T) {
	if err := validateUpdate(context.Background(), "/stage/Innerly.app", "0.2.0", macTools("co.innerly", "0.2.0")); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct{ staged, identifier, version string }{
		{"/stage/Innerly.app", "co.innerly", "0.3.0"},    // a different version than chosen
		{"/stage/Innerly.app", "com.other.app", "0.2.0"}, // a different application
		{"/stage/Other.app", "co.innerly", "0.2.0"},      // not Innerly's bundle
	} {
		if validateUpdate(context.Background(), tc.staged, "0.2.0", macTools(tc.identifier, tc.version)) == nil {
			t.Fatal("accepted mismatched update", tc)
		}
	}
	for _, path := range []string{"", "/Volumes/Innerly/Innerly.app", "/private/var/AppTranslocation/test/Innerly.app"} {
		if updateLocation(path) == nil {
			t.Fatal("unsafe installation location", path)
		}
	}
}

type fakeUpdateEngine struct {
	provider     *releaseProvider
	staged       string
	version      string
	restarts     int
	restartError error
	started      chan struct{}
}

func (e *fakeUpdateEngine) Check(ctx context.Context) (*updater.Release, error) {
	r, err := e.provider.Check(ctx, updater.CheckRequest{})
	if r != nil {
		e.version = r.Version
	}
	return r, err
}
func (e *fakeUpdateEngine) DownloadAndInstall(ctx context.Context) error {
	if e.started != nil {
		close(e.started)
		<-ctx.Done()
		return ctx.Err()
	}
	return os.MkdirAll(e.staged, 0700)
}
func (e *fakeUpdateEngine) DownloadedPath() string        { return e.staged }
func (e *fakeUpdateEngine) State() updater.State          { return updater.StateIdle }
func (e *fakeUpdateEngine) Restart(context.Context) error { e.restarts++; return e.restartError }

func TestSelectedUpdateServiceAndRestartRecovery(t *testing.T) {
	f := newUpdateFixture(t)
	p := &releaseProvider{client: f.client}
	dir := t.TempDir()
	engine := &fakeUpdateEngine{provider: p, staged: filepath.Join(dir, "wails-update-fixture", "extract", "Innerly.app")}
	t.Setenv("HOME", t.TempDir())
	lock := openInstanceLock()
	defer lock.Close()
	u := &UpdateService{engine: engine, provider: p, lock: lock, ctx: context.Background(),
		target: filepath.Join(dir, "Innerly.app"), run: macTools("co.innerly", "0.2.0"), status: UpdateStatus{Current: "0.1.0"}}
	if _, err := u.Check(); err != nil {
		t.Fatal(err)
	}
	requests := len(f.requested)
	if _, err := u.Check(); err != nil || len(f.requested) != requests {
		t.Fatal("one-minute catalog cache", err)
	}
	if err := u.Download("0.1.0"); err == nil {
		t.Fatal("downgrade accepted")
	}
	if err := u.Download("0.2.0"); err != nil {
		t.Fatal(err)
	}
	f.releases = append(f.releases, map[string]any{"tag_name": "v0.20.0"}) // a newer release appears
	if engine.version != "0.2.0" || !u.Status().Ready || engine.restarts != 0 {
		t.Fatal("wrong selection or automatic restart")
	}
	requests = len(f.requested)
	if err := u.Restart("0.3.0"); err == nil {
		t.Fatal("restarted a different version")
	}
	other := openInstanceLock()
	if err := u.Restart("0.2.0"); err == nil {
		t.Fatal("replaced the app while another instance was running")
	}
	other.Close()
	engine.restartError = errors.New("fixture helper failed")
	if err := u.Restart("0.2.0"); err == nil {
		t.Fatal("helper failure hidden")
	}
	if u.Status().State == "restarting" {
		t.Fatal("a failed restart must leave the app usable")
	}
	engine.restartError = nil
	if err := u.Restart("0.2.0"); err != nil {
		t.Fatal(err)
	}
	if len(f.requested) != requests {
		t.Fatal("restart must not re-resolve latest")
	}
	u.discardStaged()
}

func TestUpdateDownloadCancellationAndSerialization(t *testing.T) {
	f := newUpdateFixture(t)
	p := &releaseProvider{client: f.client}
	if _, err := p.catalog(context.Background(), "0.1.0"); err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	engine := &fakeUpdateEngine{provider: p, started: make(chan struct{})}
	u := &UpdateService{engine: engine, provider: p, ctx: context.Background(), target: filepath.Join(dir, "Innerly.app"), status: UpdateStatus{Current: "0.1.0"}}
	done := make(chan error, 1)
	go func() { done <- u.Download("0.2.0") }()
	<-engine.started
	if _, err := u.Check(); err == nil {
		t.Fatal("concurrent check could change selection")
	}
	if err := u.Download("0.3.0"); err == nil {
		t.Fatal("concurrent selection allowed")
	}
	u.Cancel()
	if err := <-done; !errors.Is(err, context.Canceled) {
		t.Fatal(err)
	}
	if u.Status().Ready || engine.restarts != 0 {
		t.Fatal("canceled download became installable")
	}
	dev := newUpdateService(context.Background(), engine, p, nil, "", "development")
	if dev.Status().Disabled == "" || dev.Download("0.2.0") == nil {
		t.Fatal("development installation must be disabled")
	}
}

func TestUpdateCatalogErrors(t *testing.T) {
	for _, code := range []int{403, 429, 500} {
		p := &releaseProvider{client: &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			return &http.Response{StatusCode: code, Header: http.Header{}, Body: io.NopCloser(strings.NewReader("failure")), Request: r}, nil
		})}}
		if _, err := p.catalog(context.Background(), "0.1.0"); err == nil {
			t.Fatal("GitHub failure treated as up-to-date", code)
		}
	}
}
