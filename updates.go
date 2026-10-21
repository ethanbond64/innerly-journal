package main

import (
	"context"
	"encoding/base64"
	"errors"
	"strings"
	"sync"
)

// Set only by release builds, from the maintainer's public PEM file. Never
// accept a verification key from GitHub or ship the private key.
var updatePublicKey string

// GitHub resolves this to the newest non-prerelease release's manifest, which
// carries the universal ZIP's size, SHA-512 digest and Ed25519ph signature.
const updateManifestURL = "https://github.com/ethanbond64/innerly-once/releases/latest/download/manifest.json"

func updateKey() []byte {
	key, _ := base64.StdEncoding.DecodeString(updatePublicKey)
	return key
}

type UpdateStatus struct {
	Current  string `json:"current"`
	Disabled string `json:"disabled"`
}

type updateEngine interface {
	CheckAndInstall(context.Context) error
}

// Wails owns the update flow: its window, the download, signature
// verification against the pinned key, extraction, the bundle swap and the
// relaunch. This only decides whether this installation may update at all.
type UpdateService struct {
	engine   updateEngine
	lock     *instanceLock
	ctx      context.Context
	target   string
	current  string
	disabled string
	busy     sync.Mutex
}

func newUpdateService(ctx context.Context, engine updateEngine, lock *instanceLock, target, current string) *UpdateService {
	u := &UpdateService{engine: engine, lock: lock, ctx: ctx, target: target, current: strings.TrimPrefix(current, "v")}
	if len(updateKey()) == 0 {
		u.disabled = "This development build cannot install updates. Install a signed release to enable updates."
	} else if err := updateLocation(target); err != nil {
		u.disabled = err.Error()
	}
	return u
}

func (u *UpdateService) Status() UpdateStatus {
	return UpdateStatus{Current: u.current, Disabled: u.disabled}
}

// Check opens Wails' update window and returns once it has finished checking,
// downloading and verifying. The location and single-instance checks happen
// here because the window's Restart button swaps the bundle without asking
// this service again.
func (u *UpdateService) Check() error {
	if u.disabled != "" {
		return errors.New(u.disabled)
	}
	if !u.busy.TryLock() {
		return errors.New("an update check is already running")
	}
	defer u.busy.Unlock()
	if err := updateLocation(u.target); err != nil {
		return err
	}
	if err := u.lock.probeExclusive(); err != nil {
		return err
	}
	return u.engine.CheckAndInstall(u.ctx)
}
