---
name: session-discovery
description: Discovers Claude Code conversation sessions on the local machine within a date range. Returns a structured manifest of sessions with metadata. Use when a skill or agent needs to find prior conversations — e.g., session-review gathering evidence, progress-review windowing, or startwork checking recent activity. Not user-facing; designed as infrastructure for other skills.
---

# Session Discovery

Utility skill that finds Claude Code conversation sessions stored on the
local machine. Runs a bun script and returns a JSON manifest.

## When to use

This skill is infrastructure — other skills invoke it, users typically
don't. The primary consumers:

- **session-review** — find all sessions since last review to gather
  learning evidence beyond the current conversation
- **progress-review** — window across multiple sessions for pattern
  detection
- **startwork** — check recent session activity for continuation signals

## How to invoke

Run the discovery script from the harness root:

```bash
bun run "$(cat ~/.config/weft/root)/scripts/session-discovery.ts" [flags]
```

### Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--since YYYY-MM-DD` | today | Start of date window |
| `--until YYYY-MM-DD` | today | End of date window |
| `--project <substring>` | (all) | Filter by project path substring |

### Examples

```bash
SCRIPT="$(cat ~/.config/weft/root)/scripts/session-discovery.ts"

# Today's sessions
bun run "$SCRIPT"

# Sessions since last review
bun run "$SCRIPT" --since 2026-02-25

# Only sessions in the roger project
bun run "$SCRIPT" --project roger

# Two-day window, specific project
bun run "$SCRIPT" --since 2026-02-27 --until 2026-02-28 --project weft-dev
```

## Output format

JSON to stdout. Diagnostics to stderr.

```json
{
  "meta": {
    "claudeDir": "/Users/name/.claude",
    "since": "2026-02-28",
    "until": "2026-02-28",
    "filesScanned": 258,
    "sessionsMatched": 6,
    "errors": []
  },
  "sessions": [
    {
      "sessionId": "uuid",
      "project": "/Users/name/code/project",
      "projectEncoded": "-Users-name-code-project",
      "filePath": "/Users/name/.claude/projects/.../uuid.jsonl",
      "start": "2026-02-28T00:21:36.816Z",
      "end": "2026-02-28T01:56:48.087Z",
      "messageCount": 178,
      "userMessageCount": 59,
      "firstPrompt": "first 120 chars of first real user message...",
      "gitBranch": "feature-branch",
      "schemaVersion": "2.1.59"
    }
  ]
}
```

## How consuming skills should use the manifest

### 1. Run the script, parse the output

```bash
bun run "$(cat ~/.config/weft/root)/scripts/session-discovery.ts" --since <last-review-date> 2>/dev/null
```

Parse the JSON from stdout. The `meta` object tells you how many
sessions were found and whether errors occurred.

### 2. Decide what to read

The manifest gives you file paths and message counts. Use this to
decide whether to analyze inline or delegate to sub-agents (per the
context management gate in session-review).

- Small window (1-2 sessions, < 200 total messages): read the JSONL
  files directly
- Large window (3+ sessions, or > 500 messages): dispatch sub-agents
  with specific file paths from the manifest

### 3. Read session content

Each `filePath` is a JSONL file. Each line is a JSON object. The
relevant message types:

| `type` | Contains |
|--------|----------|
| `user` | User messages. `message.content` is a string or array of `{type, text}` blocks. |
| `assistant` | Agent responses. `message.content` is an array of text and tool_use blocks. |
| `queue-operation` | Session lifecycle (enqueue/dequeue). Has `timestamp` but no content. |
| `progress` | Streaming progress. Skip for analysis. |
| `file-history-snapshot` | File state snapshots. Skip for analysis. |

Filter to `user` and `assistant` types for conversation analysis.

### 4. Filter noise from user messages

User message content often starts with IDE-injected metadata. Skip
blocks matching these patterns:

- `<ide_opened_file>...`
- `<system-reminder>...`
- `<command-message>...`
- `<command-name>...`
- `<local-command...`

## Resilience notes

**CLAUDE_CONFIG_DIR**: The script checks this environment variable
first. If set, it uses that path instead of `~/.claude/`. Most users
won't have this set.

**Path encoding**: The `/` → `-` encoding for project directories is
undocumented and could change. The script doesn't depend on decoding
being perfect — it just needs to find JSONL files under `projects/`.
The decoded `project` field is best-effort for display.

**Schema changes**: The JSONL format is internal to Claude Code and
undocumented. The script reads `timestamp` and `type` fields. If these
change, the script will return empty results (not crash). The
`schemaVersion` field in each session lets consumers detect version
mismatches.

**30-day retention**: Claude Code may delete sessions older than 30
days. The script can only find what's on disk.

**Cross-midnight sessions**: The script uses interval overlap logic,
not simple date matching. A session starting at 23:00 on day N and
ending at 01:00 on day N+1 will match queries for either day.
