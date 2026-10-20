package main

import (
	"embed"
	"log"
	"net/http"
	"runtime"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/updater"
	"github.com/wailsapp/wails/v3/pkg/updater/providers/github"
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

// Wails handles release discovery and semantic version comparison. Installation
// stays off until signed update packaging and restart safety are in place.
type UpdateService struct{ app *application.App }

func (u *UpdateService) Check() (string, error) {
	if u.app.Updater.CurrentVersion() == "development" {
		return "Development build: use the desktop build script to check a versioned build.", nil
	}
	release, err := u.app.Updater.Check(u.app.Context())
	if err != nil {
		return "", err
	}
	if release == nil {
		return "You're up to date.", nil
	}
	return "Version " + release.Version + " is available. In-app installation is not enabled yet.", nil
}

func updateAsset(req updater.CheckRequest, assets []github.ReleaseAsset) int {
	if req.Platform != "darwin" {
		return -1
	}
	for i, asset := range assets {
		if strings.HasPrefix(asset.Name, "Innerly-") && strings.HasSuffix(asset.Name, "-mac-universal.zip") {
			return i
		}
	}
	return -1
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
	provider, err := github.New(github.Config{Repository: "ethanbond64/innerly-once", AssetMatcher: updateAsset})
	if err != nil {
		log.Print(err)
		return
	}
	if err := app.Updater.Init(updater.Config{CurrentVersion: store.Version(), Providers: []updater.Provider{provider}}); err != nil {
		log.Print(err)
		return
	}
	app.RegisterService(application.NewService(store))
	app.RegisterService(application.NewService(&UpdateService{app: app}))
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
