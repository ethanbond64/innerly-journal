package main

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
)

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

// Probe that this is the only instance, then go back to sharing: Wails swaps
// the bundle after this process has exited, so holding the lock until then
// would protect nothing.
func (l *instanceLock) probeExclusive() error {
	if l == nil {
		return nil
	}
	if syscall.Flock(int(l.file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB) != nil {
		return errors.New("Close all other Innerly windows before installing an update.")
	}
	_ = syscall.Flock(int(l.file.Fd()), syscall.LOCK_SH)
	return nil
}

func (l *instanceLock) Close() {
	if l != nil {
		l.file.Close()
	}
}
