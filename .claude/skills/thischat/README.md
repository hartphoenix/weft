# thischat

Session identification and provenance stamping for Claude Code.

## Overview

Claude Code doesn't expose a session ID and deletes session logs after
30 days (with no reliable way to disable this). thischat solves both:

- **Identifies** the current session's JSONL log file by matching
  conversation content against project session files
- **Archives** every session log to a durable location on stamp
- **Stamps** artifacts with provenance metadata (which session created
  this file, when)
- **Retro-stamps** files after the fact using file birthtime

A daily cron job (`session-archive.ts`) backs up all session logs and
retro-stamps any files that were missed.

## Architecture

### Session identification

1. CWD is encoded into a project directory name (`/` → `-`)
2. JSONL files in `~/.claude/projects/<encoded>/` are sorted by mtime
3. `--prompt` matches the first real user message for disambiguation
4. Fallback: most recently modified file
5. Subagents get the parent session (correct behavior — they share a
   project dir but have lower mtime)

### Script independence

`session-archive.ts` and `thischat.ts` are independent scripts. They
share a folder for organizational clarity but don't call each other at
runtime. `session-archive.ts` duplicates the stamping logic inline.

## Flags reference

| Flag | Description |
|------|-------------|
| `--prompt '<text>'` | First ~80 chars of user's first message. Disambiguates sessions in the same project. Short prompts (<40 chars) match in full. Omit to fall back to most recent. |
| `--stamp <file>` | Add provenance to file. Default: YAML frontmatter. |
| `--back` | Use with `--stamp`. Appends HTML comment instead of frontmatter. Use for auto-read files (SKILL.md, CLAUDE.md, memory files). |
| `--retro` | Use with `--stamp`. Stamps using file's creation date instead of now. Finds the session active at that time (5min grace). No `--prompt` needed. |

## Stamp formats

**YAML frontmatter** (default) — merges into existing frontmatter if present:
```yaml
---
session: ~/.config/weft/session-archive/<project>/<uuid>.jsonl
stamped: 2026-03-13T22:30:00.000Z
---
```

**HTML comment** (`--back`) — appended at end of file:
```html
<!-- session: ~/.config/weft/session-archive/<project>/<uuid>.jsonl | 2026-03-13T22:30:00.000Z -->
```

Use `--back` for files with frontmatter that gets loaded into context
(SKILL.md, CLAUDE.md, MEMORY.md) to avoid polluting the agent's
attention with session paths.

## Archive system

**Location:** `~/.config/weft/session-archive/`

**Why it exists:** Claude Code's `cleanupPeriodDays` setting has known
bugs (#15935, #23710). Setting it to 0 breaks persistence. High values
may be silently ignored. The archive rsync is the actual safety net.

**Archive-on-stamp:** Every `--stamp` copies the JSONL to the archive
immediately, so the stamped path is valid from the moment of stamping.
No waiting for the daily cron.

## Daily cron job

`session-archive.ts` runs via launchd at 3:17am (or on next wake):

1. rsync all JSONL from `~/.claude/projects/` → archive
2. Scan projects listed in `~/.config/weft/stamp-projects` for
   unstamped `.md` files
3. Build session index once per project (avoids re-scanning per file)
4. Retro-stamp each using file birthtime → session time window matching
   (5min grace)
5. Auto-read files (SKILL.md, CLAUDE.md, MEMORY.md) get `--back`

If `~/.config/weft/stamp-projects` doesn't exist, the cron job archives
session logs but skips the retro-stamping pass (archive-only mode).

## Setup (new machine, macOS)

1. **Clone and bootstrap weft:**
   ```bash
   git clone <weft-repo-url> && cd weft
   bash scripts/bootstrap.sh
   ```
   This symlinks skills globally and writes `~/.config/weft/root`.

2. **Verify symlink:**
   ```bash
   ls -la ~/.claude/skills/thischat/
   ```
   Should point to the weft skill folder.

3. **Ensure bun is installed:**
   ```bash
   which bun   # homebrew: brew install oven-sh/bun/bun
   ```

4. **Create stamp-projects config** (skip for archive-only mode):
   ```bash
   # One project path per line
   echo "/path/to/your/project" >> ~/.config/weft/stamp-projects
   ```

5. **Install cron job:**
   ```bash
   bash "$(cat ~/.config/weft/root)/.claude/skills/thischat/install-cron.sh"
   ```

6. **Verify:**
   ```bash
   launchctl print gui/$(id -u)/com.weft.session-archive
   ```
   Should show `state = spawn scheduled`, no `EX_CONFIG`.

7. **Test dry run:**
   ```bash
   bun "$(cat ~/.config/weft/root)/.claude/skills/thischat/session-archive.ts" --dry-run
   ```

8. **First real run** (slow — stamps all existing unstamped files):
   ```bash
   bun "$(cat ~/.config/weft/root)/.claude/skills/thischat/session-archive.ts"
   ```

## Provenance convention

- **Stamp:** new artifacts (plans, docs, designs, specs) →
  `/thischat --stamp <file>`
- **Back stamp:** auto-read frontmatter files (SKILL.md, CLAUDE.md,
  memory files) → `/thischat --stamp <file> --back`
- **Skip:** configs, temp files, generated code

## Config files

| File | Purpose |
|------|---------|
| `~/.config/weft/stamp-projects` | Project dirs to scan (one per line) |
| `~/.config/weft/session-archive/` | Durable archive (created automatically) |
| `~/.config/weft/session-archive.log` | Cron output log |
| `~/.config/weft/root` | Weft harness path (written by bootstrap.sh) |

## Dependencies

- **bun** — runtime for both scripts
- **rsync** — session-archive.ts only (macOS built-in)

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `EX_CONFIG` exit code | Re-run `install-cron.sh` (regenerates plist with correct paths) |
| Wrong bun path | `install-cron.sh` uses `which bun` automatically; re-run after installing bun |
| Empty log file | Check `launchctl print gui/$(id -u)/com.weft.session-archive` for exit code |
| Slow first run | Expected — many files x session index build. Subsequent runs only stamp new files. |
| `cleanupPeriodDays` | Set to 999999 in `~/.claude/settings.json` as supplement, do not rely on it (known bugs) |

## Known risks

These affect the archive system regardless of where the scripts live:

1. **Path-encoding change proposed** (#24789) — Anthropic may replace
   path-encoded directory names with project IDs. Would break session
   lookup without erroring. Archive preserves existing sessions.

2. **Storage location migration** (#29373, #29154) — Claude Desktop
   already changed session paths without warning. CLI could do the same.

3. **JSONL format is not a public API** (#2765) — No stability guarantee
   on field names. Schema changes would cause silent skips.

4. **Multi-GB JSONL files** (#18905) — "progress" entries can bloat
   files to 5GB+. Not a risk for these scripts (streaming reads and
   `file.slice()`), but affects tools using `file.text()`.

5. **No reliable way to disable cleanup** (#4172) — The archive rsync
   is the actual safety net.

**Net assessment:** The archive-on-stamp design (copy JSONL immediately,
reference the archive path) decouples provenance from Claude Code's
internal storage, which has no stability contract.

## Platform

macOS only. All components (launchd, birthtime, rsync) are macOS-native.
`install-cron.sh` generates the plist dynamically — no manual path
editing needed.

## Archive-only mode

For users who only want session log archival without stamping:

1. Bootstrap weft and install the cron job (steps 1-2, 5 above)
2. Skip creating `~/.config/weft/stamp-projects`
3. The cron job archives session logs but skips retro-stamping

Verify with:
```bash
bun "$(cat ~/.config/weft/root)/.claude/skills/thischat/session-archive.ts" 2>&1
```
Should show `Scanning 0 project(s)` — archive ran, stamping skipped.
