#!/bin/bash
set -euo pipefail

# Read hook input from stdin
input=$(cat)

# Extract the tool name and relevant file path
tool_name=$(echo "$input" | jq -r '.tool_name // empty')

# Determine the file path based on the tool being used
file_path=""
case "$tool_name" in
  Read|Write|Edit)
    file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')
    ;;
  Glob)
    file_path=$(echo "$input" | jq -r '.tool_input.path // empty')
    ;;
  Grep)
    file_path=$(echo "$input" | jq -r '.tool_input.path // empty')
    ;;
  *)
    # Tool not relevant for file access blocking
    exit 0
    ;;
esac

# If no file path, allow (nothing to block)
if [ -z "$file_path" ]; then
  exit 0
fi

# Block access to spec files anywhere in the filesystem
if echo "$file_path" | grep -qiE '\.spec\.md$'; then
  echo '{"hookSpecificOutput":{"permissionDecision":"deny"},"systemMessage":"Access to test spec files is not permitted."}' >&2
  exit 2
fi

# Block access to results files
if echo "$file_path" | grep -qiE '\.results\.md$'; then
  echo '{"hookSpecificOutput":{"permissionDecision":"deny"},"systemMessage":"Access to test results files is not permitted."}' >&2
  exit 2
fi

# Block access to the tests directory
# Normalize path separators to forward slashes for consistent matching
normalized_path=$(echo "$file_path" | sed 's|\\|/|g')
if echo "$normalized_path" | grep -qiE '(^|/)tests(/|$)'; then
  echo '{"hookSpecificOutput":{"permissionDecision":"deny"},"systemMessage":"Access to the tests directory is not permitted."}' >&2
  exit 2
fi

# Allow everything else
exit 0
