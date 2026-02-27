#!/usr/bin/env bash
# Weft harness uninstaller.
# Reads the manifest and reverses exactly what bootstrap.sh did.
#
# Usage: bash scripts/uninstall.sh  (run from the weft repo root)

set -euo pipefail

CONFIG_DIR="$HOME/.config/weft"
MANIFEST_FILE="$CONFIG_DIR/manifest.json"
SETTINGS_FILE="$HOME/.claude/settings.json"
CLAUDE_DIR="$HOME/.claude"
CLAUDE_MD="$CLAUDE_DIR/CLAUDE.md"

# ── Check for manifest ───────────────────────────────────────────────

if [ ! -f "$MANIFEST_FILE" ]; then
  echo "No weft installation found (no manifest at $MANIFEST_FILE)."
  echo "Nothing to uninstall."
  exit 0
fi

HARNESS_ROOT=$(jq -r '.harness_root' "$MANIFEST_FILE")
SKILLS_DIR="$HARNESS_ROOT/.claude/skills"
echo "Uninstalling weft harness (root: $HARNESS_ROOT)"
echo ""

# ── Remove skill symlinks ────────────────────────────────────────────

REMOVED=0
for name in $(jq -r '.symlinks[]' "$MANIFEST_FILE" 2>/dev/null); do
  link="$CLAUDE_DIR/skills/$name"
  if [ -L "$link" ]; then
    existing=$(readlink "$link")
    if [ "$existing" = "$SKILLS_DIR/$name/" ] || [ "$existing" = "$SKILLS_DIR/$name" ]; then
      rm "$link"
      echo "✓ Removed $name"
      REMOVED=$((REMOVED + 1))
    else
      echo "  Skipping $name — symlink points elsewhere"
    fi
  elif [ -e "$link" ]; then
    echo "  Skipping $name — not a symlink"
  else
    echo "  $name already gone — skipping"
  fi
done

# ── Remove harness from additionalDirectories ────────────────────────

if [ -f "$SETTINGS_FILE" ]; then
  EXISTING=$(jq -r '.permissions.additionalDirectories // [] | .[]' "$SETTINGS_FILE" 2>/dev/null || true)
  if echo "$EXISTING" | grep -qF "$HARNESS_ROOT"; then
    jq --arg dir "$HARNESS_ROOT" '
      .permissions.additionalDirectories = (
        [.permissions.additionalDirectories[] | select(. != $dir)]
      )
    ' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
    echo "✓ Removed harness from additionalDirectories"
  else
    echo "  Harness not found in additionalDirectories — skipping"
  fi
else
  echo "  settings.json not found — skipping additionalDirectories"
fi

# ── Remove session-start hook ────────────────────────────────────────

if [ -f "$SETTINGS_FILE" ]; then
  HOOK_CMD=$(jq -r '.hook' "$MANIFEST_FILE")
  EXISTING_HOOKS=$(jq -r '.hooks.SessionStart // [] | .[].hooks[]?.command // empty' "$SETTINGS_FILE" 2>/dev/null || true)

  if echo "$EXISTING_HOOKS" | grep -qF "$HOOK_CMD"; then
    jq --arg cmd "$HOOK_CMD" '
      .hooks.SessionStart = [
        .hooks.SessionStart[] | select(.hooks | any(.command == $cmd) | not)
      ]
    ' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
    echo "✓ Removed session-start hook"
  else
    echo "  Session-start hook not found — skipping"
  fi
else
  echo "  settings.json not found — skipping hook"
fi

# ── Remove CLAUDE.md section ────────────────────────────────────────

if [ -f "$CLAUDE_MD" ]; then
  if grep -q '<!-- weft:start -->' "$CLAUDE_MD"; then
    START_COUNT=$(grep -c '<!-- weft:start -->' "$CLAUDE_MD" || true)
    END_COUNT=$(grep -c '<!-- weft:end -->' "$CLAUDE_MD" || true)
    if [ "$START_COUNT" -ne 1 ] || [ "$END_COUNT" -ne 1 ]; then
      echo "Warning: CLAUDE.md has malformed weft markers — skipping"
    else
      awk '
        /<!-- weft:start -->/ { skip=1; next }
        /<!-- weft:end -->/ { skip=0; next }
        !skip { print }
      ' "$CLAUDE_MD" > "$CLAUDE_MD.tmp"

      # Trim trailing blank lines
      printf '%s\n' "$(cat "$CLAUDE_MD.tmp")" > "$CLAUDE_MD.tmp"

      if [ -z "$(tr -d '[:space:]' < "$CLAUDE_MD.tmp")" ]; then
        rm "$CLAUDE_MD" "$CLAUDE_MD.tmp"
        echo "✓ Deleted CLAUDE.md (was weft-only content)"
      else
        mv "$CLAUDE_MD.tmp" "$CLAUDE_MD"
        echo "✓ Removed weft section from CLAUDE.md"
      fi
    fi
  else
    echo "  No weft section in CLAUDE.md — skipping"
  fi
else
  echo "  CLAUDE.md not found — skipping"
fi

# ── Preserve learning state ──────────────────────────────────────────

LEARNING_DIR="$HARNESS_ROOT/learning"
if [ -d "$LEARNING_DIR" ]; then
  echo ""
  echo "Note: Learning state at $LEARNING_DIR/ has NOT been deleted."
  echo "  Remove manually if you want a clean uninstall:"
  echo "  rm -rf $LEARNING_DIR"
fi

# ── Summary and cleanup ─────────────────────────────────────────────

echo ""
echo "────────────────────────────────────────────────────"
echo "  Weft harness uninstalled"
echo "────────────────────────────────────────────────────"
echo ""

BACKUP_DIR="$CONFIG_DIR/backups"
if [ -d "$BACKUP_DIR" ]; then
  echo "  Backups (will be removed with config dir):"
  for f in "$BACKUP_DIR"/*; do
    [ -f "$f" ] && echo "    $f"
  done
  echo ""
fi

rm -rf "$CONFIG_DIR"
echo "✓ Removed $CONFIG_DIR/"
echo ""
echo "Done. $REMOVED skill symlinks removed."
