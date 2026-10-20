package main

import (
	"embed"
	"log"
	"net/http"
	"runtime"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
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
	var store *journal.App
	var closeOnce sync.Once
	closeJournal := func() {
		closeOnce.Do(func() {
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
	var err error
	store, err = journal.NewApp(journal.Config{})
	if err != nil {
		log.Print(err)
		return
	}
	defer closeJournal() // Also covers errors returned before the run loop starts.
	app.RegisterService(application.NewService(store))
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
		innerly.Add("Refresh").SetAccelerator("CmdOrCtrl+r").OnClick(func(*application.Context) {
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
