#!/usr/bin/env bash
# guard.sh — PreToolUse hook
#
# Returns "ask" for:
#   1. Context-file mutations (CLAUDE.md, settings.json, skills, references, hooks)
#      Read-only Bash commands (ls, cat, grep, git log, etc.) pass through.
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

# --- Bash read-only detection for context-file paths ---
# Returns 0 if the command is purely read-only, 1 otherwise.
# Conservative: unknown commands gate. Three-stage check.

# Helper: check if a word appears at a command boundary in the string.
# Boundaries: start of string, whitespace, |, ;, &, (, )
has_mutative_word() {
  local cmd="$1" word="$2"
  [[ "$cmd" =~ (^|[[:space:]\|;\&\(\)])${word}([[:space:]\|;\&\(\)]|$) ]]
}

bash_is_readonly() {
  local cmd="$1"

  # Stage 1: Redirect scan
  # Strip harmless stderr redirects before checking for stdout redirects
  local clean="${cmd//2>\/dev\/null/}"
  clean="${clean//2>\&1/}"
  case "$clean" in
    *'>>'*|*'>'*) return 1 ;;
  esac

  # Stage 2: Mutative command scan (word-boundary matching)
  # Tier 1 — high frequency
  local w
  for w in rm mv cp mkdir touch chmod chown ln tee sed awk tar unzip \
           curl wget patch split truncate install rmdir unlink; do
    has_mutative_word "$cmd" "$w" && return 1
  done

  # Tier 1 — git subcommands (two-word phrases, substring match OK)
  local g
  for g in "git add" "git commit" "git push" "git pull" "git checkout" \
           "git switch" "git restore" "git reset" "git rebase" "git merge" \
           "git cherry-pick" "git revert" "git stash" "git clean" "git rm" \
           "git mv" "git tag" "git remote" "git config" "git init" \
           "git clone" "git worktree" "git submodule"; do
    case "$cmd" in
      *"$g"*) return 1 ;;
    esac
  done

  # Tier 2 — occasional
  for w in rsync scp docker brew apt pip pip3 npm npx yarn pnpm cargo \
           make cmake psql mysql sqlite3 ssh-keygen crontab kill killall \
           pkill xargs gzip gunzip zip; do
    has_mutative_word "$cmd" "$w" && return 1
  done

  # Tier 3 — rare but dangerous
  for w in dd mkfs fdisk sudo su shred chroot reboot shutdown halt poweroff; do
    has_mutative_word "$cmd" "$w" && return 1
  done

  # Conditionally mutative: find with destructive flags
  case "$cmd" in
    *find*-delete*|*find*-exec*|*find*-execdir*) return 1 ;;
  esac

  # Stage 3: First-token whitelist
  local first_token="${cmd%% *}"
  case "$first_token" in
    ls|stat|file|wc|du|head|tail|cat|less|more) return 0 ;;
    diff|colordiff|md5sum|shasum|sha256sum|sha1sum) return 0 ;;
    find|grep|rg|ag|ack|fgrep|egrep) return 0 ;;
    tree|realpath|basename|dirname|readlink) return 0 ;;
    hexdump|xxd|od|strings|jq|yq) return 0 ;;
    which|type|command|test|true|false|echo|printf) return 0 ;;
    git) # Read-only git subcommands only (mutative caught by Stage 2)
      case "$cmd" in
        "git log"*|"git diff"*|"git show"*|"git blame"*|"git status"*) return 0 ;;
        "git ls-files"*|"git ls-tree"*|"git rev-parse"*|"git describe"*) return 0 ;;
        "git shortlog"*|"git reflog"*|"git branch"*|"git name-rev"*) return 0 ;;
        *) return 1 ;;
      esac
      ;;
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

    # Category 1: Context-file paths in Bash commands (read-only = allow)
    for pattern in "/.claude/CLAUDE.md" "/.claude/settings.json" \
                   "/.claude/skills/" "/.claude/references/" "/.claude/hooks/"; do
      case "$COMMAND" in
        *"$pattern"*)
          if ! bash_is_readonly "$COMMAND"; then
            emit_ask "Bash targeting context-file: $pattern"
          fi
          ;;
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
