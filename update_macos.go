package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"golang.org/x/mod/semver"
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

// Wails authenticates/extracts the ZIP. These macOS-only checks bind those
// authenticated bytes to the selected version, app identity and signing team.
// Manifest metadata by itself is not signed.
func validateUpdate(ctx context.Context, staged, version, installed string, run commandRunner) error {
	if filepath.Base(staged) != "Innerly.app" {
		return errors.New("the update must contain Innerly.app")
	}
	plist := filepath.Join(staged, "Contents", "Info.plist")
	for field, want := range map[string]string{"CFBundleIdentifier": "co.innerly", "CFBundleShortVersionString": version, "CFBundleVersion": version} {
		value, err := run(ctx, "/usr/libexec/PlistBuddy", "-c", "Print :"+field, plist)
		if err != nil || strings.TrimSpace(string(value)) != want {
			return fmt.Errorf("update %s does not match %s", field, want)
		}
	}
	minimum, err := run(ctx, "/usr/libexec/PlistBuddy", "-c", "Print :LSMinimumSystemVersion", plist)
	if err != nil {
		return err
	}
	host, err := run(ctx, "/usr/bin/sw_vers", "-productVersion")
	if err != nil {
		return err
	}
	minVersion, hostVersion := "v"+strings.TrimSpace(string(minimum)), "v"+strings.TrimSpace(string(host))
	if !semver.IsValid(minVersion) || !semver.IsValid(hostVersion) || semver.Compare(minVersion, hostVersion) > 0 {
		return errors.New("this update requires a newer version of macOS")
	}
	if _, err := run(ctx, "/usr/bin/lipo", filepath.Join(staged, "Contents", "MacOS", "Innerly"), "-verify_arch", "arm64", "x86_64"); err != nil {
		return err
	}
	var team string
	for _, bundle := range []string{installed, staged} {
		if _, err := run(ctx, "/usr/bin/codesign", "--verify", "--deep", "--strict", bundle); err != nil {
			return err
		}
		info, err := run(ctx, "/usr/bin/codesign", "--display", "--verbose=4", bundle)
		if err != nil {
			return err
		}
		var signedBy string
		for _, line := range strings.Split(string(info), "\n") {
			if strings.HasPrefix(line, "TeamIdentifier=") {
				signedBy = strings.TrimPrefix(line, "TeamIdentifier=")
			}
		}
		if signedBy == "" || signedBy == "not set" || (team != "" && signedBy != team) {
			return errors.New("the update and installed app must have the same Developer ID signing team")
		}
		team = signedBy
	}
	_, err = run(ctx, "/usr/sbin/spctl", "--assess", "--type", "execute", staged)
	return err
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

// Every ordinary process holds a shared lock before opening any journal.
// Installation needs it exclusively. A separate upgrade lock makes conversion
// safe if two instances ask to install simultaneously. The helper PID marker
// covers the gap after the parent exits and before Wails finishes its swap.
type instanceGuard struct {
	instances *os.File
	upgrade   *os.File
	gate      string
}

func instanceDirectory() (string, error) {
	dir, err := os.UserCacheDir()
	return filepath.Join(dir, "Innerly"), err
}

func openInstanceGuard(dir string) (*instanceGuard, error) {
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	g := &instanceGuard{gate: filepath.Join(dir, "updating.pid")}
	var err error
	g.instances, err = os.OpenFile(filepath.Join(dir, "instances.lock"), os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	g.upgrade, err = os.OpenFile(filepath.Join(dir, "upgrade.lock"), os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		g.Close()
		return nil, err
	}
	deadline := time.Now().Add(time.Minute)
	for {
		err = syscall.Flock(int(g.instances.Fd()), syscall.LOCK_SH|syscall.LOCK_NB)
		if err == nil {
			data, readErr := os.ReadFile(g.gate)
			pid, parseErr := strconv.Atoi(strings.TrimSpace(string(data)))
			if os.IsNotExist(readErr) || (readErr == nil && parseErr == nil && pid > 0 && errors.Is(syscall.Kill(pid, 0), syscall.ESRCH)) {
				_ = os.Remove(g.gate) // stale after a finished/failed helper
				return g, nil
			}
		}
		if time.Now().After(deadline) {
			g.Close()
			return nil, errors.New("an Innerly update is still running; try launching again after it finishes")
		}
		time.Sleep(100 * time.Millisecond) // no database is open while waiting
	}
}

func (g *instanceGuard) beginUpdate() error {
	if g == nil || syscall.Flock(int(g.upgrade.Fd()), syscall.LOCK_EX|syscall.LOCK_NB) != nil {
		return errors.New("another Innerly instance is preparing an update")
	}
	if err := syscall.Flock(int(g.instances.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		_ = syscall.Flock(int(g.instances.Fd()), syscall.LOCK_SH)
		_ = syscall.Flock(int(g.upgrade.Fd()), syscall.LOCK_UN)
		return errors.New("close all other Innerly windows before installing the update")
	}
	if err := writeUpdatePID(g.gate); err != nil {
		g.abortUpdate()
		return err
	}
	if err := os.Setenv("INNERLY_UPDATE_HANDOFF", "1"); err != nil {
		g.abortUpdate()
		return err
	}
	return nil
}

func (g *instanceGuard) abortUpdate() {
	_ = os.Unsetenv("INNERLY_UPDATE_HANDOFF")
	_ = os.Remove(g.gate)
	_ = syscall.Flock(int(g.instances.Fd()), syscall.LOCK_SH)
	_ = syscall.Flock(int(g.upgrade.Fd()), syscall.LOCK_UN)
}

func (g *instanceGuard) Close() {
	if g != nil {
		if g.instances != nil {
			g.instances.Close()
		}
		if g.upgrade != nil {
			g.upgrade.Close()
		}
	}
}

func handoffUpdateGuard() error {
	if os.Getenv("WAILS_UPDATER_HELPER") != "1" || os.Getenv("INNERLY_UPDATE_HANDOFF") != "1" {
		return nil
	}
	dir, err := instanceDirectory()
	if err != nil {
		return err
	}
	return writeUpdatePID(filepath.Join(dir, "updating.pid"))
}

func writeUpdatePID(path string) error {
	file, err := os.CreateTemp(filepath.Dir(path), ".updating-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	_, err = fmt.Fprintln(file, os.Getpid())
	closeErr := file.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	return os.Rename(file.Name(), path) // readers never see a truncated PID
}
