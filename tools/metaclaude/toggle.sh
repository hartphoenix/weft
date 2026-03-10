#!/usr/bin/env bash
# Toggle MetaClaude on/off and set mode
# Usage: toggle.sh [on|off]         — toggle or set enabled state
#        toggle.sh --dev             — enable in dev mode (full observability)
#        toggle.sh --prod            — enable in production mode (minimal UI)
#        toggle.sh mode [dev|prod]   — switch mode without toggling

MC_DIR="$HOME/.claude/metaclaude"
STATE_FILE="$MC_DIR/enabled"
STATUS_FILE="$MC_DIR/status"
MODE_FILE="$MC_DIR/mode"
MODEL_FILE="$MC_DIR/model"
INSTRUCTION_FILE="$MC_DIR/instruction"
LOG_DIR="$MC_DIR/logs"

mkdir -p "$MC_DIR" 2>/dev/null
mkdir -p "$LOG_DIR" 2>/dev/null

# Write helper — checks for permission errors
_write() {
    local dest="$1"
    shift
    if ! echo "$@" > "$dest" 2>/dev/null; then
        echo "ERROR: Cannot write to $dest (permission denied)" >&2
        return 1
    fi
}

_touch() {
    if ! touch "$1" 2>/dev/null; then
        echo "ERROR: Cannot write to $1 (permission denied)" >&2
        return 1
    fi
}

# Read current mode (default: dev)
current_mode() {
    if [ -f "$MODE_FILE" ]; then
        cat "$MODE_FILE"
    else
        echo "dev"
    fi
}

set_mode() {
    _write "$MODE_FILE" "$1" || return 1
}

set_model() {
    local flag="$1"
    local id name api_model backend
    case "$flag" in
        --sl) id="sl"; name="Qwen3-4B-Thinking"; api_model="qwen/qwen3-4b-thinking-2507"; backend="lmstudio" ;;
        --ml) id="ml"; name="Qwen3-8B"; api_model="qwen/qwen3-8b"; backend="lmstudio" ;;
        --ll) id="ll"; name="Gemma-3-12B"; api_model="google/gemma-3-12b"; backend="lmstudio" ;;
        --mch) id="mch"; name="Haiku"; api_model="haiku"; backend="claude-cli" ;;
        --mco) id="mco"; name="Opus-4.6"; api_model="claude-opus-4-6"; backend="claude-cli" ;;
        *) echo "Unknown model flag: $flag"; return 1 ;;
    esac
    local json
    json=$(jq -n \
        --arg id "$id" \
        --arg name "$name" \
        --arg api_model "$api_model" \
        --arg backend "$backend" \
        '{id: $id, name: $name, api_model: $api_model, backend: $backend}')
    _write "$MODEL_FILE" "$json" || return 1
    echo "Model: $name ($id)"
}

enable() {
    local mode=$(current_mode)
    _touch "$STATE_FILE" || return 1
    _write "$STATUS_FILE" "{\"enabled\":true,\"mode\":\"$mode\"}" || return 1
    echo "MetaClaude enabled (mode: $mode)"
}

disable() {
    rm -f "$STATE_FILE" 2>/dev/null
    _write "$STATUS_FILE" '{"enabled":false,"pending":false}' || return 1
    find "$MC_DIR/sessions" -name injection -delete 2>/dev/null || true
    rm -f "$INSTRUCTION_FILE" 2>/dev/null
    echo "MetaClaude disabled"
}

case "${1:-}" in
    --dev)
        set_mode "dev"
        enable
        ;;
    --prod)
        set_mode "prod"
        enable
        ;;
    mode)
        if [ "${2:-}" = "dev" ] || [ "${2:-}" = "prod" ]; then
            set_mode "$2"
            if [ -f "$STATE_FILE" ]; then
                enable  # refresh status with new mode
            else
                echo "Mode set to $2 (MetaClaude is off)"
            fi
        else
            echo "Usage: toggle.sh mode [dev|prod]"
            echo "Current mode: $(current_mode)"
        fi
        ;;
    on)
        enable
        ;;
    off)
        disable
        ;;
    --sl|--ml|--ll|--mch|--mco)
        set_model "$1"
        if [ ! -f "$STATE_FILE" ]; then
            enable
        fi
        ;;
    "")
        # Toggle
        if [ -f "$STATE_FILE" ]; then
            disable
        else
            enable
        fi
        ;;
    *)
        echo "Usage: toggle.sh [on|off|--dev|--prod|--sl|--ml|--ll|--mch|--mco|mode dev|mode prod]"
        echo "Models: --sl (Qwen3-4B) --ml (Qwen3-8B) --ll (Gemma-3-12B) --mch (Haiku) --mco (Opus)"
        ;;
esac
