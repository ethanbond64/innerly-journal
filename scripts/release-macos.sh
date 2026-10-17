#!/usr/bin/env bash
# Requires an installed Developer ID Application certificate AND its private key.
# Deliberately runs outside desktop.sh's isolated HOME to retain Keychain access.
set -euo pipefail

usage() {
  printf '%s\n' \
    'Usage: scripts/release-macos.sh --identity "Developer ID Application: Name (TEAMID)"' \
    '       (--keychain-profile PROFILE | --api-key PATH --key-id ID --issuer ID)' \
    '       [--keychain PATH] [--arch universal|arm64|amd64]' \
    '' \
    'Builds, signs, notarizes, staples, verifies, and packages Innerly.' \
    'Default architecture: universal. Output: release/Innerly-VERSION-mac-ARCH.zip' \
    '--keychain optionally selects a signing keychain and the notary profile keychain.' \
    'API authentication expects an App Store Connect team API private key (.p8).'
}
fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }
identity='' profile='' api_key='' key_id='' issuer='' keychain='' arch=universal
while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --identity|--keychain-profile|--api-key|--key-id|--issuer|--keychain|--arch)
      [[ $# -ge 2 && -n "$2" && "$2" != --* ]] || fail "Missing value for $1"
      case "$1" in
        --identity) identity="$2" ;;
        --keychain-profile) profile="$2" ;;
        --api-key) api_key="$2" ;;
        --key-id) key_id="$2" ;;
        --issuer) issuer="$2" ;;
        --keychain) keychain="$2" ;;
        --arch) arch="$2" ;;
      esac
      shift 2 ;;
    *) usage >&2; fail "Unknown argument: $1" ;;
  esac
done
[[ -n "$identity" ]] || fail '--identity is required'
case "$arch" in universal|arm64|amd64) ;; *) fail 'Unsupported architecture' ;; esac
if [[ -n "$profile" ]]; then
  [[ -z "$api_key$key_id$issuer" ]] || fail 'Choose a profile OR API key authentication'
  notary_args=(--keychain-profile "$profile")
  [[ -z "$keychain" ]] || notary_args+=(--keychain "$keychain")
else
  [[ -n "$api_key" && -n "$key_id" && -n "$issuer" ]] || fail 'Supply a profile or all three API key arguments'
  [[ -f "$api_key" ]] || fail "API key not found: $api_key"
  # Resolve before changing directories; preserve spaces in file paths.
  api_key="$(cd "$(dirname "$api_key")" && pwd)/$(basename "$api_key")"
  notary_args=(--key "$api_key" --key-id "$key_id" --issuer "$issuer")
fi
sign_args=(--sign "$identity")
if [[ -n "$keychain" ]]; then
  [[ -f "$keychain" ]] || fail "Keychain not found: $keychain"
  keychain="$(cd "$(dirname "$keychain")" && pwd)/$(basename "$keychain")"
  sign_args+=(--keychain "$keychain")
  [[ -z "$profile" ]] || notary_args=(--keychain-profile "$profile" --keychain "$keychain")
fi
[[ "$(uname -s)" == Darwin ]] || fail 'This script requires macOS'
for cmd in codesign xcrun ditto plutil shasum; do
  command -v "$cmd" >/dev/null || fail "Missing command: $cmd"
done
xcrun --find notarytool >/dev/null
xcrun --find stapler >/dev/null
cd "$(dirname "$0")/.."
ROOT="$PWD"
APP="$ROOT/build/bin/Innerly.app"
mkdir -p release

./scripts/desktop.sh build -platform "darwin/$arch"
version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist")
bundle_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Contents/Info.plist")
[[ "$bundle_id" == co.innerly ]] || fail "Unexpected bundle ID: $bundle_id"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "Unexpected version: $version"
artifact="$ROOT/release/Innerly-$version-mac-$arch.zip"
report="$ROOT/release/Innerly-$version-mac-$arch-notary.json"
# Never leave an earlier release ZIP looking like the output of a failed run.
rm -f "$artifact" "$artifact.sha256" "$report"
staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT

# Wails currently bundles a single executable. Sign any future nested Mach-O
# files first; frameworks/helper app bundles would need explicit inside-out rules.
while IFS= read -r -d '' binary; do
  [[ "$binary" == "$APP/Contents/MacOS/Innerly" ]] && continue
  if /usr/bin/file -b "$binary" | grep -q 'Mach-O'; then
    codesign --force --options runtime --timestamp "${sign_args[@]}" "$binary"
  fi
done < <(find "$APP/Contents" -type f -print0)
codesign --force --options runtime --timestamp "${sign_args[@]}" "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"

ditto -c -k --sequesterRsrc --keepParent "$APP" "$staging/submission.zip"
printf '\nSubmitting to Apple; this can take several minutes…\n'
if ! xcrun notarytool submit "$staging/submission.zip" "${notary_args[@]}" \
    --wait --output-format json > "$report"; then
  printf 'Notarization failed. Submission details: %s\n' "$report" >&2
  submission_id=$(plutil -extract id raw -o - "$report" 2>/dev/null || true)
  if [[ -n "$submission_id" ]]; then
    xcrun notarytool log "$submission_id" "${notary_args[@]}" \
      "$report.log.json" || true
  fi
  exit 1
fi
status=$(plutil -extract status raw -o - "$report")
if [[ "$status" != Accepted ]]; then
  submission_id=$(plutil -extract id raw -o - "$report")
  xcrun notarytool log "$submission_id" "${notary_args[@]}" "$report.log.json" || true
  fail "Apple returned $status; see $report and its log"
fi
xcrun stapler staple "$APP"
xcrun stapler validate "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"
spctl --assess --type execute --verbose=4 "$APP"
# Package only after stapling; the submitted ZIP lacks the offline ticket.
ditto -c -k --sequesterRsrc --keepParent "$APP" "$artifact"
(cd "$ROOT/release" && shasum -a 256 "$(basename "$artifact")" > "$(basename "$artifact").sha256")
printf '\nRelease ready: %s\nChecksum: %s.sha256\n' "$artifact" "$artifact"
