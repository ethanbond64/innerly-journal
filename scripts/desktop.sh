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
export GOTOOLCHAIN=go1.24.13
export INNERLY_DATA_DIR="${INNERLY_DATA_DIR:-$ROOT/.work/dev-journal}"
mkdir -p "$TMPDIR" "$HOME" "$GOPATH" "$GOCACHE" "$XDG_CACHE_HOME" "$npm_config_cache"
export PATH="$GOPATH/bin:$PATH"
case "${1:-test}" in
  setup)
    go install github.com/wailsapp/wails/v2/cmd/wails@v2.11.0
    (cd frontend && npm ci)
    ;;
  test)
    go test -timeout 2m ./internal/journal/...
    (cd frontend && npm test)
    PYTHONPATH="$ROOT/backend" "$ROOT/backend/.venv/bin/python" -m unittest discover -s backend/tests
    ;;
  race)
    go test -race -timeout 10m ./internal/journal/...
    ;;
  build)
    wails build -nocolour
    ;;
  dev)
    wails dev
    ;;
  doctor)
    wails doctor
    ;;
  *) printf 'Usage: %s {setup|test|race|build|dev|doctor}\n' "$0" >&2; exit 2 ;;
esac
