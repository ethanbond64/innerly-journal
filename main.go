package main

import (
	"context"
	"embed"
	"log"

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
	err = wails.Run(&options.App{
		Title: "Innerly", Width: 1200, Height: 850, MinWidth: 700, MinHeight: 500,
		AssetServer: &assetserver.Options{Assets: assets, Handler: journal.MediaHandler(app)},
		OnShutdown:  func(context.Context) { journal.CloseApp(app) },
		Bind:        []interface{}{app},
	})
	if err != nil {
		log.Print(err)
	}
}
