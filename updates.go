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

// The only adapter Wails needs: Check returns the release the user chose rather
// than whatever is newest, and Download delegates to Wails' manifest provider,
// which authenticates the payload against the key compiled into this binary.
// All mutations are serialized by UpdateService.op; there is no background check.
type releaseProvider struct {
	client   *http.Client
	tags     map[string]string
	selected *updater.Release
	progress func(int64, int64)
}

func (p *releaseProvider) Name() string { return "selected-github-release" }

func (p *releaseProvider) Check(context.Context, updater.CheckRequest) (*updater.Release, error) {
	if p.selected == nil {
		return nil, errors.New("choose an available version first")
	}
	r := *p.selected // Wails annotates Provider; keep our copy unchanged.
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

func zipName(version string) string { return "Innerly-" + version + "-mac-universal.zip" }

func downloadPrefix(tag string) string {
	return releaseRepository + "/releases/download/" + url.PathEscape(tag) + "/"
}

// The newest stable releases above current, with their notes. This reads only
// GitHub's release list; a release's manifest is fetched when one is chosen.
func (p *releaseProvider) catalog(ctx context.Context, current string) ([]UpdateRelease, error) {
	type githubRelease struct {
		Tag         string    `json:"tag_name"`
		Draft       bool      `json:"draft"`
		Prerelease  bool      `json:"prerelease"`
		Notes       string    `json:"body"`
		PublishedAt time.Time `json:"published_at"`
		Assets      []struct {
			Name string `json:"name"`
		} `json:"assets"`
	}
	req, err := http.NewRequestWithContext(ctx, "GET", releasesAPI+"?per_page=100", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("check GitHub releases: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusTooManyRequests {
		return nil, errors.New("GitHub's update rate limit was reached. Please try again later.")
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub releases: HTTP %d", resp.StatusCode)
	}
	var releases []githubRelease
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&releases); err != nil {
		return nil, fmt.Errorf("read GitHub releases: %w", err)
	}
	var result []UpdateRelease
	tags := map[string]string{}
	for _, release := range releases {
		version := stableVersion(release.Tag)
		if release.Draft || release.Prerelease || version == "" || tags[version] != "" ||
			(stableVersion(current) != "" && semver.Compare("v"+version, "v"+current) <= 0) {
			continue
		}
		tags[version] = release.Tag
		info := UpdateRelease{Version: version, PublishedAt: release.PublishedAt, Notes: release.Notes}
		var hasZip, hasManifest bool
		for _, asset := range release.Assets {
			hasZip = hasZip || asset.Name == zipName(version)
			hasManifest = hasManifest || asset.Name == "manifest.json"
		}
		if !hasZip || !hasManifest {
			info.Unavailable = "Missing universal ZIP or update verification metadata."
		}
		result = append(result, info)
	}
	sort.Slice(result, func(i, j int) bool { return semver.Compare("v"+result[i].Version, "v"+result[j].Version) > 0 })
	p.tags = tags // replace only after a completely successful check
	return result, nil
}

// Resolve exactly the chosen version's manifest. Wails verifies the payload's
// digest and signature during download; this only refuses a manifest that
// describes a different version or points somewhere other than that release.
func (p *releaseProvider) resolve(ctx context.Context, version, current string) (*updater.Release, error) {
	tag := p.tags[version]
	if tag == "" {
		return nil, errors.New("choose an available newer version and check for updates again")
	}
	prefix := downloadPrefix(tag)
	provider, err := endpoint.New(endpoint.Config{URL: prefix + "manifest.json", Channel: "stable", HTTPClient: p.client})
	if err != nil {
		return nil, err
	}
	// A development build may list releases but may not install them.
	if stableVersion(current) == "" {
		current = "0.0.0"
	}
	r, err := provider.Check(ctx, updater.CheckRequest{CurrentVersion: current, Platform: "darwin", Arch: runtime.GOARCH})
	if err != nil {
		return nil, fmt.Errorf("read update metadata for v%s: %w", version, err)
	}
	if r == nil || r.Version != version || r.Artifact.Filename != zipName(version) ||
		r.Metadata["endpoint.artifact.url"] != prefix+zipName(version) {
		return nil, fmt.Errorf("v%s's update metadata does not describe that release", version)
	}
	return r, nil
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
	lock       *instanceLock
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

func newUpdateService(ctx context.Context, engine updateEngine, provider *releaseProvider, lock *instanceLock, target, current string) *UpdateService {
	key, _ := base64.StdEncoding.DecodeString(updatePublicKey)
	ctx, stop := context.WithCancel(ctx)
	u := &UpdateService{ctx: ctx, stop: stop, engine: engine, provider: provider, lock: lock, target: target, key: key, run: runCommand}
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
	if semver.Compare("v"+version, "v"+s.Current) <= 0 {
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
	r, err := u.provider.resolve(ctx, version, s.Current)
	if err != nil {
		return err
	}
	u.provider.selected = r
	if _, err := u.engine.Check(ctx); err != nil {
		return err
	}
	if err := u.engine.DownloadAndInstall(ctx); err != nil {
		return err
	}
	if err := validateUpdate(ctx, u.engine.DownloadedPath(), version, u.run); err != nil {
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

// Called only after the frontend has flushed in-progress writing.
func (u *UpdateService) Restart(version string) error {
	if err := u.beginOperation(); err != nil {
		return err
	}
	defer u.op.Unlock()
	s := u.Status()
	if s.Disabled != "" || !s.Ready || version != s.Version {
		return errors.New("download and verify this exact version before restarting")
	}
	if err := updateLocation(u.target); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(u.ctx, time.Minute)
	defer cancel()
	if err := validateUpdate(ctx, u.engine.DownloadedPath(), version, u.run); err != nil {
		return err
	}
	if err := u.lock.acquireForUpdate(); err != nil {
		return err
	}
	u.mu.Lock()
	u.restarting = true // shutdown must leave staging for the Wails helper
	u.status.State = "restarting"
	u.mu.Unlock()
	if err := u.engine.Restart(ctx); err != nil {
		u.lock.release()
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
