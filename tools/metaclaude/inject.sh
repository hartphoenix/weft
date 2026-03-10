#!/usr/bin/env bash
# MetaClaude Injector — UserPromptSubmit hook
# Reads staged injection from observer, outputs as additionalContext.
# Logs every injection. Updates display state for status line.

set -euo pipefail

MC_DIR="$HOME/.claude/metaclaude"
STATE_FILE="$MC_DIR/enabled"
INJECTION_FILE="$MC_DIR/injection"
STATUS_FILE="$MC_DIR/status"
MODE_FILE="$MC_DIR/mode"
DISPLAY_FILE="$MC_DIR/last-injection"
LOG_DIR="$MC_DIR/logs"
SESSION_LOG_POINTER="$MC_DIR/session-log"

mkdir -p "$LOG_DIR"

# Read hook input — extract available fields
INPUT=$(cat)
USER_PROMPT=$(echo "$INPUT" | jq -r '.prompt // empty' 2>/dev/null | head -c 2000)
INJ_SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)
INJ_PERMISSION_MODE=$(echo "$INPUT" | jq -r '.permission_mode // empty' 2>/dev/null)

# --- Per-session state directory ---
if [ -n "$INJ_SESSION_ID" ]; then
    SESSION_DIR="$MC_DIR/sessions/${INJ_SESSION_ID:0:8}"
    INJECTION_FILE="$SESSION_DIR/injection"
    SESSION_LOG_POINTER="$SESSION_DIR/session-log"
fi

# Exit silently if MetaClaude is disabled
[ -f "$STATE_FILE" ] || exit 0

# Read mode
MODE="dev"
[ -f "$MODE_FILE" ] && MODE=$(cat "$MODE_FILE")

# Check for staged injection
if [ -f "$INJECTION_FILE" ]; then
    CONTENT=$(cat "$INJECTION_FILE")
    rm -f "$INJECTION_FILE"

    if [ -n "$CONTENT" ]; then
        # Log the injection
        LOG_FILE="$LOG_DIR/$(date +%Y-%m-%d).jsonl"
        jq -n \
            --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            --arg content "$CONTENT" \
            --arg mode "$MODE" \
            '{timestamp: $ts, type: "injection", content: $content, mode: $mode}' \
            >> "$LOG_FILE"

        # Write to display file for status line
        echo "$CONTENT" > "$DISPLAY_FILE"

        # Update status
        jq -n \
            --arg mode "$MODE" \
            '{enabled: true, pending: false, injected: true, mode: $mode}' \
            > "$STATUS_FILE"

        # Dev mode: show injection content inline in chat
        if [ "$MODE" = "dev" ]; then
            printf '\033[1;35m◉ MC\033[0m \033[2;35m%s\033[0m\n' "$CONTENT" >&2
        fi

        # Append injection confirmation to session log
        if [ -f "$SESSION_LOG_POINTER" ]; then
            SESSION_LOG=$(cat "$SESSION_LOG_POINTER")
            if [ -f "$SESSION_LOG" ]; then
                jq -n \
                    --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
                    --arg content "$CONTENT" \
                    --arg user_prompt "$USER_PROMPT" \
                    --arg sid "$INJ_SESSION_ID" \
                    --arg perm "$INJ_PERMISSION_MODE" \
                    '{type:"injection", timestamp:$ts, content:$content, delivered:true, user_prompt:$user_prompt, session_id:$sid, permission_mode:$perm}' \
                    >> "$SESSION_LOG"
            fi
        fi

        # Output as additionalContext for Builder Claude
        jq -n --arg ctx "[MetaClaude] $CONTENT" \
            '{"additionalContext": $ctx}'
        exit 0
    fi
fi

# No injection this turn — clear display, update status
rm -f "$DISPLAY_FILE"
jq -n \
    --arg mode "$MODE" \
    --argjson pending "$([ -f "$INJECTION_FILE" ] && echo true || echo false)" \
    '{enabled: true, pending: $pending, injected: false, mode: $mode}' \
    > "$STATUS_FILE"

exit 0
