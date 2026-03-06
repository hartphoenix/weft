#!/usr/bin/env bash
# guard.sh — PreToolUse hook
#
# Returns "ask" for:
#   1. Context-file writes (CLAUDE.md, settings.json, skills, references, hooks)
#   2. Security-sensitive Bash commands (shell metacommands, certain gh/git config ops)
#   3. Environment file writes (.env, .env.*)
#
# Exit 0 with no output = allow (passthrough).

set -euo pipefail

INPUT=$(cat)

TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name')

emit_ask() {
  local reason="$1"
  jq -n --arg r "$reason" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: $r
    }
  }'
  exit 0
}

# --- Category 1: Context-file path check ---

is_context_file() {
  local path="$1"
  case "$path" in
    */.claude/CLAUDE.md|*/.claude/settings.json) return 0 ;;
    */.claude/skills/*|*/.claude/references/*|*/.claude/hooks/*) return 0 ;;
    *) return 1 ;;
  esac
}

# --- Category 3: Env file check ---

is_env_file() {
  local path="$1"
  case "$path" in
    */.env|*/.env.*) return 0 ;;
    *) return 1 ;;
  esac
}

# --- Category 4: Git-internal file check ---

is_git_internal() {
  local path="$1"
  case "$path" in
    */.gitmodules) return 0 ;;
    *) return 1 ;;
  esac
}

case "$TOOL_NAME" in
  Write|Edit)
    FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')
    if [ -n "$FILE_PATH" ]; then
      if is_context_file "$FILE_PATH"; then
        emit_ask "Context-file write: $FILE_PATH"
      fi
      if is_env_file "$FILE_PATH"; then
        emit_ask "Environment file write: $FILE_PATH"
      fi
      if is_git_internal "$FILE_PATH"; then
        emit_ask "Git-internal file write: $FILE_PATH"
      fi
    fi
    ;;
  Bash)
    COMMAND=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')

    # Category 1: Context-file paths in Bash commands
    for pattern in "/.claude/CLAUDE.md" "/.claude/settings.json" \
                   "/.claude/skills/" "/.claude/references/" "/.claude/hooks/"; do
      case "$COMMAND" in
        *"$pattern"*) emit_ask "Bash targeting context-file: $pattern" ;;
      esac
    done

    # Category 2: Security-sensitive commands
    case "$COMMAND" in
      "bash -c "*)                           emit_ask "Shell metacommand: bash -c" ;;
      "sh -c "*)                             emit_ask "Shell metacommand: sh -c" ;;
      "gh repo create"*)                     emit_ask "GitHub: repo create (unsandboxed)" ;;
      "gh secret set"*)                      emit_ask "GitHub: secret set (unsandboxed)" ;;
      "gh variable set"*)                    emit_ask "GitHub: variable set (unsandboxed)" ;;
      "gh run rerun"*)                       emit_ask "GitHub: run rerun (unsandboxed)" ;;
      *"git config core.hooksPath"*)         emit_ask "Git config: core.hooksPath (persistence vector)" ;;
      *"git config credential."*)            emit_ask "Git config: credential helper (persistence vector)" ;;
    esac
    ;;
esac

# Default: allow (no output)
exit 0
