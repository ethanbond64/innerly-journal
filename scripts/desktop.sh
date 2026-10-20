#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
export GOPATH="$ROOT/.work/gopath"
export GOCACHE="$ROOT/.work/gocache"
export GOTMPDIR="$ROOT/.work/tmp"
export TMPDIR="$ROOT/.work/tmp"
export HOME="$ROOT/.work/home"
export XDG_CACHE_HOME="$ROOT/.work/cache"
export npm_config_cache="$ROOT/.work/npm"
# Keep the local toolchain aligned with go.mod and setup-go in Actions.
GO_VERSION="$(awk '$1 == "go" {print $2; exit}' go.mod)"
export GOTOOLCHAIN="go$GO_VERSION"
export INNERLY_DATA_DIR="${INNERLY_DATA_DIR:-$ROOT/.work/dev-journal}"
mkdir -p "$TMPDIR" "$HOME" "$GOPATH" "$GOCACHE" "$XDG_CACHE_HOME" "$npm_config_cache"
export PATH="$GOPATH/bin:$PATH"
# The Go embed pattern must resolve before bindings/tests on a clean checkout.
mkdir -p frontend/dist
touch frontend/dist/.keep
case "${1:-test}" in
  setup)
    WAILS_VERSION="$(awk '$1 == "github.com/wailsapp/wails/v3" {print $2; exit}' go.mod)"
    go install "github.com/wailsapp/wails/v3/cmd/wails3@$WAILS_VERSION"
    (cd frontend && npm ci)
    wails3 task bindings
    ;;
  test)
    go test -timeout 2m ./...
    (cd frontend && npm test)
    ;;
  test-ui)
    (cd frontend && npm run test:ui)
    ;;
  race)
    go test -race -timeout 10m ./...
    ;;
  build)
    shift
    wails3 task package "$@"
    ;;
  bindings)
    wails3 task bindings
    ;;
  dev)
    wails3 task dev
    ;;
  doctor)
    wails3 doctor
    ;;
  *) printf 'Usage: %s {setup|test|test-ui|race|build|bindings|dev|doctor}\n' "$0" >&2; exit 2 ;;
esac
