#!/usr/bin/env bash
# Restore SCIMSetup.js if it was accidentally overwritten with Python code.
# Run on the production server from the repo root:
#   bash scripts/fix-scimsetup.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FILE="$ROOT/frontend/src/pages/SCIMSetup.js"

echo "Repo: $ROOT"
echo "Fixing: $FILE"

if [[ ! -d "$ROOT/.git" ]]; then
  echo "ERROR: not a git repo at $ROOT"
  exit 1
fi

# Force restore the React page from the current branch tip / origin
git -C "$ROOT" fetch origin mobileapp_refex2.0 || true
git -C "$ROOT" checkout origin/mobileapp_refex2.0 -- frontend/src/pages/SCIMSetup.js

HEAD1=$(head -n 1 "$FILE" || true)
echo "First line now: $HEAD1"

if [[ "$HEAD1" != import\ React* ]]; then
  echo "ERROR: file still looks wrong. Refusing to continue."
  exit 1
fi

echo "OK — SCIMSetup.js restored."
echo "Next:"
echo "  cd $ROOT/frontend && yarn build"
echo "  sudo systemctl restart superapp-backend"
