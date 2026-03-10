---
name: progress-review
description: Cross-session learning pattern analysis. Reads multiple session logs and learning state to detect stalls, regressions, goal drift, and arc readiness that no single session review can see. Proposes updates to learning state files. Use when the user asks "how am I doing", "review my progress", "am I improving", or "progress review". Also dispatched automatically by startwork when enough sessions have accumulated.
---

# Progress Review

Analyzes learning patterns across multiple sessions. Detects what
single session reviews miss: stalls, regressions, goal drift, arc
readiness, and calibration mismatches. Proposes structural updates to
learning state files. All changes are human-gated.

Two activation paths. The phase structure is the same for both.

## Activation

### Path A: Dispatched from startwork (primary)

Startwork dispatches this skill as a background sub-agent when both
threshold gates pass (minimum days since last review AND minimum
substantive session count — both configurable in
`~/.config/weft/config.json`). The sub-agent receives:

- The full session-discovery manifest (all sessions, unfiltered)
- All session log frontmatter for the review period
- Full contents of `learning/current-state.md`, `learning/goals.md`,
  `learning/arcs.md`
- List of scaffold files in `learning/scaffolds/` (with dates)
- `git log --oneline -20`
- Contents of `learning/.progress-review-log.md` (for deferred findings)

When running as a sub-agent:

1. Skip Gather phase gates (day + session count) — startwork already
   applied them.
2. Cross-reference the passed manifest against session log frontmatter
   dates to identify unreviewed sessions. Match by calendar date of
   session start time.
3. If unreviewed sessions exist: dispatch session-digest as foreground
   sub-agent. Pass:
   - The filtered manifest (unreviewed sessions only)
   - Full contents of `learning/current-state.md`
   - Full contents of `.claude/skills/session-digest/SKILL.md`
   - Instruction: "Skip your Phase 1 discovery. Use this session
     manifest as your session list: [manifest JSON]. Proceed directly
     to Phase 2 Extract for these sessions. Return structured diff
     per your Output Format section."
   Receive the structured diff. (Do not parse JSONL directly — digest
   handles extraction.)
4. Proceed to Phase 1 with session log data + digest output.

If session-discovery manifest was not passed (startwork failed to run
discovery): proceed with session log frontmatter only. Note reduced
coverage in Phase 3 output.

### Path B: Direct invocation (secondary)

The user invokes the skill directly. Run the Gather phase first, then
proceed through Phases 1-4 inline.

---

## Gather (Path B only)

Read all data sources. Every source is optional — degrade gracefully.

1. Read `~/.config/weft/config.json`. Extract `progressReviewDays`
   (default 3) and `progressReviewSessions` (default 5).
2. Read `learning/.progress-review-log.md` for last review date. If
   file doesn't exist: first run. Set window start to intake date
   (creation date of `learning/current-state.md` via `stat`). Pre-
   intake sessions have no learning profile to compare against.
3. **Day gate:** compute days since last review. If <
   `progressReviewDays`: "Last progress review was N days ago — too
   recent for cross-session patterns. Run again in M days, or proceed
   anyway?" If they decline, stop. First run (no prior review date):
   day gate passes automatically.
4. **Run session-discovery** for the review window:
   ```bash
   bun "$(cat ~/.config/weft/root)/scripts/session-discovery.ts" --since <window-start>
   ```
   If session-discovery fails (bun not found, script error): warn and
   fall back to session log count for the session gate (step 5). Set
   a flag (`discoveryFailed = true`) so later steps know to skip
   cross-referencing and digest dispatch.
5. **Session gate:** filter the discovery manifest for substantive
   sessions (`userMessageCount >= 10`). Count them. If count <
   `progressReviewSessions`: "Only N substantive sessions since the
   last review — not enough for cross-session patterns yet." Offer to
   proceed. If they decline, stop.
   - **Fallback (discoveryFailed):** count session logs in
     `learning/session-logs/` since the window start. Apply
     `progressReviewSessions` threshold against that count.
6. **Cross-reference** discovery manifest against session logs. Match
   by calendar date of session start time: a session starting on
   2026-03-04 matches `2026-03-04.md` if that file exists. Sessions
   with a match = reviewed. Others = unreviewed. (Skip if
   discoveryFailed.)
7. **Dispatch session-digest as foreground sub-agent** for unreviewed
   sessions. Pass:
   - The filtered discovery manifest (unreviewed sessions only)
   - Full contents of `learning/current-state.md`
   - Full contents of `.claude/skills/session-digest/SKILL.md`
   - Instruction: "Skip your Phase 1 discovery. Use this session
     manifest as your session list: [manifest JSON]. Proceed directly
     to Phase 2 Extract for these sessions. Return structured diff
     per your Output Format section."
   Receive the structured diff. Hold it for Phase 1.
   - If no unreviewed sessions: skip dispatch, proceed normally.
   - If digest fails: warn, continue with session logs only.
   - (Skip entirely if discoveryFailed.)
8. Read YAML frontmatter from each session log in the review window.
   Read the body of the most recent 3 logs.
9. Read `learning/current-state.md`, `learning/goals.md`,
   `learning/arcs.md` (each optional — note what's missing).
10. List `learning/scaffolds/` files with dates.
11. Run `git log --oneline -20` for project work evidence.
12. Read `learning/.progress-review-log.md` deferred entries (if any).

Proceed to Phase 1 with whatever data is available.

---

## Phase 1: Analyze

Single-pass analysis across four lenses. Returns findings only — zero
file writes. If session-digest was dispatched (Gather step 7 or Path A
step 3), its structured diff supplements session log data for all four
lenses.

### Deferred finding check

Before analyzing new patterns, check `learning/.progress-review-log.md`
for the most recent entry's `deferred:` items. For each:
- If the pattern still exists or worsened: promote to high priority
- If the pattern resolved: note as resolved (no action needed)

### Concept lens

Detects patterns in concept scores across sessions:

- **Stalls:** quizzed ≥ 3 times, score stuck ≤ 2. The learner is
  putting in reps but the approach isn't working.
- **Regressions:** score dropped ≥ 2 from a previously-solid concept,
  or dropped below 3 after being ≥ 4. Something that was working isn't
  anymore.
- **Score velocity:** improving / flat / declining per concept across
  sessions in the review window. Flat at a low score is a stall signal.
  Flat at a high score is fine.
- **Scaffold calibration mismatches:** lesson-scaffold classified a
  concept as "solid" but session-review scored it ≤ 2, or scaffold said
  "prerequisite gap" but learner scored ≥ 4. Indicates the learner
  model was wrong at scaffold time.

Data: `learning/current-state.md`, session log frontmatter (concepts,
scores), `learning/scaffolds/` files, digest structured diff (for
unreviewed sessions — `digest:observed` weighted below `session-review:quiz`).

If `current-state.md` is missing: concept lens limited to session log
scores only.

### Arc lens

Detects patterns in developmental arc progression:

- **Arc readiness:** repeated procedural success across sessions
  suggests the learner is ready to move from reps to abstraction.
  Look for score ≥ 3 on multiple arc-related concepts + evidence of
  successful application in session logs or git.
- **Unblocking sequences:** goal requires arc X, which is blocked by
  arc Y or concept Z. Surface the dependency chain.
- **Compounding breakdown:** arc touched in many sessions but scores
  and arc state not advancing. Effort is scattered, not focused.
- **Workflow friction:** repeated blockers or never-completed
  "remaining work" items across session logs.

Data: `learning/arcs.md`, session log frontmatter (arcs), session log
bodies, git log, digest concept-arc mappings (for unreviewed sessions).

If `arcs.md` is missing: arc lens skipped.

### Goal lens

Detects patterns in goal alignment:

- **Project-goal mapping gaps:** active project work (from session logs
  and git) not connected to any stated goal.
- **Unconnected effort:** sessions with no goal or arc mapping in
  frontmatter. Work is happening but not tracked.
- **Goal drift:** stated goal framing doesn't match observed work
  trajectory. The learner may be pursuing something different than what
  they wrote down.
- **Play-state vs grind-state:** ratio of new concepts to repeated
  concepts across sessions. High repetition with low novelty suggests
  grind; high novelty suggests exploration. Neither is bad, but the
  pattern should be visible.

Data: `learning/goals.md`, `learning/arcs.md`, session log frontmatter
(project, concepts, arcs), digest flags (activity not mapping to
existing arcs feeds directly into "unconnected effort" detection).

If `goals.md` is missing: goal lens skipped.

### Learner model lens

Detects patterns in learner behavior that should update the CLAUDE.md
predictive sections. Reads enrichment principles from
`.claude/references/claude-md-template.md` and the user's current
`~/.claude/CLAUDE.md` (weft section).

- **Recurring learning mechanics** (2+ sessions): the learner
  consistently acquires understanding through a specific pattern not
  yet captured in "How {name} learns."
- **Recurring unblocking patterns** (2+ sessions): the same
  intervention type works repeatedly — not yet in "How {name} gets
  unblocked."
- **Error shape patterns**: mistakes cluster in a recognizable shape
  across sessions (e.g., "correct structure, wrong boundary" or
  "right concept, wrong execution order").
- **Strength evidence accumulation**: a prior-domain capability
  surfaces in multiple sessions — warrants a "Strengths" entry or
  upgrade.
- **Model contradictions** (3+ sessions): an existing CLAUDE.md entry
  doesn't match observed behavior. Higher threshold because
  contradictions modify existing entries.

**If predictive sections are missing** from the CLAUDE.md (predates the
learner model template): propose creating them when cross-session
evidence supports entries. Organic migration, same as session-review.

**Threshold:** 2+ sessions for new entries (higher than session-review's
single-session threshold). Contradictions require 3+ sessions.

Data: `~/.claude/CLAUDE.md` (weft section), session log bodies and
frontmatter, `.claude/references/claude-md-template.md` (enrichment
principles), digest procedural observations (for unreviewed sessions).

If CLAUDE.md weft section is missing: learner model lens skipped.

---

## Phase 2: Synthesize

Group findings into themes. **3-5 themes maximum.** For each theme:

- **What's happening** — plain language, no jargon
- **Evidence** — specific session dates, scores, log references
- **Why it matters** — what this means for the learner's trajectory
- **Suggested action** — one of:
  - `state-update` — score adjustment, gap reclassification
  - `arc-update` — readiness transition, dependency reorder
  - `goal-update` — drift correction, reframing
  - `model-update` — CLAUDE.md learner model entry (add, upgrade, or correct)
  - `process-suggestion` — workflow change, focus shift
- **Draft file changes** where applicable: show current value →
  proposed value, with one-line rationale

**"No findings" is valid.** If no patterns meet diagnostic criteria:
"Reviewed N sessions. No cross-session patterns detected. Learning
state looks consistent." Log the review and stop.

### State-write priority rule

Session-review scores from direct observation and quiz supersede
progress-review's pattern-inferred adjustments.

When proposing a score change that conflicts with a session-review
score from the current review window:
- Note the conflict explicitly
- Explain why cross-session pattern evidence suggests otherwise
- Default to the session-review score unless ≥ 3 data points across
  sessions support the pattern

Tag all proposed updates as `progress-review:pattern` per
`.claude/references/scoring-rubric.md`.

---

## Phase 3: Present

**When dispatched from startwork:** return findings as structured text.
Startwork handles presentation to the user.

**When invoked standalone:** present findings directly.

Format (both paths):
- **Coverage line:** "Analyzed N sessions (M reviewed via session-review,
  K digested from transcripts)." If discovery or digest failed, note the
  gap: "N sessions found in logs only — transcript analysis was
  unavailable."
- Review summary with themes in priority order
- Deferred findings from prior review: resolved or escalated
- Proposed changes grouped by file, each showing current → proposed
- Ask the user to approve, select specific changes, adjust, defer, or
  reject

Plain language throughout. The review should be readable in under 3
minutes. Show insights, not raw data.

---

## Phase 4: Write

Apply approved changes only.

### State file updates

Write approved changes to `learning/current-state.md`,
`learning/arcs.md`, `learning/goals.md`, and/or `~/.claude/CLAUDE.md`
(weft section, for `model-update` actions). Tag every score update
with `progress-review:pattern`. CLAUDE.md changes follow the same
human-gated approval flow as all other state file updates.

### Digest timestamp

If session-digest was dispatched during Gather (step 7) or Path A
(step 3), update `learning/.last-digest-timestamp` to the latest
digested session's end date after all state file writes complete. This
prevents future digest runs (startwork 3c, session-review, standalone
/session-digest) from re-processing sessions already covered by this
review.

### Review log

Append an entry to `learning/.progress-review-log.md`:

```yaml
---
date: YYYY-MM-DD
sessions-reviewed:
  - YYYY-MM-DD
  - YYYY-MM-DD
  - YYYY-MM-DD
themes:
  - name: theme name
    pattern-type: stall | regression | readiness | drift | friction
    action: state-update | arc-update | goal-update | process-suggestion
    applied: true | false | deferred
changes-applied:
  - file: learning/current-state.md
    description: brief description of change
deferred:
  - description of deferred finding
---
```

The log's most recent `date` sets the window start for the next review.

If the user approved no changes and deferred nothing, still log the
review (with empty `changes-applied` and `deferred` lists) so the
window advances.

---

## Graceful Degradation

| Missing | Effect |
|---------|--------|
| All learning state except session logs | Concept analysis from session scores only. No arc/goal analysis. |
| `goals.md` | Goal lens skipped. Arc and concept lenses still work. |
| `arcs.md` | Arc lens limited. Goal lens loses arc-goal mapping. |
| Scaffolds empty | Scaffold calibration checks skipped silently. |
| `.progress-review-log.md` | First run. Window starts at intake date. No deferred findings to check. |
| Below session threshold (startwork path) | Should not fire — startwork applies both day and session gates. |
| Below session threshold (standalone path) | Warn user. Offer to proceed. Cross-session patterns limited. |
| Session-discovery fails | Cross-reference and digest dispatch skipped. Analysis from session logs only. Coverage note in Phase 3. |
| Digest sub-agent fails | Unreviewed sessions excluded from analysis. Coverage note in Phase 3. Session logs still analyzed. |

Never error on missing data. Degrade each analytical lens silently.
Only surface a message when the degradation meaningfully changes what
the skill can offer.

---

## Boundaries

- **Don't compete with session-review** — session-review owns
  single-session scoring. Progress-review owns cross-session patterns.
- **Don't ignore deferrals** — if a deferred finding persists or
  worsened, escalate its priority.
- **Don't block startwork** — if analysis fails as a background
  sub-agent, startwork proceeds unaffected.

## Consent Gate

External publishing requires both `.claude/consent.json` and
`learning/relationships.md` with a `signal_repo`. If either is absent,
skip silently.
