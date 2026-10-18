package main

import (
	"context"
	"embed"
	"log"
	"runtime"

	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"innerly/internal/journal"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app, err := journal.NewApp(journal.Config{})
	if err != nil {
		log.Fatal(err)
	}
	defer journal.CloseApp(app)
	var appContext context.Context
	var appMenu *menu.Menu
	if runtime.GOOS == "darwin" {
		appMenu = menu.NewMenu()
		innerlyMenu := appMenu.AddSubmenu("Innerly")
		innerlyMenu.AddText("Refresh", keys.CmdOrCtrl("r"), func(*menu.CallbackData) {
			if appContext != nil {
				// Set the hash without an intermediate SPA navigation, then reload
				// the document even if the user is already on the homepage.
				wailsruntime.WindowExecJS(appContext, "window.history.replaceState(null, '', '#/'); window.location.reload();")
			}
		})
		innerlyMenu.AddSeparator()
		innerlyMenu.AddText("Hide Innerly", keys.CmdOrCtrl("h"), func(*menu.CallbackData) {
			wailsruntime.Hide(appContext)
		})
		innerlyMenu.AddSeparator()
		innerlyMenu.AddText("Quit Innerly", keys.CmdOrCtrl("q"), func(*menu.CallbackData) {
			wailsruntime.Quit(appContext)
		})
		appMenu.Append(menu.EditMenu())
		appMenu.Append(menu.WindowMenu())
	}
	err = wails.Run(&options.App{
		Title: "Innerly", Width: 1200, Height: 850, MinWidth: 700, MinHeight: 500,
		AssetServer: &assetserver.Options{Assets: assets, Handler: journal.MediaHandler(app)},
		Menu:        appMenu,
		OnStartup:   func(ctx context.Context) { appContext = ctx },
		OnShutdown:  func(context.Context) { journal.CloseApp(app) },
		Bind:        []interface{}{app},
	})
	if err != nil {
		log.Print(err)
	}
}
