#!/usr/bin/env bash
set -euo pipefail

# Resolves the skill-unit CLI and forwards all arguments to it.
#
# Resolution order:
#   0. This repo's own dist/ build, when run inside the skill-unit repo itself
#      (including its git worktrees)
#   1. `skill-unit` on PATH (global install or dev `npm link`)
#   2. `npx --no-install skill-unit` (project-local node_modules)
#   3. Error with install instructions.

# Step 0 exists because `npm link` is global: it points the PATH binary at one
# checkout's dist/. From a worktree of this repo, step 1 would then run the main
# checkout's build instead of the code under test, silently and with no error.
# The package-name guard keeps this from firing in a consumer's project.
repo_root=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [ -n "$repo_root" ] &&
  [ -f "$repo_root/dist/cli/index.js" ] &&
  grep -qE '"name"[[:space:]]*:[[:space:]]*"skill-unit"' "$repo_root/package.json" 2>/dev/null; then
  exec node "$repo_root/dist/cli/index.js" "$@"
fi

if command -v skill-unit >/dev/null 2>&1; then
  exec skill-unit "$@"
fi

if npx --no-install skill-unit --help >/dev/null 2>&1; then
  exec npx --no-install skill-unit "$@"
fi

cat >&2 <<'EOF'
skill-unit CLI is not installed.

Install it with one of:
  npm install --save-dev skill-unit   # per-project (recommended)
  npm install -g skill-unit           # globally

For development in the skill-unit repo itself, run `npm install && npm run build && npm link` from the repo root.
EOF
exit 1
