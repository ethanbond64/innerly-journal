# Innerly

A local multimedia journal built with Go, Wails, and React. Includes encrypted notes, autosave, images, HTTPS link previews, search, and day tags.

## Build and run on macOS

Install **Go** (any recent version — the toolchain `go.mod` pins is downloaded automatically), **Node.js 22 with npm**, and the **Xcode Command Line Tools** (`xcode-select --install`), then run `./scripts/desktop.sh setup` once to install the pinned `wails3` CLI, fetch npm dependencies and generate the Go bindings the frontend imports. `./scripts/desktop.sh dev` builds a native development bundle and launches it against Vite with live reload; create a local account on first launch. Everything the development build touches — its journal, the Go and npm caches, and a private `HOME` — stays under `.work/`, so a run never reaches your real home directory and deleting that one directory resets the environment back to a fresh `setup`.

## About & Updates

Open **Updates** from the account menu or **About & Updates** from the macOS app menu. The page works before login and shows the installed version plus `master/CHANGELOG.md` as plain text, so it may list unreleased changes.

