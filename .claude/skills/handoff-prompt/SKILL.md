---
name: handoff-prompt
description: Generates a complete handoff prompt for the next agent from session memory. Conserves context. Use before compaction, /clear, or when context is running low and work needs to continue in a fresh session.
---

# Handoff Prompt

Do not read files. Work from memory.

## Recipient

Fresh Claude Code instance. Has CLAUDE.md, memory files, full
tooling. Has nothing from this session.

## Assemble from memory

- **Goal** — session intent
- **State** — done, in progress, untouched
- **Key files** — paths and condition
- **Decisions** — choices and rationale
- **Discoveries** — anything not yet in persistent files
- **Blockers** — unresolved issues
- **Next steps** — prioritized, specific enough to act on

Write plain text addressing the next agent. Be concrete:
"move token validation from route handler to `src/middleware/auth.ts`"
not "finish the auth work."

Output the entire handoff inside a single fenced code block.