package journal

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"os"
	"os/exec"
	"sync"
	"time"
)

type App struct {
	mu     sync.Mutex
	db     *sql.DB
	config Config
	// Each desktop process owns its session and keys; independent windows share only storage.
	userID  int64
	keys    map[int64]cachedKey
	jobs    map[int64]*importJob
	workers sync.WaitGroup
	cancel  context.CancelFunc
	ctx     context.Context
	client  *http.Client
	now     func() time.Time
	closed  bool
}
type AppError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *AppError) Error() string { return e.Message }

type Result struct {
	Data        any       `json:"data"`
	Error       *AppError `json:"error,omitempty"`
	Success     bool      `json:"success"`
	Reencrypted int       `json:"reencrypted"`
	Started     bool      `json:"started"`
}

func failure(code, message string) error { return &AppError{code, message} }
func outcome(data any, err error) Result {
	if err == nil {
		return Result{Data: data, Success: true}
	}
	var known *AppError
	if !errors.As(err, &known) {
		known = &AppError{"internal", "The operation could not be completed."}
	}
	return Result{Error: known}
}
func NewApp(config Config) (*App, error) {
	config, err := loadSettings(config)
	if err != nil {
		return nil, err
	}
	db, err := openDatabase(config)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	a := &App{db: db, config: config, keys: map[int64]cachedKey{}, jobs: map[int64]*importJob{}, ctx: ctx, cancel: cancel, client: buildHTTPClient(), now: time.Now}
	if err = a.applyColumnMigrations(); err != nil {
		db.Close()
		cancel()
		return nil, err
	}
	return a, nil
}
func CloseApp(a *App) {
	a.mu.Lock()
	if a.closed {
		a.mu.Unlock()
		return
	}
	a.closed = true
	a.cancel()
	a.userID = 0
	clear(a.keys)
	a.mu.Unlock()
	a.workers.Wait()
	a.client.CloseIdleConnections()
	a.db.Close()
}
func (a *App) run(fn func(User) (any, error)) Result {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.closed {
		return outcome(nil, failure("closed", "Journal is closed."))
	}
	u, err := a.user(a.userID)
	if err != nil {
		return outcome(nil, failure("unauthorized", "Please log in."))
	}
	data, err := fn(u)
	return outcome(data, err)
}

// OpenWindow starts a separate session without passing credentials or derived keys.
func (a *App) OpenWindow() Result {
	return a.run(func(User) (any, error) {
		executable, err := os.Executable()
		if err != nil {
			return nil, err
		}
		cmd := exec.Command(executable)
		cmd.Env = append(os.Environ(), "INNERLY_DATA_DIR="+a.config.DataDir)
		if err = cmd.Start(); err != nil {
			return nil, err
		}
		go func() { _ = cmd.Wait() }()
		return nil, nil
	})
}

// Set from the highest CHANGELOG.md version by scripts/build-macos.sh.
var version = "development"

func (a *App) Version() string     { return version }
func (a *App) CurrentUser() Result { return a.run(func(u User) (any, error) { return u, nil }) }
func (a *App) Logout() Result {
	a.mu.Lock()
	defer a.mu.Unlock()
	delete(a.keys, a.userID)
	a.userID = 0
	return outcome(nil, nil)
}
