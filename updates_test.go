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
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"

	"github.com/wailsapp/wails/v3/pkg/updater"
	"github.com/wailsapp/wails/v3/pkg/updater/providers/endpoint"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

// An in-memory release: a signed ZIP and the manifest describing it. The key is
// generated for this test only; no GitHub, Keychain, Developer ID, notarization
// or actual restart is involved.
func newUpdateFixture(t *testing.T, version string) (*http.Client, ed25519.PublicKey, map[string][]byte) {
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
	name := "Innerly-" + version + "-mac-universal.zip"
	zipURL := "https://github.com/ethanbond64/innerly-once/releases/download/v" + version + "/" + name
	manifest, _ := json.Marshal(map[string]any{"schemaVersion": 1, "version": version, "channel": "stable",
		"artifacts": []any{map[string]any{
			"url": zipURL, "platform": "darwin", "size": len(payload),
			"digestAlgo": "sha512", "digest": base64.StdEncoding.EncodeToString(digest[:]),
			"signatureAlgo": "ed25519ph", "signature": base64.StdEncoding.EncodeToString(signature),
		}}})
	files := map[string][]byte{updateManifestURL: manifest, zipURL: payload}
	client := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.Header.Get("Authorization") != "" {
			t.Error("must not send a token")
		}
		status := http.StatusOK
		// The provider appends query parameters to the manifest URL.
		body, ok := files["https://"+r.URL.Host+r.URL.Path]
		if !ok {
			status = http.StatusNotFound
		}
		return &http.Response{StatusCode: status, Header: http.Header{}, Body: io.NopCloser(bytes.NewReader(body)), Request: r}, nil
	})}
	return client, pub, files
}

type testWindow struct{}

func (testWindow) EmitEvent(string, ...any) bool { return true }
func (testWindow) Show()                         {}
func (testWindow) Close()                        {}

type testHost struct {
	mu        sync.Mutex
	opened    []updater.WindowOptions
	emitted   []string
	listeners []string
	quits     int
}

func (h *testHost) Emit(name string, _ ...any) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.emitted = append(h.emitted, name)
	return true
}
func (h *testHost) OnEvent(name string, _ func(any)) func() {
	h.mu.Lock()
	h.listeners = append(h.listeners, name)
	h.mu.Unlock()
	return func() {}
}
func (h *testHost) OpenWindow(opts updater.WindowOptions) updater.WindowHandle {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.opened = append(h.opened, opts)
	return testWindow{}
}
func (h *testHost) Quit() { h.mu.Lock(); h.quits++; h.mu.Unlock() }

// The whole update path, driven through Wails: its window opens, its provider
// authenticates the payload against the key pinned into this binary, and a
// payload that does not authenticate never becomes installable.
func TestUpdateFlowAndVerification(t *testing.T) {
	for _, mode := range []string{"valid", "wrong-key", "corrupted", "missing-asset", "not-newer"} {
		t.Run(mode, func(t *testing.T) {
			version := "0.2.0"
			if mode == "not-newer" {
				version = "0.1.0" // exactly what is installed
			}
			client, pub, files := newUpdateFixture(t, version)
			key := bytes.Clone(pub)
			zipURL := "https://github.com/ethanbond64/innerly-once/releases/download/v" + version +
				"/Innerly-" + version + "-mac-universal.zip"
			switch mode {
			case "wrong-key":
				key[0] ^= 1
			case "corrupted":
				files[zipURL][0] ^= 1
			case "missing-asset":
				delete(files, zipURL)
			}
			provider, err := endpoint.New(endpoint.Config{URL: updateManifestURL, Channel: "stable", HTTPClient: client})
			if err != nil {
				t.Fatal(err)
			}
			host := &testHost{}
			engine := updater.New(host)
			if err := engine.Init(updater.Config{CurrentVersion: "0.1.0", PublicKey: key,
				Providers: []updater.Provider{provider}, Window: &updater.BuiltinWindow{}}); err != nil {
				t.Fatal(err)
			}
			err = engine.CheckAndInstall(context.Background()) // real download, verify, extract; never Restart

			host.mu.Lock()
			defer host.mu.Unlock()
			if len(host.opened) != 1 {
				t.Fatalf("the update window did not open: %d", len(host.opened))
			}
			if !strings.Contains(host.opened[0].InitialHTML, "wails:updater:user:restart") {
				t.Error("the window is not the framework's update template")
			}
			if host.quits != 0 {
				t.Error("checking for updates must never quit on its own")
			}
			if mode == "not-newer" {
				if err != nil || engine.State() != updater.StateUpToDate {
					t.Fatalf("same version offered as an update: %v %s", err, engine.State())
				}
				return
			}
			if mode == "valid" {
				if err != nil || engine.State() != updater.StateReady {
					t.Fatalf("signed update did not become installable: %v %s", err, engine.State())
				}
				// Restart is the user's decision, through the window's button.
				if !slicesContain(host.listeners, "wails:updater:user:restart") {
					t.Error("no restart listener registered")
				}
				return
			}
			if err == nil || engine.State() == updater.StateReady {
				t.Fatalf("unauthenticated update reached ready state: %v %s", err, engine.State())
			}
		})
	}
}

func slicesContain(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func TestUpdateRefusedWhereInstallWouldFail(t *testing.T) {
	for _, path := range []string{"", "/Volumes/Innerly/Innerly.app", "/private/var/AppTranslocation/x/Innerly.app"} {
		if updateLocation(path) == nil {
			t.Fatal("unsafe installation location", path)
		}
	}
	if appBundle("/Applications/Innerly.app/Contents/MacOS/Innerly") != "/Applications/Innerly.app" {
		t.Fatal("installed bundle not recognised")
	}
	if appBundle("/tmp/Innerly") != "" {
		t.Fatal("a loose executable is not an app bundle")
	}
	// A development build has no pinned key, so it may never install anything.
	dev := newUpdateService(context.Background(), nil, nil, "", "development")
	if dev.Status().Disabled == "" || dev.Check() == nil {
		t.Fatal("development installation must be disabled")
	}
}

func TestUpdateRequiresSingleInstance(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	lock := openInstanceLock()
	if lock == nil {
		t.Fatal("could not take the instance lock")
	}
	defer lock.Close()
	other := openInstanceLock()
	if lock.probeExclusive() == nil {
		t.Fatal("update allowed while another instance was running")
	}
	other.Close()
	if err := lock.probeExclusive(); err != nil {
		t.Fatal(err)
	}
	// The probe must leave this instance sharing, so a later check can repeat it.
	if err := lock.probeExclusive(); err != nil {
		t.Fatal("probe did not return to sharing:", err)
	}
}
