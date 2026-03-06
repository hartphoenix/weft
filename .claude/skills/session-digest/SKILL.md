---
name: session-digest
description: >-
  Returns a structured learning-state diff from session evidence without
  quizzing or writing files. Callers (session-review, startwork, or the
  user's main context) handle presentation, approval, and writes. Use
  when learning state is stale, before startwork, or when the user wants
  to update scores without a full session review.
---

# Session Digest

Three phases. All autonomous. Returns a structured diff as output.
The calling context (session-review, startwork, or the user's main
conversation) handles presentation, approval, and file writes.

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
3. Run session-discovery with paths-only output:
   ```bash
   bun run "$(cat ~/.config/weft/root)/scripts/session-discovery.ts" \
     --since <window-start> --min-user-messages 5 --paths-only
   ```
   If the command fails: report the failure and exit.
   If output is empty: report "no undigested sessions" and exit.
   Each output line is a JSONL file path for Phase 2.
4. Proceed directly to Phase 2. If the caller wants confirmation
   (e.g., first-run warning), they handle it before dispatching.

## Phase 2: Extract

For each session in the manifest, run session-extract:

```bash
bun run "$(cat ~/.config/weft/root)/scripts/session-extract.ts" <filePath>
```

If session-extract fails (script not found, bun error, exit non-zero):
report the failure and exit. Do not attempt to parse raw JSONL
directly — the tool budget required makes synthesis impossible.

### Context management gate

| Sessions | Strategy |
|----------|----------|
| 1 | Inline: run session-extract, process output directly |
| 2-3 | Single sub-agent with all session-extract outputs |
| 4+ | Parallel sub-agents — one per session |

Each reader (inline or sub-agent) receives:
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

### What to look for in extracted text

What counts as a growth-edge encounter (extract these):
- New concept exposure
- Struggle/debugging that reveals a gap (tool errors are marked with `x`)
- Breakthrough that demonstrates fluency change
- Teaching/explaining a concept (shows depth)
- Deepening — using a concept in a novel context or combining it

What doesn't count (skip these):
- Routine use of a familiar concept without struggle
- Pure orchestration ("commit push merge")
- Routine tool calls

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

## Output Format

Return the structured diff using these four sections. This is the
return value — digest does not write files.

```
## Proposed Updates (N sessions, date range)

### Score Changes
  concept-name: current -> proposed (gap type)
    Evidence: [specific quote, paraphrase, or behavioral description]

### New Evidence (score unchanged)
  concept-name: score (unchanged)
    Evidence: [new observation worth recording]

### New Concepts
  concept-name (arc: arc-name, score: N, gap: type)
    Evidence: [description]
    ! Low confidence — suggest for quiz  (when applicable)

### Flags
  > [observations that don't map to score changes]
```

**YAML entry schema** for callers writing to `current-state.md`:

```yaml
  - name: concept-name
    score: 3
    gap: procedural        # omit or use -- when score >= 4
    source: digest:observed
    last-updated: YYYY-MM-DD
    history:
      - { date: YYYY-MM-DD, score: 3, note: "brief qualitative note" }
```

No `last-quizzed` or `times-quizzed` fields — digest doesn't quiz.

Callers are responsible for writing approved entries to
`current-state.md` and updating `learning/.last-digest-timestamp` to
the latest digested session's end date.

## Standalone Invocation

When the user invokes `/session-digest` directly (not as a sub-agent):

1. Run Phases 1-3 to produce the structured diff.
2. If this is the first digest (no `.last-digest-timestamp`), note
   that this covers all sessions since intake — user may want to
   narrow the window. Ask before proceeding.
3. Present the diff using the Output Format above.
4. User approves all, approves with modifications, skips items, or
   rejects.
5. On approval: write approved entries to `current-state.md` using
   the YAML schema in Output Format. Update
   `.last-digest-timestamp` to the latest digested session date.
6. On rejection: exit without writing.

## Scope

**v1: current-state.md only.** Goals.md and arcs.md stay untouched.
If digest sees activity that doesn't map to existing arcs, it flags it
in the diff presentation — user decides.

**No new arcs.** Concepts that don't fit existing arcs get proposed
with `arc: TBD` and a note. User assigns the arc during approval.

**Digest writes nothing.** Returns structured diff. Caller writes
approved changes to `current-state.md` and updates
`.last-digest-timestamp`. (Standalone invocation handles its own writes
per the Standalone Invocation section above.)

**No session logs.** Session logs are session-review's domain.

## Anti-Patterns

- Don't inflate scores from transcript evidence. Bias conservative —
  reading about someone debugging !== watching them debug.
- Don't create near-duplicate concept names. Always check current-state
  first and match existing names.
- Don't digest the current session. The digest window ends before the
  session that's running the digest.

## Interoperation

| Skill | How session-digest interoperates |
|---|---|
| **session-extract** | Consumes: runs the script per session to convert raw JSONL into filtered readable text for Phase 2 extraction. |
| **session-discovery** | Consumes: runs the script, uses the manifest |
| **session-review** | Upstream dependency. Session-review dispatches digest as foreground sub-agent for evidence gathering. Digest returns structured diff; review uses it for quiz-target selection and state updates. |
| **progress-review** | Downstream consumer: reads current-state.md entries written by digest callers. Source tag lets it weight evidence. |
| **startwork** | Dispatches digest as background sub-agent when 3+ sessions are undigested. Presents diff after session plan. Handles approval and writes. |
| **lesson-scaffold** | Downstream consumer: reads updated scores from current-state.md |
| **standalone** | When user invokes `/session-digest` directly, the main conversation context receives the structured diff, presents it for approval, and writes approved changes to `current-state.md` and `.last-digest-timestamp`. |
