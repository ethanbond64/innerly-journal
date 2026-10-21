package main

import (
	"embed"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/updater"
	"innerly/internal/journal"
)

//go:embed all:frontend/dist
var assets embed.FS

// The getter keeps journal initialization after application.New's helper dispatch.
func mediaMiddleware(store func() *journal.App) application.Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Intercept before both the dev proxy and embedded assets. Never allow
			// media errors to become Vite's index.html.
			if strings.HasPrefix(r.URL.Path, "/media/") {
				journal.MediaHandler(store()).ServeHTTP(w, r)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func main() {
	// The Wails helper never opens storage; its PID keeps new app instances
	// waiting until the framework has finished replacement/relaunch.
	if err := handoffUpdateGuard(); err != nil {
		_ = os.WriteFile(os.Getenv("WAILS_UPDATER_HELPER_READY"), []byte("error: "+err.Error()), 0600)
		log.Print(err)
		return
	}
	var store *journal.App
	var updates *UpdateService
	var closeOnce sync.Once
	closeJournal := func() {
		closeOnce.Do(func() {
			if updates != nil {
				updates.shutdown()
			}
			if store != nil {
				journal.CloseApp(store)
			}
		})
	}
	// New dispatches updater helpers before we open storage or create any UI.
	app := application.New(application.Options{
		Name: "Innerly",
		Assets: application.AssetOptions{
			Handler:    application.AssetFileServerFS(assets),
			Middleware: mediaMiddleware(func() *journal.App { return store }),
		},
		Mac:        application.MacOptions{ApplicationShouldTerminateAfterLastWindowClosed: true},
		OnShutdown: closeJournal,
	})
	dir, err := instanceDirectory()
	if err != nil {
		log.Print(err)
		return
	}
	guard, err := openInstanceGuard(dir)
	if err != nil {
		log.Print(err)
		return
	}
	defer guard.Close()
	store, err = journal.NewApp(journal.Config{})
	if err != nil {
		log.Print(err)
		return
	}
	defer closeJournal() // Also covers errors returned before the run loop starts.
	provider := &releaseProvider{client: newReleaseClient()}
	executable, _ := os.Executable()
	target := appBundle(executable)
	if resolved, err := filepath.EvalSymlinks(executable); err != nil || resolved != executable {
		target = "" // keep our target identical to Wails'; no symlink installations
	}
	updates = newUpdateService(app.Context(), app.Updater, provider, guard, target, store.Version())
	if err := app.Updater.Init(updater.Config{
		CurrentVersion: store.Version(), PublicKey: updates.key,
		Providers: []updater.Provider{provider}, Window: updater.WindowNone,
	}); err != nil {
		log.Print(err)
		return
	}
	app.RegisterService(application.NewService(store))
	app.RegisterService(application.NewService(updates))
	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name: "main", Title: "Innerly", URL: "/",
		Width: 1200, Height: 850, MinWidth: 700, MinHeight: 500,
		BackgroundColour: application.NewRGB(255, 255, 255),
		Mac: application.MacWindow{
			TitleBar: application.MacTitleBarHidden,
			// Content extends under the native title bar; the frontend reserves
			// exactly one 28px strip, using v3's --wails-draggable region.
			InvisibleTitleBarHeight: 28,
		},
	})
	if runtime.GOOS == "darwin" {
		menu := app.NewMenu()
		innerly := menu.AddSubmenu("Innerly")
		innerly.Add("About & Updates").OnClick(func(*application.Context) {
			window.ExecJS("window.location.hash = '#/about';")
		})
		innerly.AddSeparator()
		innerly.Add("Refresh").SetAccelerator("CmdOrCtrl+r").OnClick(func(*application.Context) {
			if updates.Status().State == "restarting" {
				return // do not reload away the editor-save barrier during restart
			}
			window.ExecJS("window.history.replaceState(null, '', '#/'); window.location.reload();")
		})
		innerly.AddSeparator()
		innerly.AddRole(application.Hide)
		innerly.AddSeparator()
		innerly.Add("Quit Innerly").SetAccelerator("CmdOrCtrl+q").OnClick(func(*application.Context) { app.Quit() })
		menu.AddRole(application.EditMenu)
		menu.AddRole(application.WindowMenu)
		app.Menu.Set(menu)
	}
	if err := app.Run(); err != nil {
		log.Print(err)
	}
}
