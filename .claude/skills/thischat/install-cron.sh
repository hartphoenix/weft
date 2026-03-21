#!/usr/bin/env bash
# Generates and installs the launchd plist for session-archive.
# Run from anywhere — resolves paths from ~/.config/weft/root.
set -euo pipefail

WEFT_ROOT="$(cat ~/.config/weft/root)"
SKILL_DIR="$WEFT_ROOT/.claude/skills/thischat"
BUN_PATH="$(which bun)"
HOME_DIR="$HOME"
LOG_PATH="$HOME/.config/weft/session-archive.log"
LABEL="com.weft.session-archive"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

# Unload existing if present
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>$HOME_DIR</string>
        <key>PATH</key>
        <string>$(dirname "$BUN_PATH"):/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
    <key>ProgramArguments</key>
    <array>
        <string>$BUN_PATH</string>
        <string>$SKILL_DIR/session-archive.ts</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$WEFT_ROOT</string>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>3</integer>
        <key>Minute</key>
        <integer>17</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>$LOG_PATH</string>
    <key>StandardErrorPath</key>
    <string>$LOG_PATH</string>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
PLIST

launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installed $LABEL"
echo "  Script: $SKILL_DIR/session-archive.ts"
echo "  Log:    $LOG_PATH"
echo "  Verify: launchctl print gui/\$(id -u)/$LABEL"
