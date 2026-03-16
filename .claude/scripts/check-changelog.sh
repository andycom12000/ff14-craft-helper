#!/bin/bash
# Claude Code PreToolUse hook: ensure changelog is updated before git tag
# Reads tool_input JSON from stdin, checks if it's a "git tag vX.Y.Z" command,
# and verifies the version exists in ChangelogView.vue.

INPUT=$(cat)

# Extract tool_name and command via sed (no jq/grep -P needed)
TOOL_NAME=$(echo "$INPUT" | sed -n 's/.*"tool_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
COMMAND=$(echo "$INPUT" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')

# Only check Bash tool calls
if [ "$TOOL_NAME" != "Bash" ]; then
  exit 0
fi

# Check if command contains "git tag v"
case "$COMMAND" in
  *"git tag v"*) ;;
  *) exit 0 ;;
esac

# Extract the version (e.g. v1.7.0)
VERSION=$(echo "$COMMAND" | sed -n 's/.*\(v[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\).*/\1/p')

if [ -z "$VERSION" ]; then
  exit 0
fi

CHANGELOG_FILE="src/views/ChangelogView.vue"

if [ ! -f "$CHANGELOG_FILE" ]; then
  echo "BLOCKED: ChangelogView.vue not found. Please create the changelog page first."
  exit 2
fi

if ! grep -q "$VERSION" "$CHANGELOG_FILE"; then
  echo "BLOCKED: Version $VERSION not found in ChangelogView.vue. Please add the changelog entry for $VERSION and commit before tagging."
  exit 2
fi

exit 0
