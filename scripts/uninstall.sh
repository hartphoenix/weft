#!/usr/bin/env bash
# Weft harness uninstaller.
# Reads the manifest and reverses exactly what bootstrap.sh did.
#
# Usage: bash scripts/uninstall.sh  (run from the weft repo root)

set -euo pipefail

CONFIG_DIR="$HOME/.config/weft"
MANIFEST_FILE="$CONFIG_DIR/manifest.json"
SETTINGS_FILE="$HOME/.claude/settings.json"
CLAUDE_MD="$HOME/.claude/CLAUDE.md"

# ── Check for manifest ────────────────────────────────────────────────

if [ ! -f "$MANIFEST_FILE" ]; then
  echo "No weft installation found (no manifest at $MANIFEST_FILE)."
  echo "Nothing to uninstall."
  exit 0
fi

HARNESS_ROOT=$(jq -r '.harness_root' "$MANIFEST_FILE")
echo "Uninstalling weft harness (root: $HARNESS_ROOT)"
echo ""

# ── Remove skills entry from settings.json ────────────────────────────

if [ -f "$SETTINGS_FILE" ]; then
  EXISTING=$(jq -r '.permissions.additionalDirectories // [] | .[]' "$SETTINGS_FILE" 2>/dev/null || true)

  if echo "$EXISTING" | grep -qF "$HARNESS_ROOT"; then
    jq --arg dir "$HARNESS_ROOT" '
      .permissions.additionalDirectories = (
        [.permissions.additionalDirectories[] | select(. != $dir)]
      )
    ' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
    echo "✓ Removed harness from settings.json"
  else
    echo "  Harness root not found in settings.json — skipping"
  fi

  # Remove session-start hook
  HOOK_CMD="bash $HARNESS_ROOT/.claude/hooks/session-start.sh"
  EXISTING_HOOKS=$(jq -r '.hooks.SessionStart // [] | .[].hooks[]?.command // empty' "$SETTINGS_FILE" 2>/dev/null || true)

  if echo "$EXISTING_HOOKS" | grep -qF "$HOOK_CMD"; then
    jq --arg cmd "$HOOK_CMD" '
      .hooks.SessionStart = [
        .hooks.SessionStart[] | select(.hooks | any(.command == $cmd) | not)
      ]
    ' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
    echo "✓ Removed session-start hook from settings.json"
  else
    echo "  Session-start hook not found in settings.json — skipping"
  fi
  # Also clean up any stale maestro entries
  MAESTRO_FOUND=false
  if jq -e '.permissions.additionalDirectories[]? | select(contains("/maestro/"))' "$SETTINGS_FILE" &>/dev/null; then
    jq '.permissions.additionalDirectories = [
      .permissions.additionalDirectories[] | select(contains("/maestro/") | not)
    ]' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
    MAESTRO_FOUND=true
  fi
  if jq -e '.hooks.SessionStart[]? | select(.command // "" | contains("/maestro/"))' "$SETTINGS_FILE" &>/dev/null; then
    jq '.hooks.SessionStart = [
      .hooks.SessionStart[] | select(.command // "" | contains("/maestro/") | not)
    ]' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
    MAESTRO_FOUND=true
  fi
  if [ "$MAESTRO_FOUND" = true ]; then
    echo "✓ Removed stale maestro entries from settings.json"
  fi
else
  echo "  settings.json not found — skipping"
fi

# ── Remove weft section from CLAUDE.md ─────────────────────────────

if [ -f "$CLAUDE_MD" ]; then
  if grep -q '<!-- weft:start -->' "$CLAUDE_MD"; then
    START_COUNT=$(grep -c '<!-- weft:start -->' "$CLAUDE_MD" || true)
    END_COUNT=$(grep -c '<!-- weft:end -->' "$CLAUDE_MD" || true)
    if [ "$START_COUNT" -ne 1 ] || [ "$END_COUNT" -ne 1 ]; then
      echo "Warning: CLAUDE.md has malformed weft markers (start=$START_COUNT, end=$END_COUNT)."
      echo "  Skipping marker-based removal. Check the file manually."
    else
      awk '
        /<!-- weft:start -->/ { skip=1; next }
        /<!-- weft:end -->/ { skip=0; next }
        !skip { print }
      ' "$CLAUDE_MD" > "$CLAUDE_MD.tmp"

      # Trim trailing blank lines left after section removal
      printf '%s\n' "$(cat "$CLAUDE_MD.tmp")" > "$CLAUDE_MD.tmp"

      # Check if the file is now effectively empty (only whitespace)
      if [ -z "$(tr -d '[:space:]' < "$CLAUDE_MD.tmp")" ]; then
        rm "$CLAUDE_MD" "$CLAUDE_MD.tmp"
        echo "✓ Deleted CLAUDE.md (was weft-only content)"
      else
        mv "$CLAUDE_MD.tmp" "$CLAUDE_MD"
        echo "✓ Removed weft section from CLAUDE.md"
      fi
    fi
  else
    echo "  No weft section found in CLAUDE.md — skipping"
  fi
else
  echo "  CLAUDE.md not found — skipping"
fi

# ── Preserve learning state (warn, never delete) ─────────────────────

LEARNING_DIR="$HARNESS_ROOT/learning"
if [ -d "$LEARNING_DIR" ]; then
  echo ""
  echo "⚠  Learning state at $LEARNING_DIR/ has NOT been deleted."
  echo "   Remove it manually if you want a clean uninstall:"
  echo "   rm -rf $LEARNING_DIR"
fi

# ── Print summary with backup paths ──────────────────────────────────

echo ""
echo "────────────────────────────────────────────────────"
echo "  Weft harness uninstalled"
echo "────────────────────────────────────────────────────"
echo ""
echo "  Backups (available until config dir is removed):"

BACKUP_DIR="$CONFIG_DIR/backups"
if [ -d "$BACKUP_DIR" ]; then
  for f in "$BACKUP_DIR"/*; do
    [ -f "$f" ] && echo "    $f"
  done
else
  echo "    (no backups found)"
fi

echo ""
echo "  To restore a backup, copy it to its original location."
echo "  Example: cp $BACKUP_DIR/settings.json.* ~/.claude/settings.json"
echo ""

# ── Remove config directory ───────────────────────────────────────────

echo "Removing $CONFIG_DIR/ ..."
rm -rf "$CONFIG_DIR"
echo "✓ Config directory removed"
echo ""
echo "Done. Skills are no longer globally registered."
