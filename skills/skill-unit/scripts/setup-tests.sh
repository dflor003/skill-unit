#!/bin/bash
set -euo pipefail

# Scaffolds a test directory structure for skill-unit in the current project.
# Usage: bash setup-tests.sh [skill-name]
#
# If skill-name is provided, creates a test directory for that skill.
# Otherwise, creates the base test directory structure.

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
TEST_DIR="tests"
SKILL_NAME="${1:-}"

# Read test-dir from .skill-unit.yml if it exists
if [ -f ".skill-unit.yml" ]; then
  custom_dir=$(grep -E '^test-dir:' .skill-unit.yml | sed 's/test-dir:\s*//' | tr -d '[:space:]' || true)
  if [ -n "$custom_dir" ]; then
    TEST_DIR="$custom_dir"
  fi
fi

# Create base test directory
mkdir -p "$TEST_DIR"

# If a skill name was provided, scaffold that skill's test directory
if [ -n "$SKILL_NAME" ]; then
  SKILL_TEST_DIR="$TEST_DIR/$SKILL_NAME"
  mkdir -p "$SKILL_TEST_DIR/results"
  mkdir -p "$SKILL_TEST_DIR/fixtures"

  # Copy example spec if none exists
  if [ ! -f "$SKILL_TEST_DIR/$SKILL_NAME.spec.md" ]; then
    cp "$PLUGIN_ROOT/templates/example.spec.md" "$SKILL_TEST_DIR/$SKILL_NAME.spec.md"
    # Replace placeholder name with actual skill name
    sed -i "s/my-skill-tests/$SKILL_NAME-tests/" "$SKILL_TEST_DIR/$SKILL_NAME.spec.md"
    sed -i "s/skill: my-skill/skill: $SKILL_NAME/" "$SKILL_TEST_DIR/$SKILL_NAME.spec.md"
    echo "Created $SKILL_TEST_DIR/$SKILL_NAME.spec.md"
  else
    echo "Spec file already exists: $SKILL_TEST_DIR/$SKILL_NAME.spec.md"
  fi
else
  echo "Created $TEST_DIR/"
  echo ""
  echo "To scaffold tests for a specific skill:"
  echo "  bash $0 <skill-name>"
fi

# Copy default config if none exists at repo root
if [ ! -f ".skill-unit.yml" ]; then
  if [ -f "$PLUGIN_ROOT/templates/.skill-unit.yml" ]; then
    cp "$PLUGIN_ROOT/templates/.skill-unit.yml" ".skill-unit.yml"
    echo "Created .skill-unit.yml"
  else
    echo "No .skill-unit.yml found; the CLI/TUI Options screen will generate one on first save."
  fi
fi

echo "Done."
