#!/usr/bin/env bash
# Used only on an ephemeral macOS Actions runner. Never source this script.
set -euo pipefail
: "${RUNNER_TEMP:?}"
KEYCHAIN="$RUNNER_TEMP/innerly-signing.keychain-db"
P12="$RUNNER_TEMP/innerly-signing.p12"
API_KEY="$RUNNER_TEMP/innerly-notary.p8"
original_keychains() {
  keychains=()
  while IFS='"' read -r _ path _; do
    [[ -z "$path" ]] || keychains+=("$path")
  done < "$RUNNER_TEMP/innerly-original-keychains.txt"
}
case "${1:-}" in
  setup)
    : "${MACOS_SIGNING_P12_BASE64:?Missing signing certificate secret}"
    : "${MACOS_SIGNING_P12_PASSWORD:?Missing certificate password secret}"
    : "${APPLE_NOTARY_KEY_P8:?Missing notarization API key secret}"
    umask 077
    # Save the search list so cleanup doesn't interfere with runner tooling.
    security list-keychains -d user > "$RUNNER_TEMP/innerly-original-keychains.txt"
    printf '%s' "$MACOS_SIGNING_P12_BASE64" | /usr/bin/base64 --decode > "$P12"
    printf '%s\n' "$APPLE_NOTARY_KEY_P8" > "$API_KEY"
    password=$(openssl rand -hex 32)
    printf '::add-mask::%s\n' "$password"
    security create-keychain -p "$password" "$KEYCHAIN"
    security set-keychain-settings -lut 21600 "$KEYCHAIN"
    security unlock-keychain -p "$password" "$KEYCHAIN"
    security import "$P12" -k "$KEYCHAIN" -P "$MACOS_SIGNING_P12_PASSWORD" \
      -T /usr/bin/codesign -T /usr/bin/security
    # Install Apple's Developer ID intermediate chain (old and G2 issuers).
    for name in DeveloperIDCA DeveloperIDG2CA; do
      curl --fail --silent --show-error --location --proto '=https' \
        "https://www.apple.com/certificateauthority/$name.cer" \
        -o "$RUNNER_TEMP/$name.cer"
      security import "$RUNNER_TEMP/$name.cer" -k "$KEYCHAIN"
    done
    security set-key-partition-list -S apple-tool:,apple:,codesign: -s \
      -k "$password" "$KEYCHAIN" >/dev/null
    original_keychains
    security list-keychains -d user -s "$KEYCHAIN" "${keychains[@]}"
    rm -f "$P12"
    ;;
  cleanup)
    if [[ -f "$RUNNER_TEMP/innerly-original-keychains.txt" ]]; then
      original_keychains
      security list-keychains -d user -s "${keychains[@]}" || true
    fi
    security delete-keychain "$KEYCHAIN" 2>/dev/null || true
    rm -f "$P12" "$API_KEY" "$RUNNER_TEMP/DeveloperIDCA.cer" \
      "$RUNNER_TEMP/DeveloperIDG2CA.cer" "$RUNNER_TEMP/innerly-original-keychains.txt"
    ;;
  *) printf 'Usage: %s setup|cleanup\n' "$0" >&2; exit 2 ;;
esac
