#!/usr/bin/env bash
# SessionStart hook for the Weft harness.
# Checks learning state and injects context to guide the agent's opening move.
# Supports both global install (via ~/.config/weft/root) and local install
# (falls back to CWD).
#
# Hook config (registered by bootstrap.sh in ~/.claude/settings.json):
#   "hooks": {
#     "SessionStart": [{
#       "type": "command",
#       "command": "bash /path/to/weft/.claude/hooks/session-start.sh"
#     }]
#   }

set -euo pipefail

# Read hook input from stdin
INPUT=$(cat)
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')

# ── Resolve harness root ──────────────────────────────────────────────
# Priority: ~/.config/weft/root (global install) > CWD (local install)

WEFT_ROOT=""
if [ -f "$HOME/.config/weft/root" ]; then
  WEFT_ROOT=$(cat "$HOME/.config/weft/root")
fi

# Fall back to CWD if no global install
if [ -z "$WEFT_ROOT" ]; then
  if [ -z "$CWD" ]; then
    CWD="$(cd "$(dirname "$0")/../.." && pwd)"
  fi
  WEFT_ROOT="$CWD"
fi

LEARNING_DIR="$WEFT_ROOT/learning"
CONTEXT_PARTS=()

# ── Inject harness root path ─────────────────────────────────────────
# Reinforces the CLAUDE.md directive — agent sees the path from two
# independent sources (CLAUDE.md section + this hook context).

CONTEXT_PARTS+=("Weft harness root: $WEFT_ROOT. All harness file paths (learning/, background/, .claude/references/) resolve from this root, not from the current working directory.")

# ── Condition 1: No learning directory at all ─────────────────────────

if [ ! -d "$LEARNING_DIR" ]; then
  CONTEXT_PARTS+=("This user has no learning/ directory. They haven't been onboarded yet. Suggest running /intake to get started — it takes about 30 minutes and builds a personalized profile from an interview (and any materials dropped in background/).")
  JOINED=$(printf '%s\n' "${CONTEXT_PARTS[@]}")
  echo "{\"additionalContext\": $(echo "$JOINED" | jq -Rs .)}"
  exit 0
fi

# ── Condition 2: Intake was interrupted ───────────────────────────────

if [ -f "$LEARNING_DIR/.intake-notes.md" ]; then
  PHASE=$(head -20 "$LEARNING_DIR/.intake-notes.md" | sed -n 's/.*phase: //p' || echo "")
  if [ -n "$PHASE" ] && [ "$PHASE" != "complete" ]; then
    CONTEXT_PARTS+=("This user started the setup interview but didn't finish it. Let them know they don't have to start over — /intake will resume from where they stopped. Offer to continue now.")
  fi
fi

# ── Condition 3: No current-state (intake ran but no state generated) ─

if [ ! -f "$LEARNING_DIR/current-state.md" ]; then
  CONTEXT_PARTS+=("This user has installed Weft but hasn't set up their learning profile yet. Prompt them to run /intake — it's a short interview (about 30 minutes) that builds a personalized profile: their background, goals, current skills, and how they learn. That profile is what shapes everything else in the harness. When they're ready, they just type /intake.")
  JOINED=$(printf '%s\n' "${CONTEXT_PARTS[@]}")
  echo "{\"additionalContext\": $(echo "$JOINED" | jq -Rs .)}"
  exit 0
fi

# ── Condition 4: Has state, check for recent activity ─────────────────

SESSION_LOG_DIR="$LEARNING_DIR/session-logs"
if [ -d "$SESSION_LOG_DIR" ]; then
  RECENT_LOGS=$(find "$SESSION_LOG_DIR" -name "*.md" -mtime -7 2>/dev/null | wc -l | tr -d ' ')
else
  RECENT_LOGS=0
fi

if [ "$RECENT_LOGS" -eq 0 ]; then
  CONTEXT_PARTS+=("This user has a learning profile but no session logs in the past week. They may be returning after a break. Suggest /startwork to plan a new session based on their goals and progress, or /lesson-scaffold to adapt a specific resource into a customized lesson.")
fi

# ── Condition 5: Schedule check (stub) ────────────────────────────────
# TODO: Check for schedule.md or deadline files and surface upcoming deadlines.

# ── Update check ──────────────────────────────────────────────────────
# Reads update preference from config.json and checks for new commits.

CONFIG_FILE="$HOME/.config/weft/config.json"
LAST_FETCH_FILE="$HOME/.config/weft/last-fetch"

if [ -f "$CONFIG_FILE" ]; then
  UPDATE_PREF=$(jq -r '.updates // "notify"' "$CONFIG_FILE" 2>/dev/null || echo "notify")
else
  UPDATE_PREF="notify"
fi

if [ "$UPDATE_PREF" != "off" ] && [ -d "$WEFT_ROOT/.git" ]; then
  # Check if a fetch is due (>24h since last fetch)
  NOW=$(date +%s)
  LAST_FETCH=0
  if [ -f "$LAST_FETCH_FILE" ]; then
    LAST_FETCH=$(cat "$LAST_FETCH_FILE" 2>/dev/null || echo "0")
  fi

  ELAPSED=$((NOW - LAST_FETCH))
  if [ "$ELAPSED" -gt 86400 ]; then
    # Fetch in background, non-blocking
    (cd "$WEFT_ROOT" && git fetch origin 2>/dev/null &)
    echo "$NOW" > "$LAST_FETCH_FILE"
  fi

  # Compare local vs remote
  BEHIND=$(cd "$WEFT_ROOT" && git rev-list HEAD..origin/main --count 2>/dev/null || echo "0")

  if [ "$BEHIND" -gt 0 ]; then
    if [ "$UPDATE_PREF" = "auto" ]; then
      # Auto-update
      if (cd "$WEFT_ROOT" && git pull --ff-only 2>/dev/null); then
        CONTEXT_PARTS+=("Weft auto-updated ($BEHIND new commits).")
      fi
      # Silent on failure — session still works
    else
      # Notify
      CONTEXT_PARTS+=("Weft update available ($BEHIND new commits). Run: cd $WEFT_ROOT && git pull")
    fi
  fi
fi

# ── Emit context ──────────────────────────────────────────────────────

if [ ${#CONTEXT_PARTS[@]} -gt 0 ]; then
  JOINED=$(printf '%s\n' "${CONTEXT_PARTS[@]}")
  echo "{\"additionalContext\": $(echo "$JOINED" | jq -Rs .)}"
else
  echo '{}'
fi
