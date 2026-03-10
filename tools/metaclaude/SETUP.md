# MetaClaude Setup

## What's here

- `observer.sh` — Async Stop hook. After each Builder Claude response,
  reads transcript, calls Context Claude (Haiku), stages an injection
  (or stays silent). Logs all observations with latency.
- `inject.sh` — UserPromptSubmit hook. Reads staged injection, outputs
  as additionalContext. Logs every injection.
- `toggle.sh` — Toggle on/off, set dev/prod mode, switch models.
- `statusline.sh` — Status line component. Shows indicator + injection
  content in dev mode.
- `prompt.md` — The metacognitive system prompt for Context Claude.

## Models

MetaClaude supports multiple inference backends. Local models require
LM Studio running on `localhost:1234`.

| Flag | Abbrev | Model | Backend |
|------|--------|-------|---------|
| `--sl` | SL | Qwen3-4B-Thinking | LM Studio (local) |
| `--ml` | ML | Qwen3-8B | LM Studio (local) |
| `--ll` | LL | Gemma-3-12B | LM Studio (local) |
| `--mch` | MCH | Haiku | Claude CLI (API) |
| `--mco` | MCO | Opus-4.6 | Claude CLI (API) |

Switch models: `toggle.sh --ml` (auto-enables if off).
Default (no model file): MCH/Haiku.

**LM Studio requirements:** LM Studio must be running with the target
model loaded. The observer calls `POST /v1/chat/completions` on
`localhost:1234`. If LM Studio is down or the model isn't loaded, the
error is logged and the hook exits cleanly.

## Session instructions

Instructions are session-level directives appended to the meta-agent's
system prompt. They persist until cleared or MetaClaude is disabled.

```bash
# Via /metaclaude skill:
/metaclaude +[focus on error handling patterns]    # append
/metaclaude +[also watch for test coverage]        # append another line
/metaclaude -[only track test coverage]            # replace all
/metaclaude -[]                                    # clear

# Combined with model switch:
/metaclaude --ml +[this is a lesson on auth]
```

Instructions are stored in `~/.claude/metaclaude/instruction` (plain text).

## Modes

- **Dev mode** (`toggle.sh --dev`): Full observability. Status line
  shows injection content (what just fired) and staged content
  (what's about to fire). All observations logged with latency.
- **Prod mode** (`toggle.sh --prod`): Minimal UI. Status line shows
  `○ MCH` / `◉ ML` indicator only (model abbreviation). Still logs.

Switch modes: `toggle.sh mode dev` or `toggle.sh mode prod`

## Settings.json changes needed

Add these hooks to the `hooks` object in `~/.claude/settings.json`:

```json
"Stop": [
  {
    "matcher": "",
    "hooks": [
      {
        "type": "command",
        "command": "bash /Users/rhhart/Documents/GitHub/weft/tools/metaclaude/observer.sh",
        "async": true,
        "timeout": 30,
        "statusMessage": ""
      }
    ]
  }
],
"UserPromptSubmit": [
  {
    "matcher": "",
    "hooks": [
      {
        "type": "command",
        "command": "bash /Users/rhhart/Documents/GitHub/weft/tools/metaclaude/inject.sh",
        "timeout": 5
      }
    ]
  }
]
```

## Status line update

Replace the current `statusLine.command` value. The new version calls
`statusline.sh` to append MetaClaude info:

```json
"statusLine": {
  "type": "command",
  "command": "input=$(cat); cwd=$(echo \"$input\" | jq -r '.workspace.current_dir'); dir_name=$(basename \"$cwd\"); used_pct=$(echo \"$input\" | jq -r '.context_window.used_percentage // empty'); cd \"$cwd\" 2>/dev/null; if git rev-parse --git-dir > /dev/null 2>&1; then branch=$(git --no-optional-locks symbolic-ref --short HEAD 2>/dev/null || echo \"detached\"); if git --no-optional-locks diff-index --quiet HEAD -- 2>/dev/null; then git_status=\"git:($branch)\"; else git_status=\"git:($branch) ✗\"; fi; else git_status=\"\"; fi; printf \"\\033[1;32m➜\\033[0m \\033[36m%s\\033[0m\" \"$dir_name\"; if [ -n \"$git_status\" ]; then printf \" \\033[34m%s\\033[0m\" \"$git_status\"; fi; if [ -n \"$used_pct\" ]; then printf \" \\033[33m[%d%%]\\033[0m\" \"$used_pct\"; fi; bash /Users/rhhart/Documents/GitHub/weft/tools/metaclaude/statusline.sh"
}
```

## Status line display

The model abbreviation (SL/ML/LL/MCH/MCO) replaces the generic "MC".

**Prod mode:**
```
➜ weft git:(main) [45%] ○ ML
```

**Dev mode — injection just fired:**
```
➜ weft git:(main) [45%] ○ ML
│ injected: The user's goal drifted from X to Y in the last 3 turns.
```

**Dev mode — injection staged for next turn:**
```
➜ weft git:(main) [45%] ◉ SL
│ staged: Consider using the notepad for this decomposition.
```

## Log files

Legacy daily logs are in `~/.claude/metaclaude/logs/` as JSONL files.
Per-session state (injection, accumulator, fingerprint, session-log
pointer) is in `~/.claude/metaclaude/sessions/{session-id}/`.
Session directories persist across disable/re-enable cycles to
preserve accumulator context. They can be manually removed when
no longer needed.

Each line is one of:
- `{"type": "observation", "action": "staged", "content": "...", "latency_ms": 1234}`
- `{"type": "observation", "action": "silent", "content": null, "latency_ms": 890}`
- `{"type": "injection", "content": "...", "mode": "dev"}`

View today's log:
```bash
cat ~/.claude/metaclaude/logs/$(date +%Y-%m-%d).jsonl | jq .
```

View only injections:
```bash
jq 'select(.type == "injection")' ~/.claude/metaclaude/logs/$(date +%Y-%m-%d).jsonl
```

View latency stats:
```bash
jq 'select(.type == "observation") | .latency_ms' ~/.claude/metaclaude/logs/$(date +%Y-%m-%d).jsonl
```

## Sandbox configuration

Claude Code's sandbox has two independent layers: **filesystem** (which
paths commands can read/write) and **network** (which hosts commands can
reach). Both need configuration for MetaClaude.

### Filesystem allowlist

The metaclaude state files need write permission. Add these paths to
your sandbox's write allowlist in `settings.json` or
`.claude/settings.local.json`:

```json
"//<HOME>/.claude/metaclaude"
```

Replace `<HOME>` with your actual home directory (e.g.
`/Users/username`). The `//` prefix is required — it forces the
sandbox to treat the path as absolute. Without `//`, paths are
resolved relative to `~/.claude/`, which doubles the prefix and
breaks writes.

### Network allowlist

Local model inference requires Bash commands (curl, bun scripts) to
reach LM Studio on localhost:1234. Two settings are needed:

```json
"sandbox": {
  "network": {
    "allowLocalBinding": true,
    "allowedDomains": [
      "localhost:1234",
      "127.0.0.1:1234",
      "localhost",
      "127.0.0.1"
    ]
  }
}
```

**`allowLocalBinding: true`** is the critical setting. It tells the
macOS Seatbelt profile (the OS-level sandbox enforcing network rules on
Bash commands) to permit connections to localhost. Without it, curl gets
`Operation not permitted` at the syscall level — not a connection
refusal, an OS block.

**`allowedDomains`** controls tool-level network access (WebFetch, etc.)
and is shown as `allowedHosts` in the session environment header. It
does NOT affect Bash commands. Both port-specific and bare entries are
included because the matching behavior is underdocumented.

Note: WebFetch rejects localhost URLs entirely regardless of
allowedDomains — use curl or bun scripts for local API calls.

**Important:** The sandbox environment is frozen at session start.
Changes to settings.json require a new session to take effect.

## First use

1. Apply the settings.json changes above (hooks + status line)
2. Start a new Claude Code session (hooks load at session start)
3. Enable in dev mode: `toggle.sh --dev` (or `/metaclaude --dev`)
4. The status line should show `○ MC`
5. After your next exchange, observer runs async
6. If MetaClaude has something to say: status line shows `◉ MC` and
   in dev mode shows the staged content
7. On your next message: injection fires, status line shows what
   was injected

## Toggle commands

```bash
toggle.sh             # toggle on/off
toggle.sh on          # enable (current mode)
toggle.sh off         # disable (clears instruction file)
toggle.sh --dev       # enable in dev mode
toggle.sh --prod      # enable in prod mode
toggle.sh mode dev    # switch to dev (without toggling)
toggle.sh mode prod   # switch to prod (without toggling)
toggle.sh --sl        # switch to Qwen3-4B-Thinking (auto-enables)
toggle.sh --ml        # switch to Qwen3-8B (auto-enables)
toggle.sh --ll        # switch to Gemma-3-12B (auto-enables)
toggle.sh --mch       # switch to Haiku (auto-enables)
toggle.sh --mco       # switch to Opus-4.6 (auto-enables)
```

## Path resolution for other users

The observer.sh script defaults `NOTEPAD_DIR` to Hart's roger/notepad.
Other users should set the `METACLAUDE_NOTEPAD_DIR` environment variable
or the observer won't find their notepad.
