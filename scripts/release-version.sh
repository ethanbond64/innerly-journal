#!/usr/bin/env bash
# Use the highest changelog version; --version is an offline query for builds.
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(awk '/^## v/ { sub(/^## v/, ""); print $1 }' CHANGELOG.md |
  sort -t . -k1,1nr -k2,2nr -k3,3nr | awk 'NR == 1')
[[ "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || {
  echo 'Expected a ## vX.Y.Z heading in CHANGELOG.md' >&2
  exit 1
}
if [[ "${1:-}" == --version ]]; then
  printf '%s\n' "$version"
  exit 0
fi
notes="${1:-${RUNNER_TEMP:-/tmp}/innerly-release-notes.md}"
tag="v$version"
# Let API failures fail the run, rather than treating them as a missing release.
repository="${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
published=$(gh api --paginate "repos/$repository/releases" \
  --jq '.[] | select(.draft == false) | .tag_name')
release=true
if grep -Fxq "$tag" <<< "$published"; then
  release=false
fi
awk -v heading="$tag" '/^## / { if (started) exit; if ($2 == heading) { started=1; next } } started' \
  CHANGELOG.md > "$notes"
grep -q '[^[:space:]]' "$notes" || { echo 'Release notes are empty' >&2; exit 1; }
printf 'release=%s\nversion=%s\ntag=%s\n' "$release" "$version" "$tag" | tee -a "${GITHUB_OUTPUT:-/dev/null}"
