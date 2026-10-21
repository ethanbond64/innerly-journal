#!/usr/bin/env bash
# The only place CHANGELOG.md is parsed: the release version, tag and notes.
#   --version      print the highest version (offline)
#   --notes PATH   write that version's notes to PATH (offline)
#   (no argument)  also check GitHub and emit Actions outputs
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(awk '/^## v/ { sub(/^## v/, ""); print $1 }' CHANGELOG.md |
  sort -t . -k1,1nr -k2,2nr -k3,3nr | awk 'NR == 1')
[[ "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || {
  echo 'Expected a ## vX.Y.Z heading in CHANGELOG.md' >&2
  exit 1
}
tag="v$version"
notes() {
  awk -v heading="$tag" '/^## / { if (started) exit; if ($2 == heading) { started=1; next } } started' \
    CHANGELOG.md > "$1"
  grep -q '[^[:space:]]' "$1" || { echo 'Release notes are empty' >&2; exit 1; }
}
case "${1:-}" in
  --version) printf '%s\n' "$version"; exit 0 ;;
  --notes) [[ -n "${2:-}" ]] || { echo 'Usage: release-version.sh --notes PATH' >&2; exit 2; }
           notes "$2"; exit 0 ;;
  '') ;;
  *) printf 'Unknown argument: %s\n' "$1" >&2; exit 2 ;;
esac
notes "${RUNNER_TEMP:-/tmp}/innerly-release-notes.md"
# Let API failures fail the run, rather than treating them as a missing release.
repository="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
published=$(gh api --paginate "repos/$repository/releases" \
  --jq '.[] | select(.draft == false) | .tag_name')
release=true
if grep -Fxq "$tag" <<< "$published"; then
  release=false
fi
printf 'release=%s\nversion=%s\ntag=%s\n' "$release" "$version" "$tag" | tee -a "${GITHUB_OUTPUT:-/dev/null}"
