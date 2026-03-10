#!/usr/bin/env bash
# MetaClaude Observer — async Stop hook
# Reads conversation transcript, sends to Context Claude, stages injection.
# Logs structured per-session observations to weft-dev/meta/.
# Also dual-writes to legacy daily JSONL until migration is verified.

set -euo pipefail

MC_DIR="$HOME/.claude/metaclaude"
STATE_FILE="$MC_DIR/enabled"
STATUS_FILE="$MC_DIR/status"
MODE_FILE="$MC_DIR/mode"
MODEL_FILE="$MC_DIR/model"
INSTRUCTION_FILE="$MC_DIR/instruction"
LOG_DIR="$MC_DIR/logs"
PROMPT_FILE="$(dirname "$0")/prompt.md"
NOTEPAD_DIR="${METACLAUDE_NOTEPAD_DIR:-$HOME/Documents/GitHub/roger/notepad}"
META_LOG_DIR="/Users/rhhart/Documents/GitHub/weft-dev/meta"

# Read model config
if [ -f "$MODEL_FILE" ]; then
    API_MODEL=$(jq -r '.api_model' "$MODEL_FILE")
    BACKEND=$(jq -r '.backend' "$MODEL_FILE")
    MODEL_NAME=$(jq -r '.name' "$MODEL_FILE")
    OBS_MODE=$(jq -r '.id' "$MODEL_FILE")
else
    API_MODEL="haiku"
    BACKEND="claude-cli"
    MODEL_NAME="haiku"
    OBS_MODE="mch"
fi

mkdir -p "$LOG_DIR"

# Exit silently if MetaClaude is disabled
[ -f "$STATE_FILE" ] || exit 0

# Read display mode
MODE="dev"
[ -f "$MODE_FILE" ] && MODE=$(cat "$MODE_FILE")

# Read hook input
INPUT=$(cat)
TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // empty')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
PERMISSION_MODE=$(echo "$INPUT" | jq -r '.permission_mode // empty')
HOOK_EVENT=$(echo "$INPUT" | jq -r '.hook_event_name // empty')
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')
LAST_ASSISTANT_MSG=$(echo "$INPUT" | jq -r '.last_assistant_message // empty' | head -c 2000)

if [ -z "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ]; then
    exit 0
fi

# --- Session log setup ---
SESSION_UUID=$(basename "$TRANSCRIPT_PATH" .jsonl)
SESSION_DATE=$(date +%Y-%m-%d)
SESSION_LOG="$META_LOG_DIR/${SESSION_DATE}_${SESSION_UUID:0:8}.jsonl"

# --- Per-session state directory ---
SESSION_SHORT="${SESSION_UUID:0:8}"
SESSION_DIR="$MC_DIR/sessions/$SESSION_SHORT"
mkdir -p "$SESSION_DIR"
INJECTION_FILE="$SESSION_DIR/injection"
ACCUMULATOR_FILE="$SESSION_DIR/accumulator"
FINGERPRINT_FILE="$SESSION_DIR/fingerprint"
SESSION_LOG_POINTER="$SESSION_DIR/session-log"

if [ ! -f "$SESSION_LOG" ]; then
    mkdir -p "$META_LOG_DIR"
    jq -n \
        --arg sid "$SESSION_UUID" \
        --arg hook_sid "$SESSION_ID" \
        --arg tp "$TRANSCRIPT_PATH" \
        --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --arg obs_mode "$OBS_MODE" \
        --arg model "$MODEL_NAME" \
        --arg cwd "$CWD" \
        --arg perm "$PERMISSION_MODE" \
        '{type:"session_header", session_id:$sid, hook_session_id:$hook_sid, transcript_path:$tp, started_at:$ts, observation_mode:$obs_mode, model:$model, cwd:$cwd, permission_mode:$perm}' \
        > "$SESSION_LOG"
    rm -f "$ACCUMULATOR_FILE"
    rm -f "$FINGERPRINT_FILE"
fi

echo "$SESSION_LOG" > "$SESSION_LOG_POINTER"

# --- Track timing ---
START_TIME=$(date +%s%3N 2>/dev/null || date +%s000)

# Extract recent turns from transcript.
# Transcript types: user (has .message.content as string),
#   assistant (has .message.content as array of {type,text} blocks),
#   progress, system, file-history-snapshot (all noise — skip).
# For assistant blocks, extract text and tool_use names; skip thinking.
RECENT=$(tail -50 "$TRANSCRIPT_PATH" | jq -s '
    [.[] | select(.type == "user" or .type == "assistant") |
     {role: .type, content: (
         if .type == "user" then
             if (.message.content | type) == "string" then
                 .message.content | .[0:2000]
             else "" end
         else
             [(.message.content // [])[] |
              if .type == "text" then .text
              elif .type == "tool_use" then ("[" + .name + "]")
              else empty end
             ] | join("\n") | .[0:2000]
         end
     )} | select(.content | length > 0)
    ]
    | [ reduce .[] as $item (
        [];
        if ($item.content | test("^\\[.+\\]$"))
        then
          if (length > 0 and (.[-1] | has("_tools")))
          then .[-1]._tools += [$item.content[1:-1]]
          else . + [{"_tools": [$item.content[1:-1]]}]
          end
        else . + [$item]
        end
      ) | .[] |
      if has("_tools")
      then {"role":"assistant","content":(._tools | group_by(.) | map("\(.[0]) x\(length)") | join(", ") | "[tools: \(.)]")}
      else .
      end
    ]
    | .[-10:]
' 2>/dev/null || echo "[]")

# Count actual conversation turns for session-phase awareness
TURN_COUNT=$(echo "$RECENT" | jq '[.[] | select(.role == "user")] | length' 2>/dev/null || echo 0)

# Read accumulator (empty string if absent or first observation)
ACCUMULATOR=""
if [ -f "$ACCUMULATOR_FILE" ]; then
    ACCUMULATOR=$(awk -v max=500 '{
        if (len + length + 1 > max) exit
        if (NR > 1) { printf "\n"; len++ }
        printf "%s", $0
        len += length
    }' "$ACCUMULATOR_FILE")
fi

# --- Fingerprint skip: avoid inference when window hasn't changed ---
WINDOW_FINGERPRINT=$(echo "$RECENT" | jq -r '
  [.[] | select(.content | test("^\\[tools: ") | not) |
   .role + ":" + .content] | join("|")
' 2>/dev/null | shasum | cut -d' ' -f1)

LAST_FINGERPRINT=""
if [ -f "$FINGERPRINT_FILE" ]; then
    LAST_FINGERPRINT=$(cat "$FINGERPRINT_FILE")
fi
printf '%s' "$WINDOW_FINGERPRINT" > "$FINGERPRINT_FILE"

if [ "$WINDOW_FINGERPRINT" = "$LAST_FINGERPRINT" ] && [ -n "$ACCUMULATOR" ]; then
    TURN=$(( $(wc -l < "$SESSION_LOG") ))
    jq -n \
        --argjson turn "$TURN" \
        --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --arg reason "window_unchanged" \
        --arg fp "$WINDOW_FINGERPRINT" \
        '{type:"observation_skipped", turn:$turn, timestamp:$ts, reason:$reason, fingerprint:$fp}' \
        >> "$SESSION_LOG"
    exit 0
fi

# Notepad file list — disabled until embedding index provides
# relevance-filtered context. Sending the full list every turn
# caused the model to fixate on notepad regardless of relevance.
# NOTEPAD_FILES="[]"
# if [ -d "$NOTEPAD_DIR" ]; then
#     NOTEPAD_FILES=$(ls -1 "$NOTEPAD_DIR" 2>/dev/null | grep -v '^\.' | jq -R -s 'split("\n") | map(select(. != ""))' 2>/dev/null || echo "[]")
# fi

# Read the metacognitive prompt
if [ ! -f "$PROMPT_FILE" ]; then
    exit 0
fi
SYSTEM_PROMPT=$(cat "$PROMPT_FILE")

# Append session instruction if present
if [ -f "$INSTRUCTION_FILE" ]; then
    INSTRUCTION=$(cat "$INSTRUCTION_FILE")
    if [ -n "$INSTRUCTION" ]; then
        SYSTEM_PROMPT="$SYSTEM_PROMPT

## Session instruction (from the user)

$INSTRUCTION"
    fi
fi

# Compose the payload for Context Claude
USER_MESSAGE=$(jq -n \
    --argjson recent "$RECENT" \
    --argjson turn_count "$TURN_COUNT" \
    --arg accumulator "$ACCUMULATOR" \
    '{recent_turns: $recent, user_turn_count: $turn_count, accumulator: $accumulator}')

# --- Inference ---
INFERENCE_ERROR=""
RAW_RESPONSE=""
if [ "$BACKEND" = "lmstudio" ]; then
    if ! RAW_RESPONSE=$(curl -s --max-time 30 \
        http://localhost:1234/v1/chat/completions \
        -H "Content-Type: application/json" \
        -d "$(jq -n \
            --arg model "$API_MODEL" \
            --arg system "$SYSTEM_PROMPT" \
            --arg user "$USER_MESSAGE" \
            '{model: $model, messages: [{role: "system", content: $system}, {role: "user", content: $user}], temperature: 0.7}'
        )" 2>&1); then
        INFERENCE_ERROR="$RAW_RESPONSE"
        RAW_RESPONSE=""
    fi
    # Check for LM Studio error response
    if [ -n "$RAW_RESPONSE" ]; then
        LMS_ERROR=$(echo "$RAW_RESPONSE" | jq -r '.error.message // empty' 2>/dev/null)
        if [ -n "$LMS_ERROR" ]; then
            INFERENCE_ERROR="LM Studio: $LMS_ERROR"
            RAW_RESPONSE=""
        fi
    fi
else
    if ! RAW_RESPONSE=$(echo "$USER_MESSAGE" | claude -p \
        --model "$API_MODEL" \
        --system-prompt "$SYSTEM_PROMPT" \
        --no-session-persistence \
        --output-format json \
        2>&1); then
        INFERENCE_ERROR="$RAW_RESPONSE"
        RAW_RESPONSE=""
    fi
fi

# Parse response — two paths: full (for logging) and clean (for injection)
FULL_RESPONSE=""
CLEAN_RESPONSE=""
INFERENCE_META="{}"
if [ -n "$RAW_RESPONSE" ]; then
    if [ "$BACKEND" = "lmstudio" ]; then
        FULL_RESPONSE=$(echo "$RAW_RESPONSE" | jq -r '.choices[0].message.content // empty' 2>/dev/null)
        INFERENCE_META=$(echo "$RAW_RESPONSE" | jq '{model: .model, usage: .usage, finish_reason: .choices[0].finish_reason}' 2>/dev/null || echo '{}')
    else
        FULL_RESPONSE=$(echo "$RAW_RESPONSE" | jq -r '.result // .content // .text // empty' 2>/dev/null)
        if [ -z "$FULL_RESPONSE" ]; then FULL_RESPONSE="$RAW_RESPONSE"; fi
        INFERENCE_META=$(echo "$RAW_RESPONSE" | jq '{model: .model, usage: .usage, stop_reason: .stop_reason}' 2>/dev/null || echo '{}')
    fi

    # Strip thinking tags for injection path (handles both closed and truncated/unclosed tags)
    CLEAN_RESPONSE=$(printf '%s' "$FULL_RESPONSE" | perl -0777 -pe 's/<think>.*?<\/think>\s*//gs; s/<thinking>.*?<\/thinking>\s*//gs; s/<think>.*\z//gs; s/<thinking>.*\z//gs')
fi

END_TIME=$(date +%s%3N 2>/dev/null || date +%s000)
LATENCY_MS=$(( END_TIME - START_TIME ))

# --- Derive turn number ---
TURN=$(( $(wc -l < "$SESSION_LOG") ))

# --- Handle inference error ---
if [ -n "$INFERENCE_ERROR" ]; then
    jq -n \
        --argjson turn "$TURN" \
        --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --arg stage "inference_1" \
        --arg err "$INFERENCE_ERROR" \
        --argjson latency "$LATENCY_MS" \
        '{type:"error", turn:$turn, timestamp:$ts, stage:$stage, error:$err, latency_ms:$latency}' \
        >> "$SESSION_LOG"
    exit 0
fi

# --- Parse structured response ---
# Format: <inject>...</inject> <context>...</context>
# Tested at 5/5 compliance on Qwen3-8B. Fallback: if no tags found,
# treat entire response as injection (pre-accumulator behavior).
INJECT_CONTENT=""
CONTEXT_CONTENT=""
PARSE_SUCCESS=false

# Extract content between tags (handles multiline, leading/trailing whitespace)
if printf '%s' "$CLEAN_RESPONSE" | grep -qi '<inject>'; then
    INJECT_CONTENT=$(printf '%s' "$CLEAN_RESPONSE" | perl -0777 -ne 'print $1 if /<inject>(.*?)<\/inject>/si')
    PARSE_SUCCESS=true
fi

if printf '%s' "$CLEAN_RESPONSE" | grep -qi '<context>'; then
    CONTEXT_CONTENT=$(printf '%s' "$CLEAN_RESPONSE" | perl -0777 -ne 'print $1 if /<context>(.*?)<\/context>/si')
fi

# Fallback: no <inject> tag → entire response is injection
if [ "$PARSE_SUCCESS" = "false" ]; then
    INJECT_CONTENT="$CLEAN_RESPONSE"
    CONTEXT_CONTENT=""
fi

# Trim whitespace including leading/trailing newlines (perl -0777 treats as single string)
INJECT_CONTENT=$(printf '%s' "$INJECT_CONTENT" | perl -0777 -pe 's/\A\s+//; s/\s+\z//')
CONTEXT_CONTENT=$(printf '%s' "$CONTEXT_CONTENT" | perl -0777 -pe 's/\A\s+//; s/\s+\z//')

# Apply silence sentinel
TRIMMED="$INJECT_CONTENT"
if [ "$TRIMMED" = "[no comment]" ]; then
    TRIMMED=""
fi

# Determine decision
if [ -n "$TRIMMED" ] && [ "$TRIMMED" != "null" ]; then
    DECISION="inject"
    INJECTION_CONTENT="$TRIMMED"
    echo "$TRIMMED" > "$INJECTION_FILE"

    jq -n \
        --arg mode "$MODE" \
        '{enabled: true, pending: true, injected: false, mode: $mode}' \
        > "$STATUS_FILE"
else
    DECISION="silent"
    INJECTION_CONTENT=""
    rm -f "$INJECTION_FILE"

    jq -n \
        --arg mode "$MODE" \
        '{enabled: true, pending: false, injected: false, mode: $mode}' \
        > "$STATUS_FILE"
fi

# Update accumulator if we got valid context from the model
if [ -n "$CONTEXT_CONTENT" ]; then
    printf '%s' "$CONTEXT_CONTENT" > "$ACCUMULATOR_FILE"
fi
# If parse failed or CONTEXT empty: leave existing accumulator untouched

# --- Structured session log entry ---
CTX_TURNS=$(echo "$RECENT" | jq 'length' 2>/dev/null || echo 0)
USER_MSG_LOG=$(printf '%.2000s' "$USER_MESSAGE")

jq -n \
    --argjson turn "$TURN" \
    --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg obs_mode "$OBS_MODE" \
    --arg model_name "$MODEL_NAME" \
    --argjson ctx_turns "$CTX_TURNS" \
    --argjson user_turns "$TURN_COUNT" \
    --argjson latency "$LATENCY_MS" \
    --arg decision "$DECISION" \
    --arg content "$INJECTION_CONTENT" \
    --arg full_resp "$FULL_RESPONSE" \
    --arg user_msg "$USER_MSG_LOG" \
    --arg sid "$SESSION_ID" \
    --arg cwd "$CWD" \
    --arg perm "$PERMISSION_MODE" \
    --arg hook_event "$HOOK_EVENT" \
    --arg stop_active "$STOP_HOOK_ACTIVE" \
    --arg last_msg "$LAST_ASSISTANT_MSG" \
    --argjson inf_meta "$INFERENCE_META" \
    --arg accumulator_in "$ACCUMULATOR" \
    --arg accumulator_out "$CONTEXT_CONTENT" \
    '{type:"observation", turn:$turn, timestamp:$ts, mode:$obs_mode, model_name:$model_name,
      session_id:$sid, cwd:$cwd, permission_mode:$perm,
      hook_event_name:$hook_event, stop_hook_active:$stop_active,
      last_assistant_message:$last_msg,
      context_window:{transcript_turns_used:$ctx_turns, user_turns:$user_turns},
      pipeline:{inference_1:{purpose:"assess_and_decide", latency_ms:$latency, metadata:$inf_meta}},
      decision:$decision,
      accumulator_in:$accumulator_in,
      accumulator_out:$accumulator_out,
      full_response:$full_resp,
      user_message:$user_msg,
      total_latency_ms:$latency}
    + if $content != "" then {injection_content:$content} else {} end' \
    >> "$SESSION_LOG"

# --- Legacy daily JSONL (dual-write, remove after migration) ---
LOG_FILE="$LOG_DIR/$(date +%Y-%m-%d).jsonl"
if [ "$DECISION" = "inject" ]; then
    jq -n \
        --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --arg content "$INJECTION_CONTENT" \
        --arg mode "$MODE" \
        --argjson latency_ms "$LATENCY_MS" \
        '{timestamp: $ts, type: "observation", content: $content, latency_ms: $latency_ms, mode: $mode, action: "staged"}' \
        >> "$LOG_FILE"
else
    jq -n \
        --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --argjson latency_ms "$LATENCY_MS" \
        --arg mode "$MODE" \
        '{timestamp: $ts, type: "observation", content: null, latency_ms: $latency_ms, mode: $mode, action: "silent"}' \
        >> "$LOG_FILE"
fi

exit 0
