#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ "$(uname -s)" == Darwin ]] || { echo 'macOS builds require macOS and Xcode Command Line Tools.' >&2; exit 1; }
action="${1:-package}"
arch="${2:-universal}"
dev="${3:-false}"
[[ "$arch" != native ]] || arch="$(go env GOARCH)"
case "$arch" in arm64|amd64|universal) ;; *) echo "Unsupported architecture: $arch" >&2; exit 2 ;; esac
case "$action" in bindings|build|package|run) ;; *) echo "Unknown action: $action" >&2; exit 2 ;; esac
# Go's embed pattern must resolve before this package compiles.
mkdir -p frontend/dist
touch frontend/dist/.keep
bindings() { wails3 generate bindings -names -d frontend/bindings; }
if [[ "$action" == bindings ]]; then
  bindings
  exit 0
fi
out=build/bin
version="$(./scripts/release-version.sh --version)"
mkdir -p "$out"

if [[ "$action" != run ]]; then
  bindings
  (cd frontend && npm run build)
  # Keep the owner's icon, not the starter's branding. Only macOS assets ship.
  [[ -f "$out/icons.icns" && "$out/icons.icns" -nt build/appicon.png ]] ||
    wails3 generate icons -input build/appicon.png -macfilename "$out/icons.icns" -windowsfilename "$out/icon.ico"
  export CGO_ENABLED=1 GOOS=darwin
  export CGO_CFLAGS="${CGO_CFLAGS:-} -mmacosx-version-min=12.0"
  export CGO_LDFLAGS="${CGO_LDFLAGS:-} -mmacosx-version-min=12.0"
  export MACOSX_DEPLOYMENT_TARGET=12.0
  ldflags="-X innerly/internal/journal.version=$version"
  flags=(-trimpath -buildvcs=false)
  if [[ "$dev" == true ]]; then
    flags+=(-gcflags=all=-l)
  else
    flags+=(-tags production)
    ldflags="-w -s $ldflags"
    # Release builds pin the public PEM, base64-encoded for safe linker quoting.
    if [[ -n "${INNERLY_UPDATE_PUBLIC_KEY_B64:-}" ]]; then
      [[ "$INNERLY_UPDATE_PUBLIC_KEY_B64" =~ ^[A-Za-z0-9+/]+=*$ ]] || { echo 'Invalid updater public-key encoding' >&2; exit 1; }
      ldflags+=" -X main.updatePublicKey=$INNERLY_UPDATE_PUBLIC_KEY_B64"
    fi
  fi
  flags+=("-ldflags=$ldflags")
  wails3 tool prepare-macos-output --dir "$out"
  if [[ "$arch" == universal ]]; then
    for target in arm64 amd64; do
      GOARCH="$target" go build "${flags[@]}" -o "$out/Innerly-$target" .
    done
    lipo -create -output "$out/Innerly" "$out/Innerly-arm64" "$out/Innerly-amd64"
    rm "$out/Innerly-arm64" "$out/Innerly-amd64"
    lipo "$out/Innerly" -verify_arch arm64 x86_64
  else
    # Go refuses to overwrite a previous fat Mach-O as a single-arch output.
    rm -f "$out/Innerly"
    GOARCH="$arch" go build "${flags[@]}" -o "$out/Innerly" .
  fi
fi
[[ "$action" != build ]] || exit 0
bundle="$out/Innerly.app"
plist=build/darwin/Info.plist
if [[ "$dev" == true ]]; then
  bundle="$out/Innerly.dev.app"
  plist=build/darwin/Info.dev.plist
fi
rm -rf -- "$bundle"
mkdir -p "$bundle/Contents/"{MacOS,Resources}
cp "$out/Innerly" "$bundle/Contents/MacOS/Innerly"
cp "$out/icons.icns" "$bundle/Contents/Resources/icons.icns"
cp "$plist" "$bundle/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $version" "$bundle/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $version" "$bundle/Contents/Info.plist"
xattr -cr "$bundle"
# This shell currently contains one executable and no frameworks or helper bundles.
codesign --force --sign - "$bundle"
codesign --verify --strict "$bundle"
if [[ "$action" == run ]]; then
  exec "$bundle/Contents/MacOS/Innerly"
fi
