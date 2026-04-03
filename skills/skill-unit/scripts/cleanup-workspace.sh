#!/bin/bash
set -euo pipefail

# Removes a workspace directory created by create-workspace.sh.
# Usage: bash cleanup-workspace.sh <workspace-path>
#
# Safety: only removes directories under the system temp directory
# that match the skill-unit-workspace naming pattern.

WORKSPACE="${1:?Usage: cleanup-workspace.sh <workspace-path>}"

# Safety check: only delete if it looks like a workspace we created
if [[ "$WORKSPACE" != *"skill-unit-workspace"* ]]; then
  echo "Error: Path does not look like a skill-unit workspace: $WORKSPACE" >&2
  exit 1
fi

if [ ! -d "$WORKSPACE" ]; then
  echo "Warning: Workspace does not exist: $WORKSPACE" >&2
  exit 0
fi

rm -rf "$WORKSPACE"
