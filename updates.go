package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/updater"
	"github.com/wailsapp/wails/v3/pkg/updater/providers/endpoint"
	"golang.org/x/mod/semver"
)

// Set only by release builds, from the maintainer's public PEM file. Never
// accept a verification key from GitHub or ship the private key.
var updatePublicKey string

const releaseRepository = "https://github.com/ethanbond64/innerly-once"
const releasesAPI = "https://api.github.com/repos/ethanbond64/innerly-once/releases"

type UpdateRelease struct {
	Version     string    `json:"version"`
	PublishedAt time.Time `json:"publishedAt"`
	Notes       string    `json:"notes"`
	Unavailable string    `json:"unavailable"`
}

type UpdateStatus struct {
	Current     string          `json:"current"`
	Disabled    string          `json:"disabled"`
	Releases    []UpdateRelease `json:"releases"`
	LastChecked time.Time       `json:"lastChecked"`
	State       updater.State   `json:"state"`
	Version     string          `json:"version"`
	Ready       bool            `json:"ready"`
	Written     int64           `json:"written"`
	Total       int64           `json:"total"`
}

// The only adapter Wails needs: Check returns the exact release chosen from
// our checked catalog. Download delegates to Wails' stock manifest provider.
// All mutations are serialized by UpdateService.op; there is no background check.
type releaseProvider struct {
	client   *http.Client
	releases map[string]*updater.Release
	selected *updater.Release
	progress func(int64, int64)
}

func newReleaseClient() *http.Client {
	return &http.Client{
		Timeout: 10 * time.Minute, // downloads; catalog requests have a shorter context
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			host := req.URL.Hostname()
			if len(via) >= 10 || req.URL.Scheme != "https" || req.URL.User != nil ||
				(host != "github.com" && host != "api.github.com" && !strings.HasSuffix(host, ".githubusercontent.com")) {
				return errors.New("update redirected outside GitHub")
			}
			return nil
		},
	}
}

func (p *releaseProvider) Name() string { return "selected-github-release" }
func (p *releaseProvider) Check(context.Context, updater.CheckRequest) (*updater.Release, error) {
	if p.selected == nil {
		return nil, errors.New("choose an available version first")
	}
	r := *p.selected // Wails annotates Provider; keep the catalog immutable.
	return &r, nil
}
func (p *releaseProvider) Download(ctx context.Context, r *updater.Release, dst io.Writer, progress func(int64, int64)) error {
	provider, err := endpoint.New(endpoint.Config{URL: releaseRepository, HTTPClient: p.client})
	if err != nil {
		return err
	}
	return provider.Download(ctx, r, dst, func(written, total int64) {
		if p.progress != nil {
			p.progress(written, total)
		}
		progress(written, total)
	})
}

func stableVersion(tag string) string {
	v := "v" + strings.TrimPrefix(tag, "v")
	if semver.IsValid(v) && semver.Prerelease(v) == "" && semver.Canonical(v) == v {
		return strings.TrimPrefix(v, "v")
	}
	return ""
}

func (p *releaseProvider) catalog(ctx context.Context, current string) ([]UpdateRelease, error) {
	type githubRelease struct {
		Tag         string    `json:"tag_name"`
		Draft       bool      `json:"draft"`
		Prerelease  bool      `json:"prerelease"`
		Notes       string    `json:"body"`
		PublishedAt time.Time `json:"published_at"`
		Assets      []struct {
			Name string `json:"name"`
			URL  string `json:"browser_download_url"`
			Size int64  `json:"size"`
		} `json:"assets"`
	}
	var result []UpdateRelease
	available := map[string]*updater.Release{}
	seen := map[string]bool{}
	for page := 1; ; page++ {
		if page > 20 {
			return nil, errors.New("too many release pages; try again later")
		}
		req, err := http.NewRequestWithContext(ctx, "GET", fmt.Sprintf("%s?per_page=100&page=%d", releasesAPI, page), nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Accept", "application/vnd.github+json")
		resp, err := p.client.Do(req)
		if err != nil {
			return nil, fmt.Errorf("check GitHub releases: %w", err)
		}
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024+1))
		resp.Body.Close()
		if resp.StatusCode == 403 || resp.StatusCode == 429 {
			return nil, errors.New("GitHub's update rate limit was reached. Please try again later.")
		}
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("GitHub releases: HTTP %d", resp.StatusCode)
		}
		if readErr != nil || len(body) > 2*1024*1024 {
			return nil, errors.New("could not read GitHub releases: response incomplete or too large")
		}
		var releases []githubRelease
		if err := json.Unmarshal(body, &releases); err != nil {
			return nil, fmt.Errorf("read GitHub releases: %w", err)
		}
		for _, release := range releases {
			version := stableVersion(release.Tag)
			if release.Draft || release.Prerelease || version == "" || seen[version] ||
				(stableVersion(current) != "" && semver.Compare("v"+version, "v"+current) <= 0) {
				continue
			}
			seen[version] = true
			info := UpdateRelease{Version: version, PublishedAt: release.PublishedAt, Notes: release.Notes}
			zipName := "Innerly-" + version + "-mac-universal.zip"
			prefix := releaseRepository + "/releases/download/" + url.PathEscape(release.Tag) + "/"
			var zipSize int64
			var hasManifest bool
			for _, asset := range release.Assets {
				if asset.URL != prefix+asset.Name { // never follow feed-supplied arbitrary URLs
					continue
				}
				if asset.Name == zipName {
					zipSize = asset.Size
				}
				if asset.Name == "manifest.json" {
					hasManifest = true
				}
			}
			info.Unavailable = "Missing universal ZIP or update verification metadata."
			if hasManifest && zipSize > 0 {
				provider, err := endpoint.New(endpoint.Config{URL: prefix + "manifest.json", Channel: "stable", HTTPClient: p.client})
				if err != nil {
					return nil, err
				}
				// A development build may list releases but may not install them.
				installed := current
				if stableVersion(installed) == "" {
					installed = "0.0.0"
				}
				r, err := provider.Check(ctx, updater.CheckRequest{CurrentVersion: installed, Platform: "darwin", Arch: runtime.GOARCH})
				if ctx.Err() != nil {
					return nil, ctx.Err()
				}
				if err == nil && r != nil && r.Version == version && r.Artifact.Filename == zipName &&
					r.Artifact.Size == zipSize && r.Metadata["endpoint.artifact.url"] == prefix+zipName &&
					r.Verification != nil && r.Verification.DigestAlgo == "sha512" && len(r.Verification.Digest) == 64 &&
					r.Verification.SignatureAlgo == "ed25519ph" && len(r.Verification.Signature) == 64 {
					info.Unavailable = ""
					available[version] = r
				} else {
					info.Unavailable = "Invalid or incompatible update verification metadata."
				}
			}
			result = append(result, info)
		}
		if !strings.Contains(resp.Header.Get("Link"), `rel="next"`) {
			break
		}
	}
	sort.Slice(result, func(i, j int) bool { return semver.Compare("v"+result[i].Version, "v"+result[j].Version) > 0 })
	p.releases = available // replace only after a completely successful check
	return result, nil
}

type updateEngine interface {
	Check(context.Context) (*updater.Release, error)
	DownloadAndInstall(context.Context) error
	DownloadedPath() string
	State() updater.State
	Restart(context.Context) error
}

// One operation at a time. In particular a new check cannot change a selection
// during download, and Restart never rechecks "latest".
type UpdateService struct {
	engine     updateEngine
	provider   *releaseProvider
	guard      *instanceGuard
	ctx        context.Context
	stop       context.CancelFunc
	target     string
	key        []byte
	run        commandRunner
	op         sync.Mutex
	mu         sync.Mutex
	status     UpdateStatus
	cancel     context.CancelFunc
	restarting bool
}

func newUpdateService(ctx context.Context, engine updateEngine, provider *releaseProvider, guard *instanceGuard, target, current string) *UpdateService {
	key, _ := base64.StdEncoding.DecodeString(updatePublicKey)
	ctx, stop := context.WithCancel(ctx)
	u := &UpdateService{ctx: ctx, stop: stop, engine: engine, provider: provider, guard: guard, target: target, key: key, run: runCommand}
	u.status.Current = strings.TrimPrefix(current, "v")
	if stableVersion(current) == "" || len(key) == 0 {
		u.status.Disabled = "This development build cannot install updates. Install a signed release to enable updates."
	} else if err := updateLocation(target); err != nil {
		u.status.Disabled = err.Error()
	}
	provider.progress = func(written, total int64) {
		u.mu.Lock()
		u.status.Written, u.status.Total = written, total
		u.mu.Unlock()
	}
	return u
}

func (u *UpdateService) Status() UpdateStatus {
	u.mu.Lock()
	defer u.mu.Unlock()
	s := u.status
	if s.State == "" {
		s.State = u.engine.State()
	}
	return s
}

func (u *UpdateService) beginOperation() error {
	if !u.op.TryLock() {
		return errors.New("an update operation is already running")
	}
	u.mu.Lock()
	restarting := u.restarting
	u.mu.Unlock()
	if restarting {
		u.op.Unlock()
		return errors.New("Innerly is restarting into the selected update")
	}
	return nil
}

func (u *UpdateService) Check() (UpdateStatus, error) {
	if err := u.beginOperation(); err != nil {
		return u.Status(), err
	}
	defer u.op.Unlock()
	s := u.Status()
	// Simple one-minute cache avoids exhausting GitHub's anonymous quota.
	if !s.LastChecked.IsZero() && time.Since(s.LastChecked) < time.Minute {
		return s, nil
	}
	u.mu.Lock()
	u.status.State = updater.StateChecking
	u.mu.Unlock()
	defer func() { u.mu.Lock(); u.status.State = ""; u.mu.Unlock() }()
	ctx, cancel := context.WithTimeout(u.ctx, time.Minute)
	defer cancel()
	releases, err := u.provider.catalog(ctx, s.Current)
	if err != nil {
		return u.Status(), err
	}
	u.mu.Lock()
	u.status.Releases, u.status.LastChecked = releases, time.Now()
	u.mu.Unlock()
	s = u.Status()
	s.State = u.engine.State()
	return s, nil
}

func (u *UpdateService) Download(version string) error {
	if err := u.beginOperation(); err != nil {
		return err
	}
	defer u.op.Unlock()
	s := u.Status()
	if s.Disabled != "" {
		return errors.New(s.Disabled)
	}
	r := u.provider.releases[version]
	if r == nil || semver.Compare("v"+version, "v"+s.Current) <= 0 {
		return errors.New("choose an available newer version and check for updates again")
	}
	if err := updateLocation(u.target); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(u.ctx, 10*time.Minute)
	u.mu.Lock()
	u.cancel = cancel
	u.status.Version, u.status.Ready = version, false
	u.status.Written, u.status.Total = 0, 0
	u.mu.Unlock()
	defer func() { cancel(); u.mu.Lock(); u.cancel = nil; u.mu.Unlock() }()
	u.provider.selected = r
	if _, err := u.engine.Check(ctx); err != nil {
		return err
	}
	if err := u.engine.DownloadAndInstall(ctx); err != nil {
		return err
	}
	if err := validateUpdate(ctx, u.engine.DownloadedPath(), version, u.target, u.run); err != nil {
		u.discardStaged()
		return fmt.Errorf("update was not installed: %w", err)
	}
	if err := ctx.Err(); err != nil {
		u.discardStaged()
		return err
	}
	u.mu.Lock()
	u.status.Ready = true
	u.mu.Unlock()
	return nil
}

func (u *UpdateService) Cancel() {
	u.mu.Lock()
	defer u.mu.Unlock()
	if u.cancel != nil {
		u.cancel()
	}
}

// Called only after the desktop adapter's shared editor-save barrier succeeds.
func (u *UpdateService) Restart(version string) error {
	if err := u.beginOperation(); err != nil {
		return err
	}
	defer u.op.Unlock()
	u.mu.Lock()
	u.status.State = "restarting"
	u.mu.Unlock()
	defer func() {
		u.mu.Lock()
		if !u.restarting {
			u.status.State = ""
		}
		u.mu.Unlock()
	}()
	s := u.Status()
	if s.Disabled != "" || !s.Ready || version != s.Version {
		return errors.New("download and verify this exact version before restarting")
	}
	if err := updateLocation(u.target); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(u.ctx, time.Minute)
	defer cancel()
	if err := validateUpdate(ctx, u.engine.DownloadedPath(), version, u.target, u.run); err != nil {
		return err
	}
	if err := u.guard.beginUpdate(); err != nil {
		return err
	}
	u.mu.Lock()
	u.restarting = true // shutdown must leave staging for the Wails helper
	u.status.State = "restarting"
	u.mu.Unlock()
	if err := u.engine.Restart(ctx); err != nil {
		u.guard.abortUpdate()
		u.mu.Lock()
		u.restarting = false
		u.status.State = ""
		u.mu.Unlock()
		return err
	}
	return nil
}

func (u *UpdateService) shutdown() {
	if u.stop != nil {
		u.stop()
	}
	u.Cancel()
	u.mu.Lock()
	restarting := u.restarting
	u.mu.Unlock()
	if !restarting {
		u.op.Lock() // await cancellation/cleanup before the process exits
		defer u.op.Unlock()
		u.discardStaged()
	}
}
