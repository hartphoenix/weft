# cmux CLI Reference

cmux 0.63+ | macOS native terminal (Swift/AppKit, libghostty)
Socket: `$CMUX_SOCKET_PATH` (default: `~/Library/Application Support/cmux/cmux.sock`)

## Hierarchy

Window > Workspace (sidebar entry) > Pane (split region) > Surface (tab within pane)

Surfaces are either **terminal** or **browser** panels.

## Environment Variables (auto-set in every cmux terminal)

| Variable | Example | Purpose |
|---|---|---|
| `CMUX_SOCKET_PATH` | `~/Library/Application Support/cmux/cmux.sock` | Socket for CLI/API |
| `CMUX_WORKSPACE_ID` | `workspace:1` | Current workspace |
| `CMUX_SURFACE_ID` | `surface:3` | Current terminal/browser tab |
| `TERM_PROGRAM` | `ghostty` | Terminal identification |

---

## Workspace Management

```
cmux list-workspaces [--json]
cmux new-workspace [--name <name>] [--cwd <path>] [--command <text>]
cmux rename-workspace [--workspace <id>] <name>
cmux current-workspace [--json]
cmux select-workspace <id>
cmux close-workspace [--workspace <id>]
cmux identify [--json]              # Returns current workspace + surface IDs
```

## Pane & Surface Management

```
cmux new-split <right|down|left|up> [--workspace <id>] [--surface <id>] [--panel <id>]
cmux new-pane [--type browser|terminal] [--direction <dir>] [--workspace <id>] [--url <url>]
cmux new-surface [--type browser|terminal] [--pane <id>] [--workspace <id>] [--url <url>]
cmux list-panes [--workspace <id>] [--json]
cmux list-pane-surfaces [--workspace <id>] [--pane <id>]
cmux focus-pane --pane <id> [--workspace <id>]
cmux close-surface [--surface <id>] [--workspace <id>]
cmux move-surface --surface <id> [--pane <id>] [--workspace <id>]
cmux tree                           # Full workspace/pane/surface hierarchy
cmux trigger-flash [--surface <id>] # Flash pane to draw attention
```

## Terminal Interaction

```
cmux send "<text>" [--surface <id>] [--workspace <id>]
cmux send-key <key> [--surface <id>] [--workspace <id>]
cmux read-screen [--surface <id>] [--workspace <id>] [--scrollback] [--lines N] [--json]
```

**Escape sequences in `send`:** `\n` and `\r` send Enter, `\t` sends
Tab. Use these intentionally — multiline text passed through `send`
will trigger Enter at each `\n`.

**Resolution chain:** `--workspace` without `--surface` resolves:
workspace → focused pane → selected surface. If a browser pane has
focus, `send` targets the browser and fails. `--surface` without
`--workspace` uses `$CMUX_WORKSPACE_ID` as context — fails when
targeting a surface in a different workspace. For cross-workspace
automation, always pass **both** `--workspace` and `--surface`.

**Supported keys:** `enter`, `tab`, `escape`, `home`, `end`, `delete`,
`pageup`, `pagedown`, `left`, `right`, `up`, `down`.
Modifiers: `ctrl+c`, `shift+tab`, `alt+left`, `cmd+k`, etc.

## Browser Automation

### Navigation
```
cmux browser open <url> [--split <dir>]      # New browser pane at URL
cmux browser navigate <url> [--snapshot-after]
cmux browser get url [--surface <id>]
cmux browser wait [--selector <css>] [--text <text>] [--url-contains <str>]
                  [--load-state <state>] [--function <js>] [--timeout <ms>]
```

### Inspection
```
cmux browser snapshot [--selector <css>] [--max-depth <n>] [--interactive] [--compact]
cmux browser screenshot [--out <path>]
cmux browser eval "<javascript>" [--json]
```

`snapshot --interactive` returns element references (e.g., `ref:42`) that
can be passed to `click`, `type`, etc. instead of CSS selectors.

### Interaction
```
cmux browser click <selector|ref> [--snapshot-after]
cmux browser type <selector|ref> <text> [--snapshot-after]
cmux browser fill <selector|ref> [--text <text>] [--snapshot-after]
cmux browser select <selector|ref> <option_value> [--snapshot-after]
cmux browser hover <selector|ref> [--snapshot-after]
cmux browser focus <selector|ref>
cmux browser press <selector|ref> <key> [--snapshot-after]
cmux browser scroll [--direction up|down] [--amount <px>]
```

### State
```
cmux browser cookies [--domain <domain>]
cmux browser storage [--type local|session]
cmux browser download <url> [--out <path>]
```

## Notifications & Claude Hook

```
cmux notify --title "<text>" [--subtitle "<text>"] --body "<text>"
cmux claude-hook session-start       # Sidebar → "Running" (⚡)
cmux claude-hook stop                # Clear sidebar status
cmux claude-hook notification        # Forward notification + ring
cmux claude-hook prompt-submit       # Clear notification, set Running
cmux list-notifications
cmux clear-notifications
```

Note: `claude-hook` manages sidebar status pills automatically.
Don't set custom persistent status pills — they go stale.

## Utility

```
cmux ping                           # Returns PONG
cmux version
cmux capabilities [--json]
cmux markdown <file>                 # Render markdown in viewer
cmux ssh <user@host>                 # Remote workspace with port forwarding
```

## tmux Compatibility Layer

```
cmux capture-pane [--surface <id>]
cmux resize-pane [--direction <dir>] [--amount <n>]
cmux swap-pane [--source <id>] [--target <id>]
cmux break-pane
cmux join-pane [--target <id>]
cmux pipe-pane [--command <cmd>]
cmux wait-for <channel>
```

---

## Socket API (JSON-RPC)

For high-frequency operations where CLI overhead (~50ms) matters.
Socket at `$CMUX_SOCKET_PATH`. Newline-terminated JSON-RPC v2.

```bash
# Request
echo '{"id":"1","method":"workspace.list","params":{}}' | nc -U "$CMUX_SOCKET_PATH"

# Response
{"id":"1","ok":true,"result":{"workspaces":[...]}}
```

Methods mirror CLI commands: `workspace.create`, `workspace.list`,
`surface.split`, `terminal.send`, `notification.create`, `status.set`,
`browser.snapshot`, etc.

---

## Custom Commands (cmux.json)

Project-level `./cmux.json` or global `~/.config/cmux/cmux.json`.
Changes detected live, no restart.

### Simple command
```json
{
  "commands": [{
    "name": "Run Tests",
    "keywords": ["test"],
    "command": "npm test"
  }]
}
```

### Workspace template
```json
{
  "name": "dev",
  "workspace": {
    "name": "Development",
    "cwd": ".",
    "layout": {
      "direction": "horizontal",
      "split": 0.6,
      "children": [
        { "type": "terminal", "command": "claude" },
        { "type": "browser", "url": "http://localhost:5173" }
      ]
    }
  }
}
```

Launch with: `cmux new-workspace --from-config dev`

---

## Keyboard Shortcuts (Ghostty defaults)

**Splits:** Cmd+D (right), Cmd+Shift+D (down), Cmd+Shift+Enter (zoom toggle)
**Navigate splits:** Cmd+Shift+[ / Cmd+Shift+]
**Tabs:** Cmd+T (new), Cmd+W (close), Cmd+1-9 (jump)
**Workspaces:** Cmd+N (new), Cmd+1-9 (jump), Ctrl+Cmd+[/] (prev/next)
**Notifications:** Cmd+Shift+U (jump to unread), Cmd+Shift+I (panel)
**Visual:** Cmd+Shift+L (flash focused pane)
**Other:** Cmd+Shift+P (command palette), Cmd+Enter (fullscreen)
