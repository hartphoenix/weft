---
name: route
description: >
  Routes extracted chunks and orphaned plans to their destinations
  across projects. Reads _routing.md from each project for routing
  rules. Presents a single routing plan sorted by confidence for batch
  approval. Never auto-routes.
---

# /route

## Path resolution

Read `~/.config/weft/config.json`:
- `learningRoot` → `{learningRoot}/extract/` is the staging area
- `threadRoots` → array of project thread paths to discover

## Input

No args: scan `{learningRoot}/extract/` for all chunk files and
`threads/_plans/` in each project for orphaned plan files.
Or: explicit file paths to route specific items.

## Process

### 1. Gather

Read all chunk files from `{learningRoot}/extract/`. Read orphaned
plan files from `threads/_plans/` in each project in `threadRoots`.
Read `_routing.md` from each project. Read `_thread.md` files for
thread context. Build the full picture before presenting anything.

### 2. Classify every item

For each **chunk** (from `extract/`), determine:
- **Agent vs. user:** Is this a mechanical action-item the agent can
  do (move file, update field, add entry), or does it need human
  judgment (decisions, questions, ideas, creative direction)?
- **Project:** Which project repo does it belong in? Match via
  `extracted-from` path, `context` line, content terms against
  `_routing.md` thread tables.
- **Thread:** Which thread within the project? Match against
  _thread.md open questions, decisions, next actions, scope.
- **Destination:** Per `_routing.md` routing rules — standalone file
  in thread dir, append to _thread.md section, or unsorted.
- **Confidence:** high / medium / low / unknown.

For each **orphaned plan** (from `_plans/`), classify by thread only.
These are complete plans, not chunks — they route as standalone files
to a thread directory with a descriptive `<YYYY-MM-DD>-<slug>.md`
name. No type subclassification needed.

### 3. Present routing plan

One consolidated plan, sorted:

```
## Routing plan — N chunks from staging

### High confidence
1. [plan-seed] "Housing search tool" → weft-dev/threads/voice-pipeline/
   as standalone file. Origin: 2026-03-16.
2. [action-item → agent] "Delete vestigial transcribe.sh"
   → agent-inbox. Mechanical file operation.

### Needs confirmation
3. [idea] "Semantic subscription network" → weft-dev or roger?
   Content is product thinking, not harness development.
   Suggested: roger/threads/_unsorted/ (no matching thread yet)

### Open questions (most → least blocking)
4. [idea] "Engines of negentropy" — no project match. Personal
   philosophy. Create a new thread? Route to roger/_unsorted/?
5. [fragment] Short chunk with unclear destination. Leave in staging?
```

User reviews the plan. Can approve all, approve selectively, override
any suggestion, or defer items back to staging. Batch approval:
"approve all high-confidence" is a single action.

### 4. Execute approved routes

For each approved item, in order:

**Agent-automatable items:**
- Move file from `extract/` to `{learningRoot}/agent-inbox/`.
- Add `triaged: agent` to frontmatter.

**User items — standalone file:**
- Copy chunk to destination path per `_routing.md` naming convention
  (default: `<YYYY-MM-DD>-<slug>.md`, date from `origin` field).
- Preserve all chunk frontmatter fields. Add routing provenance
  alongside (matching /thischat stamp contract):
  ```yaml
  # --- preserved from chunk ---
  origin: <idea's birthday>
  context: <agent-written context line>
  extracted-from: <path to source transcript or plan>
  extracted-at: <when /extract ran>
  chunk: <N of total>
  follows: <previous chunk filename, if any>
  precedes: <next chunk filename, if any>
  title: <title>
  type: <type>
  # --- added by /route ---
  source: <path to archived transcript or plan file>
  audio: <path to archived m4a, if voice memo>
  routed: <ISO timestamp — now>
  session: <session archive path, via /thischat --stamp>
  ```
  Adjacency refs (`follows`/`precedes`) keep their extract filenames.
  They'll be stale as routed paths, but they trace back to the
  original context — which is all they need to do.
- Add to _thread.md `## Reading order` if substantial (plan-seed,
  idea >100 words).

**User items — _thread.md section append:**
- `decision`: `- <origin-date>: <title>. <content summary>`
- `question`: `- <title> (<origin-date>, from <source path>)`
- `action-item`: `- <title>` under `## Next actions`
- `reference`: entry under `## Connections` or `## Reading order`

**After each delivery — _thread.md updates:**

Two kinds of update, handled differently:

*Plumbing* (apply silently): path corrections, filename updates,
moving references from `extract/` to the new routed location,
adding standalone files to `## Reading order`. These are mechanical
— the thread's meaning hasn't changed.

*Substantive* (surface to user): if the routed content shifts a
thread's scope, challenges an existing decision, adds a new open
question, or suggests a design direction the thread doesn't currently
reflect — flag it. Present what changed and why, so the user can
reword, reorganize, or update the thread's framing. Don't silently
absorb content that changes what the thread is about.

For both: search all _thread.md files in the project for references
to the chunk's old `extract/` path and update to the new location.

**After _thread.md updates:**
- Delete chunk from `{learningRoot}/extract/`.
- Append to `{learningRoot}/route-log.md`:
  `<timestamp> | <chunk-filename> → <destination-path> | <type>`

**Orphaned plans (from `_plans/`):**
- Move to `threads/<thread>/<YYYY-MM-DD>-<slug>.md`
- Derive slug from plan title/purpose (3-5 words, kebab-case)
- Date: use the plan's creation date (file metadata or content). If
  created across multiple sessions, use the date it was initiated.
- Add to _thread.md `## Reading order` if substantial
- Delete the original from `_plans/`
- Log to `{learningRoot}/route-log.md`

**Deferred items:** chunks remain in `{learningRoot}/extract/`,
plans remain in `_plans/`. Both unchanged; appear next time /route runs.

## `_routing.md` interface contract

Each project provides `{threadRoot}/_routing.md`. /route reads it
at runtime, never writes it.

Required sections:
- `## Threads` — table: thread name, description, accepted types
- `## Routing rules` — by-type destinations, naming conventions
- `## Unsorted` — catch-all path for project-matched but
  thread-unmatched chunks

Fallback when `_routing.md` is missing:
- Has `threads/`: read _thread.md files directly. Matched → standalone
  file in thread dir. Unmatched → `threads/_unsorted/` (create if
  needed).
- No `threads/`: ask user "Create threads/ and _routing.md?" On
  decline, chunk returns to staging.

When `_routing.md` appears stale (thread listed but _thread.md is
archived, or _thread.md exists but isn't in the table), surface
the discrepancy to the user in the routing plan.

## Agent inbox

`{learningRoot}/agent-inbox/` — flat directory of chunks triaged as
agent-automatable. Each file has `triaged: agent` in frontmatter.
A separate skill executes these. /route never executes agent tasks.

## What /route does NOT do

- Execute agent tasks — triage only
- Auto-route — presents plan, user approves
- Create threads — surfaces "no match," asks, never acts alone
- Maintain `_routing.md` — reads only; flags staleness
- Rewrite chunk content — verbatim delivery
- Delete deferred chunks — persist in staging indefinitely
