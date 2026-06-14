#!/bin/bash
# --------------------------------------------------------------------
# CodeRabbit Pre-Commit Hook
# Template stored in scripts/pre-commit.sh — install via:
#   cp scripts/pre-commit.sh .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
# --------------------------------------------------------------------
# Behavior:
# - Runs `cr review --agent` before each commit
# - If CodeRabbit isn't installed: removes itself, proceeds
# - If auth token expired: removes itself, prints reinstall instructions
# - If never authenticated (first run): warns but KEEPS the hook
# - If nothing to review: proceeds silently
# - On other errors: proceeds with warning
# --------------------------------------------------------------------

set -euo pipefail

HOOK_SOURCE="scripts/pre-commit.sh"
HOOK_PATH="$(cd "$(dirname "$0")" && pwd)/pre-commit"
CR="$HOME/.local/bin/cr"
CR_LOG="/tmp/coderabbit-precommit.log"
# If CodeRabbit isn't installed, remove the hook and proceed
if [ ! -x "$CR" ]; then
  echo "[CodeRabbit] CLI not found — removing pre-commit hook."
  echo "[CodeRabbit] To reinstall, run: npm run cr-install-hook"
  rm -f "$HOOK_PATH"
  exit 0
fi

echo "[CodeRabbit] Running pre-commit review..."
: > "$CR_LOG"
echo "[CodeRabbit] Started at $(date)" >> "$CR_LOG"

# Run CodeRabbit review in agent mode
set +e
"$CR" review --agent --type uncommitted --base HEAD 2>&1 | tee -a "$CR_LOG"
EXIT_CODE=${PIPESTATUS[0]}
set -e

# Handle based on exit code and output
if [ $EXIT_CODE -eq 0 ]; then
  echo "[CodeRabbit] ✅ Review complete."
  exit 0
fi

# Check for specific error types
if grep -qi "token.*expir\|unauthorized\|insufficient.*quota\|rate.limit\|429\|403\|401" "$CR_LOG" 2>/dev/null; then
  # Token was valid but has expired — remove the hook as user requested
  echo "[CodeRabbit] 🔑 Token expired or authorization failed."
  echo "[CodeRabbit] → Removing pre-commit hook to avoid blocking commits."
  rm -f "$HOOK_PATH"
  echo "[CodeRabbit] → To reinstall after re-authenticating:"
  echo "[CodeRabbit]   1. cr auth login"
  echo "[CodeRabbit]   2. npm run cr-install-hook"
  exit 0
fi

if grep -qi "sign.in\|not signed\|authenticat" "$CR_LOG" 2>/dev/null; then
  echo "[CodeRabbit] ⚠️  Not signed in — CodeRabbit review skipped."
  # If this is a first run (no history), keep the hook and just warn
  echo "[CodeRabbit] → Run 'cr auth login' to enable pre-commit reviews."
  echo "[CodeRabbit] → Hook will remain active until you authenticate."
  exit 0
fi

# For non-critical skips (no changes, review_skipped, etc.), proceed
if grep -qi "review_skipped\|no.*change\|nothing.*review\|could not.*determine" "$CR_LOG" 2>/dev/null; then
  echo "[CodeRabbit] Nothing to review — proceeding."
  exit 0
fi

# Fallback: warn but don't block
echo "[CodeRabbit] ⚠️  Review encountered an issue (exit code: $EXIT_CODE) — proceeding with commit."
exit 0
