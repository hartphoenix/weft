---
name: session-digest
description: >-
  Lightweight learning-state update from session evidence without
  quizzing. Discovers recent undigested sessions, reads transcripts for
  concept engagement and fluency signals, and proposes a diff to
  current-state.md for human approval. Use when learning state is stale,
  before startwork, or when the user wants to update scores without a
  full session review.
---

# Session Digest

Four phases. Phases 1-3 are autonomous; Phase 4 is interactive. In
sub-agent mode (dispatched by startwork or another skill), Phases 1-3
run autonomously and the structured diff is returned as output — the
calling skill handles presentation and approval.

## Path Resolution

Resolve all harness file paths (learning/, .claude/references/,
.claude/consent.json) from the harness root in `~/.claude/CLAUDE.md`,
not the current working directory. If needed, read
`~/.config/weft/root` for the absolute path.

## Phase 1: Discover

1. Resolve harness root from `~/.config/weft/root`.
2. **Determine the digest window start.** Check in order:
   a. `learning/.last-digest-timestamp` — if it exists, use it.
      Format: single line containing `YYYY-MM-DD`, matching
      session-discovery's `--since` flag.
   b. Oldest file in `learning/session-logs/` (by filename date) —
      this is when the harness started tracking sessions.
   c. `learning/current-state.md` file creation date (via
      `stat -f %SB` on macOS or `stat -c %W` on Linux) — intake
      wrote this file.
   d. If none of the above exist, default to 30 days ago. This is a
      safety bound for misconfigured installs, not a normal case.
3. Run session-discovery:
   ```bash
   bun run "$(cat ~/.config/weft/root)/scripts/session-discovery.ts" --since <window-start>
   ```
   If session-discovery fails (bun not available, script not found, exit
   non-zero): report the failure to the user and exit. Unlike
   session-review (which can fall back to git history + current
   conversation), digest has no useful fallback — it exists to read
   session transcripts, and without session-discovery it can't find them.
4. Filter the manifest: exclude any session that started after this
   skill was invoked (the current session would appear in the manifest
   since its JSONL is being written to disk).
5. If 0 sessions remain, report "no undigested sessions" and exit.
6. **Standalone mode only:** Present the manifest summary: N sessions
   found spanning date range, total message count. On first run (no
   `.last-digest-timestamp`), note that this is the initial digest
   covering all sessions since intake. Ask user to confirm before
   proceeding (they may want to narrow the window — especially relevant
   for large first-run windows).

   **Sub-agent mode:** Skip confirmation. Proceed directly to Phase 2.

## Phase 2: Extract

Context management gate (same thresholds as session-review):

| Manifest data | Strategy |
|---|---|
| 0-1 sessions AND total messageCount < 200 | Inline: read JSONL(s) directly |
| 2-3 sessions OR total messageCount 200-500 | Single sub-agent with all JSONL paths |
| 4+ sessions OR total messageCount > 500 | Parallel sub-agents — one per session JSONL |

Each reader (inline or sub-agent) receives:
- The JSONL file path
- Current `learning/current-state.md` (so it knows existing concepts/scores)
- Instructions to extract:

```
concepts_encountered:
  - concept: [name — match existing current-state names when possible]
    evidence: [specific quote, paraphrase, or behavioral description]
    signal_type: new_exposure | struggle | breakthrough | teaching | deepening
    estimated_score: [0-5, or null if uncertain]
    gap_type: [conceptual | procedural | recall, or null]
    confidence: [high | moderate | low]

procedural_observations:
  - [workflow patterns, tool usage, debugging approach — brief]
```

### Filtering instructions

What counts as a growth-edge encounter (extract these):
- New concept exposure
- Struggle/debugging that reveals a gap
- Breakthrough that demonstrates fluency change
- Teaching/explaining a concept (shows depth)
- Deepening — using a concept in a novel context or combining it

What doesn't count (skip these):
- Routine use of a familiar concept without struggle
- Pure orchestration ("commit push merge")
- File listing, routine tool calls
- IDE metadata, system reminders

Sub-agent noise filtering (same patterns as session-review):
- Filter to `user` and `assistant` message types only
- Skip blocks starting with: `<ide_opened_file>`, `<system-reminder>`,
  `<command-message>`, `<command-name>`, `<local-command`
- Focus on: error debugging, user explanations, new concepts introduced,
  code written/reviewed, design decisions articulated

## Phase 3: Synthesize

Load `learning/current-state.md`. Compare extracted concepts against
current state. Build a proposed diff with four sections:

**A. Score changes** (existing concepts with new evidence)
- Show: concept name, current score -> proposed score, evidence,
  reasoning
- Only propose changes when evidence is strong enough (high/moderate
  confidence, clear signal type)

**B. New evidence** (existing concepts, score unchanged, but new
evidence worth recording)
- Append to history with `digest:observed` tag
- Show: concept name, current score (unchanged), new evidence note

**C. New concepts** (not in current-state.md)
- Show: proposed name, arc (existing or TBD), proposed score, gap type,
  evidence
- Flag `confidence: low` entries as quiz candidates

**D. Flags** (observations that don't map to score changes)
- Activity that doesn't map to existing arcs (possible new arc)
- Concepts with contradictory signals across sessions
- Concepts that appear heavily used but have no current-state entry

### Sub-agent mode output

In sub-agent mode, return the structured diff as output using the
format from Phase 4 below. Do not write any files. The calling skill
handles presentation, approval, and writes.

## Phase 4: Present & Approve (standalone mode only)

Format the diff for quick scanning. Example:

```
## Proposed Updates (5 sessions, Feb 25 - Mar 3)

### Score Changes (3)
  react-context: 2 -> 3 (procedural gap)
    Evidence: Built provider/consumer pattern in chatbot;
    debugged context not updating — solved independently.

  css-mobile-layout: 3 -> 4
    Evidence: Solved viewport overflow and scroll containment
    without agent assistance across two sessions.

  request-lifecycle: 3 (unchanged, new evidence)
    Evidence: Correctly ordered middleware in new Express project.

### New Concepts (2)
  form-validation (arc: react-fundamentals, score: 2, gap: procedural)
    Evidence: First attempt at controlled forms with validation;
    needed significant help with error state management.
    ! Low confidence — suggest for quiz

  api-error-handling (arc: http-and-apis, score: 3, gap: procedural)
    Evidence: Implemented try/catch with status codes; correct
    shape but inconsistent error response format.

### Flags
  > 3 sessions focused on game-design concepts — no arc for
    cooperative-game-mechanics exists yet. Create one?
```

User can:
- Approve all
- Approve with modifications (adjust scores, rename concepts, assign arcs)
- Skip individual items
- Reject all

On approval: write changes to `current-state.md` using the same YAML
entry format as session-review (see `.claude/skills/session-review/SKILL.md`,
Phase 3). Each concept entry:

```yaml
  - name: concept-name
    score: 3
    gap: procedural        # omit or use -- when score >= 4
    source: digest:observed
    last-updated: YYYY-MM-DD
    history:
      - { date: YYYY-MM-DD, score: 3, note: "brief qualitative note" }
```

Key difference from session-review: source tag is `digest:observed`
instead of `session-review:quiz`. No `last-quizzed` or `times-quizzed`
fields — digest doesn't quiz.

Update `learning/.last-digest-timestamp` to the latest digested
session's end date (`YYYY-MM-DD`).

## Scope

**v1: current-state.md only.** Goals.md and arcs.md stay untouched.
If digest sees activity that doesn't map to existing arcs, it flags it
in the diff presentation — user decides.

**No new arcs.** Concepts that don't fit existing arcs get proposed
with `arc: TBD` and a note. User assigns the arc during approval.

**No session logs.** Session logs are session-review's domain. Digest
writes only:
- Approved changes to `current-state.md`
- Updated `learning/.last-digest-timestamp`

## Anti-Patterns

- Don't inflate scores from transcript evidence. Bias conservative —
  reading about someone debugging !== watching them debug.
- Don't create near-duplicate concept names. Always check current-state
  first and match existing names.
- Don't digest the current session. The digest window ends before the
  session that's running the digest.
- Don't write to current-state.md without approval (standalone mode).
- Don't write session logs — that's session-review's domain.

## Interoperation

| Skill | How session-digest interoperates |
|---|---|
| **session-discovery** | Consumes: runs the script, uses the manifest |
| **session-review** | Parallel: digest handles passive state updates, review handles quiz. Same current-state.md format. Different source tags. |
| **progress-review** | Downstream consumer: reads current-state.md entries written by digest. Source tag lets it weight evidence. |
| **startwork** | Auto-dispatches digest as background sub-agent when 3+ sessions are undigested. Presents diff after session plan. |
| **lesson-scaffold** | Downstream consumer: reads updated scores from current-state.md |
