#!/usr/bin/env bash
# Weft harness installer.
# Registers skills globally, writes path resolution to ~/.claude/CLAUDE.md,
# and records everything in a manifest for clean uninstall.
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

# Verify the skills directory exists (sanity check)
if [ ! -d "$SKILLS_DIR" ]; then
  echo "Error: Skills directory not found at $SKILLS_DIR"
  echo "Are you running this from the weft repo root?"
  exit 1
fi

# ── Setup config directory ────────────────────────────────────────────

mkdir -p "$BACKUP_DIR"
echo "$HARNESS_ROOT" > "$CONFIG_DIR/root"

# Start building the manifest
CHANGES='[]'

# ── Backup and update settings.json ───────────────────────────────────

mkdir -p "$CLAUDE_DIR"

SETTINGS_BACKUP="$BACKUP_DIR/settings.json.$TIMESTAMP"
if [ -f "$SETTINGS_FILE" ]; then
  cp "$SETTINGS_FILE" "$SETTINGS_BACKUP"
else
  echo '{}' > "$SETTINGS_FILE"
  SETTINGS_BACKUP="(created)"
fi

# ── Migrate stale maestro entries ────────────────────────────────────

# Remove any additionalDirectories containing /maestro/
if jq -e '.permissions.additionalDirectories[]? | select(contains("/maestro/"))' "$SETTINGS_FILE" &>/dev/null; then
  jq '.permissions.additionalDirectories = [
    .permissions.additionalDirectories[] | select(contains("/maestro/") | not)
  ]' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
  echo "✓ Removed stale maestro entries from additionalDirectories"
fi

# Remove any SessionStart hooks containing /maestro/
if jq -e '.hooks.SessionStart[]? | select(.command // "" | contains("/maestro/"))' "$SETTINGS_FILE" &>/dev/null; then
  jq '.hooks.SessionStart = [
    .hooks.SessionStart[] | select(.command // "" | contains("/maestro/") | not)
  ]' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
  echo "✓ Removed stale maestro hook from SessionStart"
fi

# Add skills path to additionalDirectories (idempotent)
EXISTING=$(jq -r '.permissions.additionalDirectories // [] | .[]' "$SETTINGS_FILE" 2>/dev/null || true)
if ! echo "$EXISTING" | grep -qF "$SKILLS_DIR"; then
  jq --arg dir "$SKILLS_DIR" '
    .permissions.additionalDirectories = (
      (.permissions.additionalDirectories // []) + [$dir]
    )
  ' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"

  CHANGES=$(echo "$CHANGES" | jq --arg file "$SETTINGS_FILE" --arg val "$SKILLS_DIR" --arg bak "$SETTINGS_BACKUP" '. + [{
    file: $file,
    action: "added_to_array",
    key: "permissions.additionalDirectories",
    value: $val,
    backup: $bak
  }]')
  echo "✓ Registered skills in settings.json"
else
  echo "  Skills path already registered — skipping"
fi

# Add session-start hook (idempotent)
HOOK_CMD="bash $HOOKS_DIR/session-start.sh"
EXISTING_HOOKS=$(jq -r '.hooks.SessionStart // [] | .[].command // empty' "$SETTINGS_FILE" 2>/dev/null || true)
if ! echo "$EXISTING_HOOKS" | grep -qF "$HOOK_CMD"; then
  jq --arg cmd "$HOOK_CMD" '
    .hooks.SessionStart = (
      (.hooks.SessionStart // []) + [{
        type: "command",
        command: $cmd
      }]
    )
  ' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"

  CHANGES=$(echo "$CHANGES" | jq --arg file "$SETTINGS_FILE" --arg val "$HOOK_CMD" --arg bak "$SETTINGS_BACKUP" '. + [{
    file: $file,
    action: "added_to_array",
    key: "hooks.SessionStart",
    value: $val,
    backup: $bak
  }]')
  echo "✓ Registered session-start hook in settings.json"
else
  echo "  Session-start hook already registered — skipping"
fi

# ── Backup and write CLAUDE.md section ────────────────────────────────

CLAUDE_MD_ACTION=""
CLAUDE_MD_BACKUP="$BACKUP_DIR/CLAUDE.md.$TIMESTAMP"

SECTION=$(cat <<SECTION_EOF
<!-- weft:start -->
<!-- weft:section-version:1 -->
## Weft Harness

**Harness root:** $HARNESS_ROOT

### Path resolution

When skills reference harness files, resolve paths from the harness
root above — not from the current working directory:

- \`learning/*\` → \`$HARNESS_ROOT/learning/*\`
- \`background/*\` → \`$HARNESS_ROOT/background/*\`
- \`.claude/references/*\` → \`$HARNESS_ROOT/.claude/references/*\`
- \`.claude/consent.json\` → \`$HARNESS_ROOT/.claude/consent.json\`

When a skill says "read learning/current-state.md", read
\`$HARNESS_ROOT/learning/current-state.md\`.

### Architecture

Skills: \`$HARNESS_ROOT/.claude/skills/\` (registered globally)
References: \`$HARNESS_ROOT/.claude/references/\`
Learning state: \`$HARNESS_ROOT/learning/\`
Background materials: \`$HARNESS_ROOT/background/\`
<!-- weft:end -->
SECTION_EOF
)

if [ -f "$CLAUDE_MD" ]; then
  cp "$CLAUDE_MD" "$CLAUDE_MD_BACKUP"

  if grep -q '<!-- weft:start -->' "$CLAUDE_MD"; then
    # Verify matched marker pair before replacing
    START_COUNT=$(grep -c '<!-- weft:start -->' "$CLAUDE_MD" || true)
    END_COUNT=$(grep -c '<!-- weft:end -->' "$CLAUDE_MD" || true)
    if [ "$START_COUNT" -ne 1 ] || [ "$END_COUNT" -ne 1 ]; then
      echo "Error: CLAUDE.md has malformed weft markers (start=$START_COUNT, end=$END_COUNT)."
      echo "  Please fix manually, then re-run bootstrap."
      exit 1
    fi

    # Update: replace between markers (in place)
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
    CLAUDE_MD_ACTION="replaced_section"
    echo "✓ Updated weft section in CLAUDE.md"
  else
    # Append section
    printf '\n%s\n' "$SECTION" >> "$CLAUDE_MD"
    CLAUDE_MD_ACTION="appended_section"
    echo "✓ Appended weft section to CLAUDE.md"
  fi
else
  # Create new file
  printf '%s\n' "$SECTION" > "$CLAUDE_MD"
  CLAUDE_MD_ACTION="created"
  CLAUDE_MD_BACKUP="(created)"
  echo "✓ Created CLAUDE.md with weft section"
fi

CHANGES=$(echo "$CHANGES" | jq --arg file "$CLAUDE_MD" --arg action "$CLAUDE_MD_ACTION" --arg bak "$CLAUDE_MD_BACKUP" '. + [{
  file: $file,
  action: $action,
  markers: ["<!-- weft:start -->", "<!-- weft:end -->"],
  backup: $bak
}]')

# ── Write config.json (preserve existing) ─────────────────────────────

if [ ! -f "$CONFIG_DIR/config.json" ]; then
  echo '{ "updates": "notify" }' > "$CONFIG_DIR/config.json"
  echo "✓ Created config.json (update preference: notify)"
else
  echo "  config.json already exists — preserving"
fi

# ── Write manifest ────────────────────────────────────────────────────

jq -n --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg root "$HARNESS_ROOT" --argjson changes "$CHANGES" '{
  installed_at: $ts,
  harness_root: $root,
  changes: $changes
}' > "$MANIFEST_FILE"

echo "✓ Wrote manifest to $MANIFEST_FILE"

# ── Ensure learning and background directories ────────────────────────

mkdir -p "$HARNESS_ROOT/learning/session-logs"
mkdir -p "$HARNESS_ROOT/background"
echo "✓ Verified learning/ and background/ directories"

# ── Summary ───────────────────────────────────────────────────────────

echo ""
echo "════════════════════════════════════════════════════"
echo "  Weft harness installed"
echo "════════════════════════════════════════════════════"
echo ""
echo "  Harness root:  $HARNESS_ROOT"
echo "  Skills:        $SKILLS_DIR"
echo "  Learning:      $HARNESS_ROOT/learning/"
echo "  Background:    $HARNESS_ROOT/background/"
echo "  Backups:       $BACKUP_DIR"
echo "  Manifest:      $MANIFEST_FILE"
echo ""
echo "  Update preference: $(jq -r '.updates' "$CONFIG_DIR/config.json")"
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
