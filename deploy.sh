#!/usr/bin/env bash
# Build the static export and force-push it to the remote `pages` branch (replacing that branch’s history).
# Requires: clean npm install, git remote (default: origin) with push access.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

REMOTE="${DEPLOY_REMOTE:-origin}"
BRANCH="${DEPLOY_BRANCH:-pages}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "deploy.sh must run from a git clone of this repository." >&2
  exit 1
fi

if [[ ! -f package.json ]]; then
  echo "package.json not found in $ROOT" >&2
  exit 1
fi

npm run build

if [[ ! -d out ]] || [[ -z "$(ls -A out 2>/dev/null || true)" ]]; then
  echo "Build did not produce a non-empty out/ directory." >&2
  exit 1
fi

TMP="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP"
}
trap cleanup EXIT

cp -a out/. "$TMP/"

ORIGIN_URL="$(git remote get-url "$REMOTE")"

cd "$TMP"
git init -q
git checkout -q -b "$BRANCH"
git add -A
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
git commit -q -m "Deploy static build ($STAMP)"

git remote add origin "$ORIGIN_URL"
git push -q -f origin "HEAD:${BRANCH}"

echo "Pushed static site to ${REMOTE} ${BRANCH} branch."
