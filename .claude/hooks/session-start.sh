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

# Learning state may live in a separate repo (e.g., private git repo).
# Package operations (update check, skill registration) use the repo
# this hook script lives in — which may differ from the learning root.
LEARNING_ROOT="$WEFT_ROOT"
if [ -f "$HOME/.config/weft/config.json" ]; then
  LR=$(jq -r '.learningRoot // empty' "$HOME/.config/weft/config.json" 2>/dev/null || true)
  if [ -n "$LR" ]; then
    LEARNING_ROOT="$LR"
  fi
fi
PACKAGE_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

LEARNING_DIR="$LEARNING_ROOT/learning"
CONTEXT_PARTS=()

# ── Inject harness root path ─────────────────────────────────────────
# Reinforces the CLAUDE.md directive — agent sees the path from two
# independent sources (CLAUDE.md section + this hook context).

CONTEXT_PARTS+=("Weft harness root: $LEARNING_ROOT. All harness file paths (learning/, background/, .claude/references/) resolve from this root, not from the current working directory.")

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

# ── Config + timestamp (shared by digest check and update check) ──────

CONFIG_FILE="$HOME/.config/weft/config.json"
NOW=$(date +%s)

if [ -f "$CONFIG_FILE" ]; then
  DIGEST_INTERVAL=$(jq -r '.digestInterval // 3' "$CONFIG_FILE" 2>/dev/null || echo "3")
  DIGEST_MODE=$(jq -r '.digestMode // "suggest"' "$CONFIG_FILE" 2>/dev/null || echo "suggest")
  UPDATE_PREF=$(jq -r '.updates // "notify"' "$CONFIG_FILE" 2>/dev/null || echo "notify")
else
  DIGEST_INTERVAL=3
  DIGEST_MODE="suggest"
  UPDATE_PREF="notify"
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

# ── Condition 5: Digest staleness ─────────────────────────────────────

# Detect whether digest preferences have been explicitly configured.
# Existing users who ran intake before this feature won't have these
# keys — introduce the feature and ask before nudging.
DIGEST_CONFIGURED="false"
if [ -f "$CONFIG_FILE" ]; then
  DIGEST_CONFIGURED=$(jq 'has("digestInterval")' "$CONFIG_FILE" 2>/dev/null || echo "false")
fi

if [ "$DIGEST_CONFIGURED" = "false" ]; then
  # One-time introduction for existing users (fires once, then never again)
  CONTEXT_PARTS+=("Weft has a new feature this user hasn't configured yet: periodic learning-profile digests. The harness can check recent Claude sessions every few days and suggest updates to the learning profile — the user always reviews and approves before anything changes. Briefly introduce this and ask: would they like digest suggestions every 3 days (default), a different interval, or to turn it off? Write their preference to ~/.config/weft/config.json (read existing file first if present, merge — don't overwrite; set digestInterval as number of days, digestMode as \"suggest\" or \"off\"). Also create $LEARNING_DIR/.last-digest-timestamp with today's date (YYYY-MM-DD) so the digest window starts fresh.")
elif [ "$DIGEST_MODE" != "off" ]; then
  LAST_DIGEST_FILE="$LEARNING_DIR/.last-digest-timestamp"
  if [ -f "$LAST_DIGEST_FILE" ]; then
    LAST_DIGEST=$(cat "$LAST_DIGEST_FILE" 2>/dev/null || echo "")
    if [ -n "$LAST_DIGEST" ]; then
      # Cross-platform date parsing: macOS (-j -f) then Linux (-d)
      LAST_DIGEST_EPOCH=$(date -j -f "%Y-%m-%d" "$LAST_DIGEST" +%s 2>/dev/null || date -d "$LAST_DIGEST" +%s 2>/dev/null || echo "0")
      DAYS_SINCE=$(( (NOW - LAST_DIGEST_EPOCH) / 86400 ))
    else
      DAYS_SINCE=999
    fi
  else
    DAYS_SINCE=999
  fi

  if [ "$DAYS_SINCE" -gt "$DIGEST_INTERVAL" ]; then
    if [ "$DAYS_SINCE" -eq 999 ]; then
      CONTEXT_PARTS+=("This user's learning profile hasn't been updated by digest yet. Offer to run /session-digest — a quick analysis of recent sessions that surfaces proposed updates for them to approve.")
    else
      CONTEXT_PARTS+=("This user's learning profile hasn't been updated in $DAYS_SINCE days. Offer to run /session-digest — a quick analysis of recent sessions that surfaces proposed updates for them to approve.")
    fi
  fi
fi

# ── Condition 6: Schedule check (stub) ────────────────────────────────
# TODO: Check for schedule.md or deadline files and surface upcoming deadlines.

# ── Update check ──────────────────────────────────────────────────────

LAST_FETCH_FILE="$HOME/.config/weft/last-fetch"

if [ "$UPDATE_PREF" != "off" ] && [ -d "$PACKAGE_ROOT/.git" ]; then
  # Check if a fetch is due (>24h since last fetch)
  LAST_FETCH=0
  if [ -f "$LAST_FETCH_FILE" ]; then
    LAST_FETCH=$(cat "$LAST_FETCH_FILE" 2>/dev/null || echo "0")
  fi

  ELAPSED=$((NOW - LAST_FETCH))
  if [ "$ELAPSED" -gt 86400 ]; then
    # Fetch in background, non-blocking
    (cd "$PACKAGE_ROOT" && git fetch origin 2>/dev/null &)
    echo "$NOW" > "$LAST_FETCH_FILE"
  fi

  # Compare local vs remote
  BEHIND=$(cd "$PACKAGE_ROOT" && git rev-list HEAD..origin/main --count 2>/dev/null || echo "0")

  if [ "$BEHIND" -gt 0 ]; then
    if [ "$UPDATE_PREF" = "auto" ]; then
      # Auto-update
      if (cd "$PACKAGE_ROOT" && git pull --ff-only 2>/dev/null); then
        CONTEXT_PARTS+=("Weft auto-updated ($BEHIND new commits).")
      fi
      # Silent on failure — session still works
    else
      # Notify
      CONTEXT_PARTS+=("Weft update available ($BEHIND new commits). Run: cd $PACKAGE_ROOT && git pull")
    fi
  fi
fi

# ── Unlinked skills check ─────────────────────────────────────────────
# Detects skills in the harness that exist on disk but aren't symlinked
# into ~/.claude/skills/. Fires when a git pull brings in a new skill
# directory that bootstrap hasn't registered yet.

HARNESS_SKILLS_DIR="$PACKAGE_ROOT/.claude/skills"
if [ -d "$HARNESS_SKILLS_DIR" ]; then
  UNLINKED_SKILLS=()
  for skill_dir in "$HARNESS_SKILLS_DIR"/*/; do
    [ -d "$skill_dir" ] || continue
    skill_name=$(basename "$skill_dir")
    if [ ! -L "$HOME/.claude/skills/$skill_name" ]; then
      UNLINKED_SKILLS+=("$skill_name")
    fi
  done
  if [ ${#UNLINKED_SKILLS[@]} -gt 0 ]; then
    SKILL_COUNT=${#UNLINKED_SKILLS[@]}
    SKILL_NAMES=$(IFS=', '; echo "${UNLINKED_SKILLS[*]}")
    CONTEXT_PARTS+=("$SKILL_COUNT new weft skill(s) installed but not yet linked: $SKILL_NAMES. Run bootstrap to register them: bash $PACKAGE_ROOT/scripts/bootstrap.sh")
  fi
fi

# ── Emit context ──────────────────────────────────────────────────────

if [ ${#CONTEXT_PARTS[@]} -gt 0 ]; then
  JOINED=$(printf '%s\n' "${CONTEXT_PARTS[@]}")
  echo "{\"additionalContext\": $(echo "$JOINED" | jq -Rs .)}"
else
  echo '{}'
fi
