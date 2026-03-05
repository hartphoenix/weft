#!/usr/bin/env bash
# Weft harness installer.
# Symlinks skills into ~/.claude/skills/, registers directory permissions,
# writes path resolution to ~/.claude/CLAUDE.md, and records everything
# in a manifest for clean uninstall.
#
# Usage: bash scripts/bootstrap.sh  (run from the weft repo root)

set -euo pipefail

# ── Prereq check ──────────────────────────────────────────────────────

check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    echo "Error: $1 is required but not installed."
    echo "  $2"
    exit 1
  fi
}

check_cmd claude "Install Claude Code: https://docs.anthropic.com/en/docs/claude-code"
check_cmd gh     "Install GitHub CLI: https://cli.github.com/"
check_cmd git    "Install git: https://git-scm.com/"
check_cmd jq     "Install jq: https://jqlang.github.io/jq/download/"

# ── Paths ─────────────────────────────────────────────────────────────

HARNESS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS_DIR="$HARNESS_ROOT/.claude/skills"
HOOKS_DIR="$HARNESS_ROOT/.claude/hooks"
CONFIG_DIR="$HOME/.config/weft"
BACKUP_DIR="$CONFIG_DIR/backups"
CLAUDE_DIR="$HOME/.claude"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"
CLAUDE_MD="$CLAUDE_DIR/CLAUDE.md"
MANIFEST_FILE="$CONFIG_DIR/manifest.json"
TIMESTAMP=$(date +%s)

if [ ! -d "$SKILLS_DIR" ]; then
  echo "Error: Skills directory not found at $SKILLS_DIR"
  echo "Are you running this from the weft repo root?"
  exit 1
fi

# ── Config directory ──────────────────────────────────────────────────

mkdir -p "$BACKUP_DIR"
echo "$HARNESS_ROOT" > "$CONFIG_DIR/root"

# Learning state may live in a separate repo (e.g., private git repo).
# If learningRoot is set in config.json, learning/* paths resolve there.
LEARNING_ROOT="$HARNESS_ROOT"
if [ -f "$CONFIG_DIR/config.json" ]; then
  LR=$(jq -r '.learningRoot // empty' "$CONFIG_DIR/config.json" 2>/dev/null || true)
  if [ -n "$LR" ]; then
    LEARNING_ROOT="$LR"
  fi
fi

# ── Backup existing files ────────────────────────────────────────────

mkdir -p "$CLAUDE_DIR"

SETTINGS_BACKUP="$BACKUP_DIR/settings.json.$TIMESTAMP"
if [ -f "$SETTINGS_FILE" ]; then
  cp "$SETTINGS_FILE" "$SETTINGS_BACKUP"
else
  echo '{}' > "$SETTINGS_FILE"
  SETTINGS_BACKUP="(created)"
fi

CLAUDE_MD_BACKUP="$BACKUP_DIR/CLAUDE.md.$TIMESTAMP"
if [ -f "$CLAUDE_MD" ]; then
  cp "$CLAUDE_MD" "$CLAUDE_MD_BACKUP"
else
  CLAUDE_MD_BACKUP="(none)"
fi

# ── Symlink skills ───────────────────────────────────────────────────

mkdir -p "$CLAUDE_DIR/skills"

SYMLINKED=""
SKIPPED=""

for skill_dir in "$SKILLS_DIR"/*/; do
  [ -d "$skill_dir" ] || continue
  name=$(basename "$skill_dir")
  link="$CLAUDE_DIR/skills/$name"

  if [ -L "$link" ]; then
    existing=$(readlink "$link")
    if [ "$existing" = "$skill_dir" ] || [ "$existing" = "${skill_dir%/}" ]; then
      echo "  $name already linked — skipping"
      SYMLINKED="${SYMLINKED:+$SYMLINKED }$name"
      continue
    fi
  fi

  if [ -e "$link" ]; then
    echo "  Warning: ~/.claude/skills/$name already exists — skipping"
    SKIPPED="${SKIPPED:+$SKIPPED }$name"
    continue
  fi

  ln -s "$skill_dir" "$link"
  SYMLINKED="${SYMLINKED:+$SYMLINKED }$name"
  echo "✓ Linked $name"
done

# ── Resolve skill name collisions ────────────────────────────────────

if [ -n "$SKIPPED" ]; then
  # Guard: only offer rename once per invocation chain
  if [ "${WEFT_RETRY:-}" = "1" ]; then
    echo ""
    echo "Some skills still have conflicts after rename attempt."
    echo "Please resolve manually, then re-run bootstrap."
  else
    echo ""
    echo "These weft skills were skipped due to name conflicts:"
    echo ""
    for name in $SKIPPED; do
      desc=$(sed -n 's/^description: *//p' "$CLAUDE_DIR/skills/$name/SKILL.md" 2>/dev/null | head -1)
      echo "  $name — ${desc:-(no description found)}"
    done
    echo ""
    echo "Weft includes skills with these names. To install them, the"
    echo "existing skills need to be renamed."
    echo ""
    read -rp "Let Claude rename the conflicting skills? [y/N] " answer
    if [[ "$answer" =~ ^[Yy] ]]; then
      SKILL_LIST=""
      for name in $SKIPPED; do
        SKILL_LIST="${SKILL_LIST:+$SKILL_LIST, }$HOME/.claude/skills/$name/"
      done

      echo ""
      echo "Asking Claude to rename conflicting skills..."
      echo ""

      claude -p "I need to rename existing skills to make room for weft skills with the same names. For each skill directory listed below:

1. Read its SKILL.md to understand what the skill does
2. Choose a new name that reflects its purpose and avoids the original name
3. Rename the directory (mv ~/.claude/skills/oldname ~/.claude/skills/newname)
4. Report what you renamed and why

Skill directories to rename: $SKILL_LIST

After renaming, briefly explain what each skill does so the user knows how to invoke it under its new name."

      echo ""
      echo "Re-running bootstrap to link the freed names..."
      echo ""
      WEFT_RETRY=1 exec bash "$0"
    fi
  fi
fi

# ── Register directory permissions ───────────────────────────────────
# additionalDirectories grants the agent permission to read/write
# harness files (learning state, references, background) when working
# from a different project directory. Symlinks handle skill discovery;
# this handles file access.

EXISTING=$(jq -r '.permissions.additionalDirectories // [] | .[]' "$SETTINGS_FILE" 2>/dev/null || true)
if ! echo "$EXISTING" | grep -qF "$HARNESS_ROOT"; then
  jq --arg dir "$HARNESS_ROOT" '
    .permissions.additionalDirectories = (
      (.permissions.additionalDirectories // []) + [$dir]
    )
  ' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
  echo "✓ Registered harness directory permissions"
else
  echo "  Directory permissions already registered — skipping"
fi

# If learning root differs, register it too
if [ "$LEARNING_ROOT" != "$HARNESS_ROOT" ]; then
  if ! echo "$EXISTING" | grep -qF "$LEARNING_ROOT"; then
    jq --arg dir "$LEARNING_ROOT" '
      .permissions.additionalDirectories = (
        (.permissions.additionalDirectories // []) + [$dir]
      )
    ' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
    echo "✓ Registered learning root directory permissions"
  else
    echo "  Learning root permissions already registered — skipping"
  fi
fi

# ── Register session-start hook ──────────────────────────────────────

HOOK_CMD="bash $HOOKS_DIR/session-start.sh"
EXISTING_HOOKS=$(jq -r '.hooks.SessionStart // [] | .[].hooks[]?.command // empty' "$SETTINGS_FILE" 2>/dev/null || true)
if ! echo "$EXISTING_HOOKS" | grep -qF "$HOOK_CMD"; then
  jq --arg cmd "$HOOK_CMD" '
    .hooks.SessionStart = (
      (.hooks.SessionStart // []) + [{
        matcher: "",
        hooks: [{
          type: "command",
          command: $cmd
        }]
      }]
    )
  ' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
  echo "✓ Registered session-start hook"
else
  echo "  Session-start hook already registered — skipping"
fi

# ── Write CLAUDE.md section ──────────────────────────────────────────

SECTION=$(cat <<SECTION_EOF
<!-- weft:start -->
<!-- weft:section-version:1 -->
## Weft Harness

**Harness root:** $HARNESS_ROOT

### Path resolution

When skills reference harness files, resolve paths from the harness
root above — not from the current working directory:

- \`learning/*\` → \`$LEARNING_ROOT/learning/*\`
- \`background/*\` → \`$LEARNING_ROOT/background/*\`
- \`.claude/references/*\` → \`$HARNESS_ROOT/.claude/references/*\`
- \`.claude/consent.json\` → \`$HARNESS_ROOT/.claude/consent.json\`

When a skill says "read learning/current-state.md", read
\`$LEARNING_ROOT/learning/current-state.md\`.

### Architecture

Skills: \`$HARNESS_ROOT/.claude/skills/\` (symlinked globally)
References: \`$HARNESS_ROOT/.claude/references/\`
Learning state: \`$LEARNING_ROOT/learning/\`
Background materials: \`$LEARNING_ROOT/background/\`
<!-- weft:end -->
SECTION_EOF
)

CLAUDE_MD_ACTION=""
if [ -f "$CLAUDE_MD" ]; then
  if grep -q '<!-- weft:start -->' "$CLAUDE_MD"; then
    START_COUNT=$(grep -c '<!-- weft:start -->' "$CLAUDE_MD" || true)
    END_COUNT=$(grep -c '<!-- weft:end -->' "$CLAUDE_MD" || true)
    if [ "$START_COUNT" -ne 1 ] || [ "$END_COUNT" -ne 1 ]; then
      echo "Error: CLAUDE.md has malformed weft markers (start=$START_COUNT, end=$END_COUNT)."
      echo "  Please fix manually, then re-run bootstrap."
      exit 1
    fi

    SECTION_TMP=$(mktemp)
    printf '%s\n' "$SECTION" > "$SECTION_TMP"
    awk -v sfile="$SECTION_TMP" '
      /<!-- weft:start -->/ {
        while ((getline line < sfile) > 0) print line
        close(sfile)
        skip=1; next
      }
      /<!-- weft:end -->/ { skip=0; next }
      !skip { print }
    ' "$CLAUDE_MD" > "$CLAUDE_MD.tmp"
    rm -f "$SECTION_TMP"
    mv "$CLAUDE_MD.tmp" "$CLAUDE_MD"
    CLAUDE_MD_ACTION="replaced"
    echo "✓ Updated weft section in CLAUDE.md"
  else
    printf '\n%s\n' "$SECTION" >> "$CLAUDE_MD"
    CLAUDE_MD_ACTION="appended"
    echo "✓ Appended weft section to CLAUDE.md"
  fi
else
  printf '%s\n' "$SECTION" > "$CLAUDE_MD"
  CLAUDE_MD_ACTION="created"
  CLAUDE_MD_BACKUP="(created)"
  echo "✓ Created CLAUDE.md with weft section"
fi

# ── Write config.json (preserve existing) ────────────────────────────
# The session-start hook reads updates preference from this file.

if [ ! -f "$CONFIG_DIR/config.json" ]; then
  echo '{ "updates": "notify", "digestInterval": 3, "digestMode": "suggest", "progressReviewDays": 3, "progressReviewSessions": 5 }' > "$CONFIG_DIR/config.json"
  echo "✓ Created config.json (updates: notify, digest: every 3 days, progress review: every 3 days / 5 sessions)"
else
  echo "  config.json already exists — preserving"
fi

# ── Ensure directories ───────────────────────────────────────────────

mkdir -p "$LEARNING_ROOT/learning/session-logs"
mkdir -p "$LEARNING_ROOT/background"

# ── Write manifest ───────────────────────────────────────────────────

# Convert space-delimited lists to JSON arrays
to_json_array() {
  if [ -z "$1" ]; then echo '[]'; return; fi
  echo "$1" | tr ' ' '\n' | jq -R 'select(length > 0)' | jq -s .
}

SYMLINKED_JSON=$(to_json_array "$SYMLINKED")
SKIPPED_JSON=$(to_json_array "$SKIPPED")

jq -n \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg root "$HARNESS_ROOT" \
  --argjson symlinks "$SYMLINKED_JSON" \
  --argjson skipped "$SKIPPED_JSON" \
  --arg hook "$HOOK_CMD" \
  --arg additional_dir "$HARNESS_ROOT" \
  --arg claude_md "$CLAUDE_MD_ACTION" \
  --arg settings_backup "$SETTINGS_BACKUP" \
  --arg claude_md_backup "$CLAUDE_MD_BACKUP" \
  '{
    installed_at: $ts,
    harness_root: $root,
    symlinks: $symlinks,
    skipped: $skipped,
    hook: $hook,
    additional_directory: $additional_dir,
    claude_md: $claude_md,
    settings_backup: $settings_backup,
    claude_md_backup: $claude_md_backup
  }' > "$MANIFEST_FILE"

# ── Summary ──────────────────────────────────────────────────────────

SKILL_COUNT=$(echo "$SYMLINKED" | wc -w | tr -d ' ')
SKIP_COUNT=$(echo "$SKIPPED" | wc -w | tr -d ' ')

echo ""
echo "════════════════════════════════════════════════════"
echo "  Weft harness installed"
echo "════════════════════════════════════════════════════"
echo ""
echo "  Harness root:  $HARNESS_ROOT"
echo "  Skills linked: $SKILL_COUNT"
if [ "$SKIP_COUNT" -gt 0 ]; then
echo "  Skills skipped: $SKIP_COUNT (pre-existing)"
fi
echo "  Learning:      $LEARNING_ROOT/learning/"
echo "  Background:    $LEARNING_ROOT/background/"
echo "  Manifest:      $MANIFEST_FILE"
echo ""
echo "  Next steps:"
echo "    1. Start Claude Code in any project directory"
echo "    2. Run /intake to set up your learning profile"
echo "    3. (Optional) Drop materials in background/ first"
echo "       for a sharper starting profile"
echo ""
echo "  To update:    cd $HARNESS_ROOT && git pull"
echo "  To uninstall: bash $HARNESS_ROOT/scripts/uninstall.sh"
echo ""
