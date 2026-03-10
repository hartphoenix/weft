#!/usr/bin/env bash
# MetaClaude status line component
# Called from the main status line script. Outputs MetaClaude-specific lines.
# Designed to be appended to the existing status line output.
#
# In prod mode: shows ○/◉ MC indicator only
# In dev mode: shows indicator + last injection content + pending content

MC_DIR="$HOME/.claude/metaclaude"
STATUS_FILE="$MC_DIR/status"
DISPLAY_FILE="$MC_DIR/last-injection"
MODE_FILE="$MC_DIR/mode"
MODEL_FILE="$MC_DIR/model"

# Colors
MAGENTA='\033[35m'
BRIGHT_MAGENTA='\033[1;35m'
DIM='\033[2m'
CYAN='\033[36m'
RESET='\033[0m'
# Box-drawing for visual distinction
VBAR='│'

# Check if MetaClaude is active
[ -f "$STATUS_FILE" ] || exit 0

enabled=$(jq -r '.enabled // false' "$STATUS_FILE" 2>/dev/null)
[ "$enabled" = "true" ] || exit 0

pending=$(jq -r '.pending // false' "$STATUS_FILE" 2>/dev/null)
injected=$(jq -r '.injected // false' "$STATUS_FILE" 2>/dev/null)

# Read mode
mode="dev"
[ -f "$MODE_FILE" ] && mode=$(cat "$MODE_FILE")

# Read model tag
MODEL_TAG="MCH"
if [ -f "$MODEL_FILE" ]; then
    MODEL_TAG=$(jq -r '.id // "mch"' "$MODEL_FILE" 2>/dev/null | tr '[:lower:]' '[:upper:]')
fi

# --- Indicator (always shown) ---
if [ "$pending" = "true" ]; then
    printf " ${BRIGHT_MAGENTA}◉ ${MODEL_TAG}${RESET}"
else
    printf " ${MAGENTA}○ ${MODEL_TAG}${RESET}"
fi

# --- Dev mode: show injection content ---
if [ "$mode" = "dev" ]; then
    # Show last injection if one just fired
    if [ "$injected" = "true" ] && [ -f "$DISPLAY_FILE" ]; then
        content=$(cat "$DISPLAY_FILE")
        if [ -n "$content" ]; then
            # Truncate long content for display
            display=$(echo "$content" | head -3 | cut -c1-120)
            printf "\n${DIM}${MAGENTA}${VBAR} injected:${RESET} ${DIM}%s${RESET}" "$display"
        fi
    fi

    # Show pending injection (any session — most recent wins)
    if [ "$pending" = "true" ]; then
        staged_file=$(ls -t "$MC_DIR"/sessions/*/injection 2>/dev/null | head -1)
        if [ -n "$staged_file" ]; then
            staged=$(head -3 "$staged_file" | cut -c1-120)
            if [ -n "$staged" ]; then
                printf "\n${DIM}${CYAN}${VBAR} staged:${RESET} ${DIM}%s${RESET}" "$staged"
            fi
        fi
    fi
fi

exit 0
