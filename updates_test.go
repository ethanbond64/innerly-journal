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
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/wailsapp/wails/v3/pkg/updater"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

type updateFixture struct {
	pages     map[string]string
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
	f := &updateFixture{key: pub, pages: map[string]string{}, files: map[string][]byte{}}
	var releases []map[string]any
	for _, version := range []string{"0.2.0", "0.3.0", "0.9.0", "0.10.0"} {
		prefix := releaseRepository + "/releases/download/v" + version + "/"
		name := "Innerly-" + version + "-mac-universal.zip"
		manifest := map[string]any{"schemaVersion": 1, "version": version, "channel": "stable", "artifacts": []any{map[string]any{
			"url": prefix + name, "platform": "darwin", "size": len(payload),
			"digestAlgo": "sha512", "digest": base64.StdEncoding.EncodeToString(digest[:]),
			"signatureAlgo": "ed25519ph", "signature": base64.StdEncoding.EncodeToString(signature),
		}}}
		f.files[prefix+"manifest.json"], _ = json.Marshal(manifest)
		f.files[prefix+name] = bytes.Clone(payload)
		releases = append(releases, map[string]any{"tag_name": "v" + version, "published_at": "2026-01-01T00:00:00Z", "body": "<script>not HTML</script>", "assets": []any{
			map[string]any{"name": name, "size": len(payload), "browser_download_url": prefix + name},
			map[string]any{"name": "manifest.json", "browser_download_url": prefix + "manifest.json"},
		}})
	}
	page, _ := json.Marshal(releases)
	f.pages["1"] = string(page)
	f.client = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		f.requested = append(f.requested, r.URL.String())
		if r.Header.Get("Authorization") != "" {
			t.Error("must not send a token")
		}
		header := http.Header{}
		status := http.StatusOK
		var body []byte
		if r.URL.Host == "api.github.com" {
			page := r.URL.Query().Get("page")
			body = []byte(f.pages[page])
			if f.pages[fmt.Sprint(mustPage(page)+1)] != "" {
				header.Set("Link", `<https://api.github.com/next>; rel="next"`)
			}
		} else {
			body = f.files["https://"+r.URL.Host+r.URL.Path]
			if body == nil {
				status = http.StatusNotFound
			}
		}
		return &http.Response{StatusCode: status, Header: header, Body: io.NopCloser(bytes.NewReader(body)), Request: r}, nil
	})}
	return f
}

func mustPage(s string) int { var n int; _, _ = fmt.Sscan(s, &n); return n }

func TestUpdateCatalog(t *testing.T) {
	f := newUpdateFixture(t)
	f.pages["2"] = `[{"tag_name":"v0.1.0"},{"tag_name":"v0.0.1"},{"tag_name":"v0.11.0-beta.1"},{"tag_name":"v0.12.0","draft":true},{"tag_name":"v0.13.0","prerelease":true},{"tag_name":"0.14.0"}]`
	p := &releaseProvider{client: f.client}
	releases, err := p.catalog(context.Background(), "0.1.0")
	if err != nil {
		t.Fatal(err)
	}
	var versions []string
	for _, r := range releases {
		versions = append(versions, r.Version)
	}
	if strings.Join(versions, ",") != "0.14.0,0.10.0,0.9.0,0.3.0,0.2.0" {
		t.Fatal(versions)
	}
	if releases[0].Unavailable == "" || releases[1].Unavailable != "" {
		t.Fatal("missing metadata must not be installable", releases)
	}
	if releases[1].Notes != "<script>not HTML</script>" {
		t.Fatal("notes must stay plain text")
	}
	if stableVersion("v0.2.0") != "0.2.0" || stableVersion("0.2.0") != "0.2.0" || stableVersion("0.2") != "" {
		t.Fatal("stable version normalization")
	}
	if len(p.releases) != 4 {
		t.Fatal("only verified-metadata universal ZIP candidates belong in the catalog")
	}
}

func TestUpdateRejectsBadMetadata(t *testing.T) {
	for _, mode := range []string{"missing-signature", "missing-digest", "wrong-version", "wrong-url", "wrong-size", "arm-only", "dmg"} {
		t.Run(mode, func(t *testing.T) {
			f := newUpdateFixture(t)
			path := releaseRepository + "/releases/download/v0.2.0/manifest.json"
			var m map[string]any
			_ = json.Unmarshal(f.files[path], &m)
			a := m["artifacts"].([]any)[0].(map[string]any)
			switch mode {
			case "missing-signature":
				delete(a, "signature")
			case "missing-digest":
				delete(a, "digest")
			case "wrong-version":
				m["version"] = "0.3.0"
			case "wrong-url":
				a["url"] = "https://evil.example/Innerly-0.2.0-mac-universal.zip"
			case "wrong-size":
				a["size"] = 1
			case "arm-only":
				a["url"] = strings.Replace(a["url"].(string), "universal", "arm64", 1)
			case "dmg":
				a["url"] = strings.Replace(a["url"].(string), ".zip", ".dmg", 1)
			}
			f.files[path], _ = json.Marshal(m)
			p := &releaseProvider{client: f.client}
			list, err := p.catalog(context.Background(), "0.1.0")
			if err != nil {
				t.Fatal(err)
			}
			if p.releases["0.2.0"] != nil {
				t.Fatal("bad manifest became downloadable")
			}
			if list[len(list)-1].Unavailable == "" {
				t.Fatal("must explain unavailable release")
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

func TestWailsUpdateVerificationAndSelection(t *testing.T) {
	for _, mode := range []string{"valid", "wrong-key", "corrupted", "stripped-signature", "stripped-verification", "missing-asset"} {
		t.Run(mode, func(t *testing.T) {
			f := newUpdateFixture(t)
			p := &releaseProvider{client: f.client}
			if _, err := p.catalog(context.Background(), "0.1.0"); err != nil {
				t.Fatal(err)
			}
			p.selected = p.releases["0.2.0"] // deliberately NOT the latest (0.10.0)
			key := bytes.Clone(f.key)
			if mode == "wrong-key" {
				key[0] ^= 1
			}
			if mode == "corrupted" {
				path := releaseRepository + "/releases/download/v0.2.0/Innerly-0.2.0-mac-universal.zip"
				f.files[path][0] ^= 1
			}
			if mode == "stripped-signature" {
				p.selected.Verification.Signature = nil
			}
			if mode == "stripped-verification" {
				p.selected.Verification = nil
			}
			if mode == "missing-asset" {
				delete(f.files, releaseRepository+"/releases/download/v0.2.0/Innerly-0.2.0-mac-universal.zip")
			}
			engine := updater.New(updaterTestHost{})
			if err := engine.Init(updater.Config{CurrentVersion: "0.1.0", PublicKey: key, Providers: []updater.Provider{p}, Window: updater.WindowNone}); err != nil {
				t.Fatal(err)
			}
			release, err := engine.Check(context.Background())
			if err != nil || release.Version != "0.2.0" {
				t.Fatal(release, err)
			}
			err = engine.DownloadAndInstall(context.Background()) // real Wails download/hash/verify/extract; NEVER Restart
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
			if !strings.Contains(last, "/v0.2.0/Innerly-0.2.0-mac-universal.zip") {
				t.Fatal("selection changed", last)
			}
		})
	}
}

// This runner replaces all macOS tools. It does not read signing identities.
func macTools(version, team string) commandRunner {
	return func(_ context.Context, name string, args ...string) ([]byte, error) {
		switch filepath.Base(name) {
		case "PlistBuddy":
			switch args[1] {
			case "Print :CFBundleIdentifier":
				return []byte("co.innerly\n"), nil
			case "Print :LSMinimumSystemVersion":
				return []byte("12.0\n"), nil
			default:
				return []byte(version + "\n"), nil
			}
		case "sw_vers":
			return []byte("15.0\n"), nil
		case "codesign":
			return []byte("TeamIdentifier=" + team + "\n"), nil
		case "lipo", "spctl":
			return nil, nil
		}
		return nil, errors.New("unexpected command")
	}
}

func TestMacUpdateValidation(t *testing.T) {
	for _, mode := range []string{"valid", "version", "team", "architecture", "gatekeeper", "macos"} {
		t.Run(mode, func(t *testing.T) {
			run := macTools("0.2.0", "TESTTEAM")
			base := run
			run = func(ctx context.Context, name string, args ...string) ([]byte, error) {
				if mode == "version" && filepath.Base(name) == "PlistBuddy" && args[1] == "Print :CFBundleVersion" {
					return []byte("0.3.0"), nil
				}
				if mode == "team" && filepath.Base(name) == "codesign" && args[0] == "--display" && args[len(args)-1] == "/stage/Innerly.app" {
					return []byte("TeamIdentifier=OTHER"), nil
				}
				if mode == "architecture" && filepath.Base(name) == "lipo" || mode == "gatekeeper" && filepath.Base(name) == "spctl" {
					return nil, errors.New("fixture rejection")
				}
				if mode == "macos" && filepath.Base(name) == "sw_vers" {
					return []byte("11.0"), nil
				}
				return base(ctx, name, args...)
			}
			err := validateUpdate(context.Background(), "/stage/Innerly.app", "0.2.0", "/installed/Innerly.app", run)
			if (err == nil) != (mode == "valid") {
				t.Fatal(mode, err)
			}
		})
	}
	for _, path := range []string{"", "/Volumes/Innerly/Innerly.app", "/private/var/AppTranslocation/test/Innerly.app"} {
		if updateLocation(path) == nil {
			t.Fatal("unsafe installation location", path)
		}
	}
}

func TestInstanceUpdateGuard(t *testing.T) {
	t.Setenv("INNERLY_UPDATE_HANDOFF", "")
	dir := t.TempDir()
	first, err := openInstanceGuard(dir)
	if err != nil {
		t.Fatal(err)
	}
	defer first.Close()
	second, err := openInstanceGuard(dir)
	if err != nil {
		t.Fatal(err)
	}
	if err := first.beginUpdate(); err == nil {
		t.Fatal("must require other processes/windows to close")
	}
	second.Close()
	if err := first.beginUpdate(); err != nil {
		t.Fatal(err)
	}
	// A new process cannot open its journal during the parent/helper handoff.
	var wg sync.WaitGroup
	opened := make(chan *instanceGuard, 1)
	wg.Go(func() { g, _ := openInstanceGuard(dir); opened <- g })
	select {
	case <-opened:
		t.Fatal("new instance passed the update gate")
	case <-time.After(150 * time.Millisecond):
	}
	first.abortUpdate()
	select {
	case g := <-opened:
		g.Close()
	case <-time.After(3 * time.Second):
		t.Fatal("failed restart left instance gate locked")
	}
	wg.Wait()
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
	t.Setenv("INNERLY_UPDATE_HANDOFF", "")
	f := newUpdateFixture(t)
	p := &releaseProvider{client: f.client}
	dir := t.TempDir()
	guard, err := openInstanceGuard(filepath.Join(dir, "instances"))
	if err != nil {
		t.Fatal(err)
	}
	defer guard.Close()
	engine := &fakeUpdateEngine{provider: p, staged: filepath.Join(dir, "wails-update-fixture", "extract", "Innerly.app")}
	u := &UpdateService{engine: engine, provider: p, guard: guard, ctx: context.Background(), target: filepath.Join(dir, "Innerly.app"), run: macTools("0.2.0", "TESTTEAM"), status: UpdateStatus{Current: "0.1.0"}}
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
	f.pages["1"] = `[{"tag_name":"v0.20.0"}]` // a newer release appears after our download
	if engine.version != "0.2.0" || !u.Status().Ready || engine.restarts != 0 {
		t.Fatal("wrong selection or automatic restart")
	}
	if err := u.Restart("0.3.0"); err == nil {
		t.Fatal("restarted a different version")
	}
	other, err := openInstanceGuard(filepath.Join(dir, "instances"))
	if err != nil {
		t.Fatal(err)
	}
	if err := u.Restart("0.2.0"); err == nil {
		t.Fatal("restart allowed with another process")
	}
	other.Close()
	engine.restartError = errors.New("fixture helper failed")
	if err := u.Restart("0.2.0"); err == nil {
		t.Fatal("helper failure hidden")
	}
	if _, err := os.Stat(guard.gate); !os.IsNotExist(err) {
		t.Fatal("helper failure left update marker", err)
	}
	engine.restartError = nil
	if err := u.Restart("0.2.0"); err != nil {
		t.Fatal(err)
	}
	if len(f.requested) != requests {
		t.Fatal("restart must not re-resolve latest")
	}
	guard.abortUpdate() // fake helper did not run; restore the fixture gate
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

func TestHelperInstanceMarker(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	t.Setenv("WAILS_UPDATER_HELPER", "1")
	t.Setenv("INNERLY_UPDATE_HANDOFF", "1")
	dir, err := instanceDirectory()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	if err := handoffUpdateGuard(); err != nil {
		t.Fatal(err)
	}
	marker := filepath.Join(dir, "updating.pid")
	data, err := os.ReadFile(marker)
	if err != nil || strings.TrimSpace(string(data)) != fmt.Sprint(os.Getpid()) {
		t.Fatal("helper PID was not handed off", string(data), err)
	}
	// A dead helper's marker must not permanently prevent the next launch.
	if err := os.WriteFile(marker, []byte("2147483647"), 0600); err != nil {
		t.Fatal(err)
	}
	guard, err := openInstanceGuard(dir)
	if err != nil {
		t.Fatal(err)
	}
	guard.Close()
	if _, err := os.Stat(marker); !os.IsNotExist(err) {
		t.Fatal("stale marker retained", err)
	}
}

func TestGitHubRedirectPolicy(t *testing.T) {
	for _, address := range []string{"http://github.com/file", "https://evil.example/file", "https://githubusercontent.com.evil.example/file", "https://user:secret@github.com/file"} {
		req, _ := http.NewRequest("GET", address, nil)
		if newReleaseClient().CheckRedirect(req, nil) == nil {
			t.Fatal("unsafe redirect allowed", address)
		}
	}
	req, _ := http.NewRequest("GET", "https://release-assets.githubusercontent.com/file", nil)
	if err := newReleaseClient().CheckRedirect(req, nil); err != nil {
		t.Fatal(err)
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
