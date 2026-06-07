#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATCH_FILE="${SCRIPT_DIR}/rhythmicspace-v1.0.1-combined.patch"
BRANCH="cursor/fix-production-readiness-a9cf"

if [[ ! -f "$PATCH_FILE" ]]; then
  echo "Error: patch file not found at $PATCH_FILE"
  exit 1
fi

if [[ ! -d .git ]] || ! git remote get-url origin 2>/dev/null | grep -qi "RhythmicSpace"; then
  echo "Error: run this script from your RhythmicSpace repo root."
  echo "  cd /path/to/RhythmicSpace"
  echo "  bash $0"
  exit 1
fi

echo "→ Fetching latest main..."
git fetch origin main
git checkout main
git pull origin main

if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
  echo "→ Branch ${BRANCH} exists — checking it out"
  git checkout "${BRANCH}"
  git reset --hard origin/main
else
  echo "→ Creating branch ${BRANCH}"
  git checkout -b "${BRANCH}"
fi

echo "→ Applying patches..."
git am "${PATCH_FILE}"

echo "→ Pushing to GitHub..."
git push -u origin "${BRANCH}"

echo ""
echo "Done! Open a PR:"
echo "  https://github.com/simonlatham155-tech/RhythmicSpace/compare/main...${BRANCH}"
