package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
)

type commandRunner func(context.Context, string, ...string) ([]byte, error)

func runCommand(ctx context.Context, name string, args ...string) ([]byte, error) {
	output, err := exec.CommandContext(ctx, name, args...).CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("%s: %w: %s", filepath.Base(name), err, strings.TrimSpace(string(output)))
	}
	return output, nil
}

func appBundle(executable string) string {
	if filepath.Base(executable) != "Innerly" || filepath.Base(filepath.Dir(executable)) != "MacOS" ||
		filepath.Base(filepath.Dir(filepath.Dir(executable))) != "Contents" {
		return ""
	}
	target := filepath.Dir(filepath.Dir(filepath.Dir(executable)))
	if filepath.Ext(target) != ".app" {
		return ""
	}
	return target
}

func updateLocation(target string) error {
	if runtime.GOOS != "darwin" || target == "" || strings.HasPrefix(target, "/Volumes/") || strings.Contains(target, "/AppTranslocation/") || strings.Contains(filepath.Dir(target)+"/", ".app/") {
		return errors.New("Move Innerly to Applications and launch it there before updating.")
	}
	// Wails stages and swaps beside the installed bundle; never request elevation.
	probe, err := os.MkdirTemp(filepath.Dir(target), ".innerly-write-check-*")
	if err != nil {
		return errors.New("Innerly's installation folder is not writable. Move it to a writable Applications folder or install the DMG manually.")
	}
	return os.Remove(probe)
}

// Wails authenticates the ZIP against the public key compiled into this binary
// and extracts it. This only binds those authenticated bytes to the app the
// user chose, catching a release packaged with the wrong app or version.
func validateUpdate(ctx context.Context, staged, version string, run commandRunner) error {
	if filepath.Base(staged) != "Innerly.app" {
		return errors.New("the update must contain Innerly.app")
	}
	plist := filepath.Join(staged, "Contents", "Info.plist")
	for field, want := range map[string]string{"CFBundleIdentifier": "co.innerly", "CFBundleShortVersionString": version} {
		value, err := run(ctx, "/usr/libexec/PlistBuddy", "-c", "Print :"+field, plist)
		if err != nil || strings.TrimSpace(string(value)) != want {
			return fmt.Errorf("update %s does not match %s", field, want)
		}
	}
	return nil
}

func (u *UpdateService) discardStaged() {
	// Remove only Wails' staging directory beside this installation, never an
	// arbitrary path returned by a provider or anything in the journal.
	parent := filepath.Dir(u.target)
	rel, err := filepath.Rel(parent, u.engine.DownloadedPath())
	if err == nil {
		first := strings.Split(rel, string(os.PathSeparator))[0]
		if strings.HasPrefix(first, "wails-update-") {
			_ = os.RemoveAll(filepath.Join(parent, first))
		}
	}
}

// Every Innerly process holds this lock shared while it runs, so installing an
// update — which needs it exclusively — cannot replace the bundle while another
// window is using the journal. Advisory only: if the lock cannot be opened,
// updating proceeds rather than becoming impossible.
type instanceLock struct{ file *os.File }

func openInstanceLock() *instanceLock {
	cache, err := os.UserCacheDir()
	if err != nil {
		return nil
	}
	dir := filepath.Join(cache, "Innerly")
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil
	}
	file, err := os.OpenFile(filepath.Join(dir, "instances.lock"), os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil
	}
	if syscall.Flock(int(file.Fd()), syscall.LOCK_SH|syscall.LOCK_NB) != nil {
		file.Close() // another process is mid-update; this one simply is not counted
		return nil
	}
	return &instanceLock{file: file}
}

func (l *instanceLock) acquireForUpdate() error {
	if l == nil {
		return nil
	}
	if syscall.Flock(int(l.file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB) != nil {
		return errors.New("Close all other Innerly windows before installing the update.")
	}
	return nil
}

// Back to sharing, so a failed restart leaves this instance usable.
func (l *instanceLock) release() {
	if l != nil {
		_ = syscall.Flock(int(l.file.Fd()), syscall.LOCK_SH)
	}
}

func (l *instanceLock) Close() {
	if l != nil {
		l.file.Close()
	}
}
