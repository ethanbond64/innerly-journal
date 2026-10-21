#!/usr/bin/env bash
# Builds, signs, notarizes, staples, verifies and packages a macOS release.
# Deliberately runs outside desktop.sh's isolated HOME to retain Keychain access.
set -euo pipefail

usage() {
  printf '%s\n' \
    'Usage: scripts/release-macos.sh --identity "Developer ID Application: Name (TEAMID)"' \
    '       (--keychain-profile PROFILE | --api-key PATH --key-id ID --issuer ID)' \
    '       --update-key PATH --update-public-key PATH' \
    '       [--keychain PATH] [--arch universal|arm64|amd64]' \
    '   or: scripts/release-macos.sh --ci   (every credential from environment secrets)' \
    '' \
    'Writes release/: versioned ZIP, DMG, SHA-256 checksums and manifest.json, whose' \
    'ZIP payload is signed with the persistent Wails updater keypair. API' \
    'authentication expects an App Store Connect team API private key (.p8).'
}
fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }
absolute() { printf '%s/%s\n' "$(cd "$(dirname "$1")" && pwd)" "$(basename "$1")"; }

identity='' profile='' api_key='' key_id='' issuer='' keychain='' arch=universal
update_key='' update_public_key='' ci=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --ci) ci=true; shift ;;
    --identity|--keychain-profile|--api-key|--key-id|--issuer|--keychain|--arch|--update-key|--update-public-key)
      [[ $# -ge 2 && -n "$2" && "$2" != --* ]] || fail "Missing value for $1"
      case "$1" in
        --identity) identity="$2" ;;
        --keychain-profile) profile="$2" ;;
        --api-key) api_key="$2" ;;
        --key-id) key_id="$2" ;;
        --issuer) issuer="$2" ;;
        --keychain) keychain="$2" ;;
        --arch) arch="$2" ;;
        --update-key) update_key="$2" ;;
        --update-public-key) update_public_key="$2" ;;
      esac
      shift 2 ;;
    *) usage >&2; fail "Unknown argument: $1" ;;
  esac
done
case "$arch" in universal|arm64|amd64) ;; *) fail 'Unsupported architecture' ;; esac
[[ "$(uname -s)" == Darwin ]] || fail 'This script requires macOS'
for cmd in codesign xcrun ditto plutil shasum spctl hdiutil security; do
  command -v "$cmd" >/dev/null || fail "Missing command: $cmd"
done
xcrun --find notarytool >/dev/null
xcrun --find stapler >/dev/null
cd "$(dirname "$0")/.."
ROOT="$PWD"
APP="$ROOT/build/bin/Innerly.app"
wails="$ROOT/.work/gopath/bin/wails3"
wails_version="$(awk '$1 == "github.com/wailsapp/wails/v3" {print $2; exit}' go.mod)"
# wails3 prints its version on stderr, so capture both streams.
[[ -x "$wails" && "$("$wails" version 2>&1)" == "$wails_version" ]] || fail 'Run ./scripts/desktop.sh setup for the pinned Wails CLI'

# Everything private lives in one 0700 directory, removed on any exit. In --ci
# mode the temporary keychain is destroyed and the search list restored there too.
umask 077
staging=$(mktemp -d)
created_keychain=''
original_keychains=()
cleanup() {
  if [[ -n "$created_keychain" ]]; then
    [[ ${#original_keychains[@]} -eq 0 ]] ||
      security list-keychains -d user -s "${original_keychains[@]}" 2>/dev/null || true
    security delete-keychain "$created_keychain" 2>/dev/null || true
  fi
  rm -rf "$staging"
}
trap cleanup EXIT

if [[ "$ci" == true ]]; then
  for secret in MACOS_SIGNING_IDENTITY MACOS_SIGNING_P12_BASE64 MACOS_SIGNING_P12_PASSWORD \
    APPLE_NOTARY_KEY_P8 APPLE_NOTARY_KEY_ID APPLE_NOTARY_ISSUER_ID \
    INNERLY_UPDATE_PRIVATE_KEY INNERLY_UPDATE_PUBLIC_KEY; do
    [[ -n "${!secret:-}" ]] || fail "Missing secret: $secret"
  done
  while IFS='"' read -r _ path _; do
    [[ -z "$path" ]] || original_keychains+=("$path")
  done < <(security list-keychains -d user)
  keychain="$staging/signing.keychain-db"
  password=$(openssl rand -hex 32)
  printf '::add-mask::%s\n' "$password"
  security create-keychain -p "$password" "$keychain"
  created_keychain="$keychain"
  security set-keychain-settings -lut 21600 "$keychain"
  security unlock-keychain -p "$password" "$keychain"
  printf '%s' "$MACOS_SIGNING_P12_BASE64" | /usr/bin/base64 --decode > "$staging/signing.p12"
  security import "$staging/signing.p12" -k "$keychain" -P "$MACOS_SIGNING_P12_PASSWORD" \
    -T /usr/bin/codesign -T /usr/bin/security
  rm -f "$staging/signing.p12"
  # Install Apple's Developer ID intermediate chain (old and G2 issuers).
  for name in DeveloperIDCA DeveloperIDG2CA; do
    curl --fail --silent --show-error --location --proto '=https' \
      "https://www.apple.com/certificateauthority/$name.cer" -o "$staging/$name.cer"
    security import "$staging/$name.cer" -k "$keychain"
  done
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$password" "$keychain" >/dev/null
  security list-keychains -d user -s "$keychain" "${original_keychains[@]}"
  identity="$MACOS_SIGNING_IDENTITY"
  printf '%s\n' "$APPLE_NOTARY_KEY_P8" > "$staging/notary.p8"
  api_key="$staging/notary.p8" key_id="$APPLE_NOTARY_KEY_ID" issuer="$APPLE_NOTARY_ISSUER_ID"
  printf '%s\n' "$INNERLY_UPDATE_PRIVATE_KEY" > "$staging/update.key"
  printf '%s\n' "$INNERLY_UPDATE_PUBLIC_KEY" > "$staging/update.key.pub"
  update_key="$staging/update.key" update_public_key="$staging/update.key.pub"
fi

[[ -n "$identity" ]] || fail '--identity is required'
[[ -f "$update_key" && -f "$update_public_key" ]] || fail 'Supply --update-key and --update-public-key files generated by wails3 updater genkey'
update_key="$(absolute "$update_key")"
update_public_key="$(absolute "$update_public_key")"
if [[ -n "$profile" ]]; then
  [[ -z "$api_key$key_id$issuer" ]] || fail 'Choose a profile OR API key authentication'
  notary_args=(--keychain-profile "$profile")
else
  [[ -n "$api_key" && -n "$key_id" && -n "$issuer" ]] || fail 'Supply a profile or all three API key arguments'
  [[ -f "$api_key" ]] || fail "API key not found: $api_key"
  notary_args=(--key "$(absolute "$api_key")" --key-id "$key_id" --issuer "$issuer")
fi
sign_args=(--sign "$identity")
if [[ -n "$keychain" ]]; then
  [[ -f "$keychain" ]] || fail "Keychain not found: $keychain"
  keychain="$(absolute "$keychain")"
  sign_args+=(--keychain "$keychain")
  [[ -z "$profile" ]] || notary_args+=(--keychain "$keychain")
fi

# Validate the persistent keypair before building or contacting Apple. The same
# public key is pinned in the binary; the release feed can never replace it.
printf 'Innerly updater key check' > "$staging/key-check-mac-universal.zip"
"$wails" updater manifest -version 0.0.0 -key "$update_key" \
  -output "$staging/key-check.json" "$staging/key-check-mac-universal.zip"
"$wails" updater verify -manifest "$staging/key-check.json" -publickey "$update_public_key"

INNERLY_UPDATE_PUBLIC_KEY_B64="$(base64 < "$update_public_key" | tr -d '\n')" \
  ./scripts/desktop.sh build "ARCH=$arch"
# Name artifacts after what was actually stamped into the bundle.
version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist")
bundle_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Contents/Info.plist")
[[ "$bundle_id" == co.innerly ]] || fail "Unexpected bundle ID: $bundle_id"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "Unexpected version: $version"
mkdir -p release
base="Innerly-$version-mac-$arch"
report="$ROOT/release/$base-notary.json"
dmg_report="$ROOT/release/$base-dmg-notary.json"
# Never leave earlier outputs looking like the result of a failed run.
rm -f "$ROOT/release/$base".{zip,zip.sha256,dmg,dmg.sha256} \
  "$ROOT/release/manifest.json" "$report" "$report.log.json" "$dmg_report" "$dmg_report.log.json"

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

notarize() {
  local payload="$1" report="$2" submission_id
  printf '\nSubmitting %s to Apple; this can take several minutes…\n' "$payload"
  if ! xcrun notarytool submit "$payload" "${notary_args[@]}" \
      --wait --output-format json > "$report" || \
      [[ "$(plutil -extract status raw -o - "$report")" != Accepted ]]; then
    submission_id=$(plutil -extract id raw -o - "$report" 2>/dev/null || true)
    if [[ -n "$submission_id" ]]; then
      xcrun notarytool log "$submission_id" "${notary_args[@]}" "$report.log.json" || true
    fi
    fail "Notarization failed; see $report and its log"
  fi
}
ditto -c -k --sequesterRsrc --keepParent "$APP" "$staging/submission.zip"
notarize "$staging/submission.zip" "$report"
xcrun stapler staple "$APP"
xcrun stapler validate "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"
spctl --assess --type execute --verbose=4 "$APP"

# Both distribution formats contain this same stapled app. The updater gets
# only the ZIP: the public DMG is never an automatic update payload.
ditto -c -k --sequesterRsrc --keepParent "$APP" "$staging/$base.zip"
ditto "$APP" "$staging/Innerly.app"
"$wails" tool package -format dmg -name Innerly -out "$staging"
mv "$staging/Innerly.dmg" "$staging/$base.dmg"
codesign --force --timestamp "${sign_args[@]}" "$staging/$base.dmg"
codesign --verify --strict --verbose=2 "$staging/$base.dmg"
notarize "$staging/$base.dmg" "$dmg_report"
xcrun stapler staple "$staging/$base.dmg"
xcrun stapler validate "$staging/$base.dmg"
codesign --verify --strict --verbose=2 "$staging/$base.dmg"
spctl --assess --type open --context context:primary-signature --verbose=4 "$staging/$base.dmg"

./scripts/release-version.sh --notes "$staging/notes.md"
"$wails" updater manifest -version "$version" -channel stable -name "Innerly $version" \
  -notes-file "$staging/notes.md" -key "$update_key" -output "$staging/manifest.json" \
  -url-prefix "https://github.com/ethanbond64/innerly-once/releases/download/v$version" \
  "$staging/$base.zip"
"$wails" updater verify -manifest "$staging/manifest.json" -publickey "$update_public_key"
(cd "$staging" && shasum -a 256 "$base.zip" > "$base.zip.sha256" && \
  shasum -a 256 "$base.dmg" > "$base.dmg.sha256")
# Expose artifacts only after every signing/notarization/verification gate passes.
mv "$staging/$base".{zip,zip.sha256,dmg,dmg.sha256} "$staging/manifest.json" "$ROOT/release/"
printf '\nRelease ready: %s/release/%s.{dmg,zip} and manifest.json\n' "$ROOT" "$base"
