#!/bin/bash
set -euo pipefail

# Creates an isolated workspace directory from a fixture folder.
# Usage: bash create-workspace.sh <fixture-path>
#
# Creates a temp directory, copies the fixture contents into it,
# and prints the workspace path to stdout. The caller uses this
# path as the working directory for CLI runner invocations.
#
# The workspace is a self-contained project — the CLI session
# launched from it sees only the fixture files, providing
# process-level anti-bias isolation.

FIXTURE_PATH="${1:?Usage: create-workspace.sh <fixture-path>}"

if [ ! -d "$FIXTURE_PATH" ]; then
  echo "Error: Fixture path does not exist: $FIXTURE_PATH" >&2
  exit 1
fi

# Create a temp directory with a neutral name
WORKSPACE=$(mktemp -d "${TMPDIR:-/tmp}/skill-unit-workspace-XXXXXX")

# Copy fixture contents into the workspace
cp -r "$FIXTURE_PATH"/. "$WORKSPACE"/

# Print the workspace path for the caller to use
echo "$WORKSPACE"
