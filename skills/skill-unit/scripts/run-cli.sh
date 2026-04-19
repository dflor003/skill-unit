#!/usr/bin/env bash
set -euo pipefail

# Resolves the skill-unit CLI and forwards all arguments to it.
#
# Resolution order:
#   1. `skill-unit` on PATH (global install or dev `npm link`)
#   2. `npx --no-install skill-unit` (project-local node_modules)
#   3. Error with install instructions.

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
