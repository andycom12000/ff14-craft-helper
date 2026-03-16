#!/bin/bash
# Claude Code PostToolUse hook: after pushing a tag, suggest deploy verification
# Reads tool_input JSON from stdin, checks if it's a "git push" with a tag.

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | sed -n 's/.*"tool_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
COMMAND=$(echo "$INPUT" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')

# Only check Bash tool calls
if [ "$TOOL_NAME" != "Bash" ]; then
  exit 0
fi

# Detect git push with a tag reference (v*)
# Matches: git push origin v1.7.1, git push origin v1.7.1 --force, git push --tags, etc.
case "$COMMAND" in
  *"git push"*"v"[0-9]*) ;;
  *"git push --tags"*) ;;
  *) exit 0 ;;
esac

# Extract the version tag if present
VERSION=$(echo "$COMMAND" | sed -n 's/.*\(v[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\).*/\1/p')

if [ -n "$VERSION" ]; then
  echo "Tag $VERSION was pushed. Spawn the deploy-verify agent (run_in_background) to monitor the deployment and verify production UI with screenshots."
else
  echo "Tags were pushed. Spawn the deploy-verify agent (run_in_background) to monitor the deployment and verify production UI with screenshots."
fi

exit 0
