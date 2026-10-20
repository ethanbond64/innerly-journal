#!/usr/bin/env bash
# Read the latest changelog entry and skip versions already published on GitHub.
set -euo pipefail
cd "$(dirname "$0")/.."
notes="${1:-${RUNNER_TEMP:-/tmp}/innerly-release-notes.md}"
version=$(awk '/^## v/ { sub(/^## v/, ""); print $1; exit }' CHANGELOG.md)
[[ "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || {
  echo 'Expected a ## vX.Y.Z heading in CHANGELOG.md' >&2
  exit 1
}
# Phase 1 keeps the existing bundle version; phase 3 will consolidate metadata.
metadata_version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' build/darwin/Info.plist)
[[ "$metadata_version" == "$version" ]] || {
  echo "Bundle version ($metadata_version) does not match changelog ($version)" >&2
  exit 1
}
tag="v$version"
# Let API failures fail the run, rather than treating them as a missing release.
repository="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
published=$(gh api --paginate "repos/$repository/releases" \
  --jq '.[] | select(.draft == false) | .tag_name')
release=true
if grep -Fxq "$tag" <<< "$published"; then
  release=false
fi
awk '/^## / { if (started) exit; if ($0 ~ /^## v/) { started=1; next } } started' \
  CHANGELOG.md > "$notes"
grep -q '[^[:space:]]' "$notes" || { echo 'Release notes are empty' >&2; exit 1; }
printf 'release=%s\nversion=%s\ntag=%s\n' "$release" "$version" "$tag" | tee -a "${GITHUB_OUTPUT:-/dev/null}"
