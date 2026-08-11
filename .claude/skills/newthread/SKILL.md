---
name: newthread
description: >-
  Scopes and initializes a new thread. Surveys existing threads across
  projects, scans source material for relevance, proposes scope and
  connections, then creates the thread directory and _thread.md after
  user approval. Use when the user wants to start a new thread.
---

# /newthread

Scope a new thread from conversation context + available source
material, then initialize it after user approval.

## Path resolution

Read `~/.config/weft/config.json` for `learningRoot` and `threadRoots`.

Thread discovery locations (deduplicate by resolved path):
1. CWD `threads/` — always
2. `{learningRoot}/threads/` — always (if different from CWD)
3. Each path in `threadRoots` array — if present in config

If neither `learningRoot` nor `threadRoots` is set, CWD `threads/`
is the only source. This is fine for single-project use.

## Input

- **Topic/intent:** from conversation context or stated explicitly
- **Source locations (optional):** user may point to specific paths

## Process

### Phase 1: Survey (parallel)

Run 1a, 1b, and 1c concurrently.

**1a. Thread landscape.**
- Resolve all thread roots (see path resolution above)
- `ls` each thread root
- Read first ~15 lines of each `_thread.md` (status, last-touched,
  next-action, connections)
- If on a feature branch: `git diff main -- threads/` to detect
  thread state divergence from main
- Flag any `_thread.md` with last-touched >7 days and status "active"
  — report as potentially stale in Phase 2

**1b. Source material scan.**

Scan all available sources. Skip silently if a source path doesn't
exist.

| Source | What to read | Match by |
|--------|-------------|----------|
| Extracts | `{learningRoot}/extract/` frontmatter | title, context, type |
| Loose files | `plans/`, `design/` not in any `_thread.md` reading order | title, content scan |
| Notepad | `{learningRoot}/notepad/` | titles, first ~5 lines |
| Catch basins | Plans with `## Catch basin` | item content |
| User-specified | Paths provided in invocation | full read |

"Relevant" = topic overlap with the proposed thread's scope. Read
enough of each candidate to classify; don't read entire files unless
needed.

For each relevant resource, classify exclusivity:
- **Exclusive** (serves only this thread) → propose relocation
- **Shared** (appears in another thread's `_thread.md`, or lives in
  a staging pipeline like `extract/`) → reference only

Exclusivity test: grep the file path across all `_thread.md` reading
orders and connections. If it appears in another thread or in
`extract/` (which is /route's domain), it's shared.

**1c. Connection scan.**

For each existing thread (across all discovered thread roots), check:
- Open questions the proposed thread would address
- Work that overlaps with proposed scope
- Artifacts the proposed thread would consume or produce
- Shared dependencies or blocking relationships

### Phase 2: Propose

Present a structured proposal. **Wait for user approval before
proceeding to Phase 3.**

```
## Proposed thread: <name>

**Scope:** <what this thread owns — 2-3 sentences>
**Excludes:** <adjacent territory owned by other threads>
**Status:** planning | active
**Suggested branch:** <slug>
**Suggested next action:** <one line>

### Source material found
- <file> — <relevance assessment> — **relocate** (exclusive)
- <file> — <relevance assessment> — **reference** (shared with <thread/process>)
- ...
(or: no relevant source material found)

### Connections
- **<thread-name>** (<project>) — <directional relationship>
- ...

### Proposed edits on other threads
- **<thread-name>** Connections: add "<new-thread> — <relationship>"
- ...
(or: no cross-thread edits needed)

### Routing entry
<one-line scope description + accepted types for _routing.md>
```

The user may:
- **Approve** as-is
- **Adjust** scope, name, connections, branch, or resource disposition
- **Reject** (the topic fits an existing thread after all)

### Phase 3: Initialize (after approval)

**3a. Create thread directory and `_thread.md`.**

Write `threads/<name>/_thread.md`:

```markdown
# <Thread Name>

**Status:** <approved>
**Branch:** <approved or "(not yet created)">
**Last touched:** <today>
**Next action:** <approved>

> If this document appears stale (status, dates, or reading order
> don't match the actual state of the thread), surface it with the
> user immediately and ask what to do. Do not silently work around
> stale metadata.

## Reading order
<populated from relocated/referenced files, or empty>

## Open questions
- <from conversation context or source material, if any>

## Decisions made
- <today>: Thread created. <scope statement>

## Connections
- **<thread>** — <relationship>
```

**3b. Relocate exclusive resources** (if approved in Phase 2).
- Move files marked "relocate" into `threads/<name>/`
- Update `_thread.md` reading order with relocated files
- Add references in reading order for files marked "reference"
  (leave those files in place)

**3c. Update connected threads** (if approved in Phase 2).
- Add a Connections entry in each connected thread's `_thread.md`
  pointing to the new thread

**3d. Update `_routing.md`** (if it exists in the same thread root).
- Append the new thread's routing entry (description + accepted types)
- If `_routing.md` doesn't exist, skip

**3e. Report.**
- Thread directory path
- Files relocated (if any)
- References added (if any)
- Connected threads updated (if any)
- Routing entry added (or skipped)
- Suggested next steps

## Graceful degradation

| Missing | Effect |
|---------|--------|
| `learningRoot` config | Skip extract and notepad scans |
| `threadRoots` config | Discover threads from CWD + learningRoot only |
| `{learningRoot}/extract/` | Skip extract scan |
| `notepad/` | Skip notepad scan |
| `plans/`, `design/` | Skip loose-file scan |
| No existing threads | First thread — no connections to scan |
| `_routing.md` | Skip routing update |
| All sources empty | Proposal based on conversation context only |

## Constraints

- **Never auto-create.** Only on explicit user request.
- **Propose before writing.** Phase 2 approval gates Phase 3.
- **Scope is the critical output.** The directory is mechanical.
- **Thread names are slugs.** Lowercase, hyphenated, descriptive.
- **One `_thread.md` per thread.** The directory IS the index.
- **Relocate exclusive, reference shared.** /route handles extracts.
- **Branch suggestion, not creation.** User creates when ready.
