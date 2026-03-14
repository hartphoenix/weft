---
name: thischat
description: Returns the file path of the current session's JSONL log. With --stamp, adds provenance (session path + timestamp) to a file as YAML frontmatter (default) or HTML comment (--back). Use when a skill or agent needs to reference or annotate the current conversation's log file.
---

# thischat

```bash
SCRIPT="$(cat ~/.config/weft/root)/.claude/skills/thischat/thischat.ts"

bun "$SCRIPT" --prompt '<first 80 chars of user first message>'
bun "$SCRIPT" --prompt '...' --stamp path/to/file          # YAML frontmatter (default)
bun "$SCRIPT" --prompt '...' --stamp path/to/file --back   # HTML comment at end
bun "$SCRIPT" --retro --stamp path/to/file                 # stamp using file creation date
bun "$SCRIPT" --retro --stamp path/to/file --back          # retro + HTML comment
```

`--prompt` disambiguates the current session from others in the same
project. Pass the first ~80 chars of the user's first real message
(not system reminders or IDE metadata). Short prompts (<40 chars)
match in full. Omit if unknown — falls back to most recent file.
Subagents always fall back to the parent session; this is correct.

All stamp paths point to `~/.config/weft/session-archive/` (the
durable archive). The session JSONL is copied there at stamp time,
so the path is valid immediately — no waiting for the daily cron.

`--stamp` default writes YAML frontmatter (merges if present):
```yaml
---
session: ~/.config/weft/session-archive/<project>/<uuid>.jsonl
stamped: 2026-03-13T22:30:00.000Z
---
```

`--back` appends an HTML comment instead:
```
<!-- session: ~/.config/weft/session-archive/<project>/<uuid>.jsonl | 2026-03-13T22:30:00.000Z -->
```

`--retro` stamps using the file's creation date instead of now.
Finds the session that was active at that time (5min grace window).
Searches live logs first, then the archive for older sessions.
If no session matches, stamps with `(no matching session found)`.
No `--prompt` needed — birthtime is the discriminator.
