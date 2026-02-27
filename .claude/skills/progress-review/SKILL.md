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

Startwork dispatches this skill as a background sub-agent when
unreviewed sessions exceed 2. The sub-agent receives session log
frontmatter, learning state files, scaffold list, and git log summary.
Findings are presented after the user confirms the session plan.

When running as a sub-agent: skip the Gather phase (data is passed in).
Start at Phase 1.

### Path B: Direct invocation (secondary)

The user invokes the skill directly. Run the Gather phase first, then
proceed through Phases 1-4 inline.

---

## Gather (Path B only)

Read all data sources. Every source is optional — degrade gracefully.

1. Read `learning/.progress-review-log.md` for last review date.
   First run (file doesn't exist) = no prior review.
2. List files in `learning/session-logs/`. Count logs since last review
   date (or all logs if first run).
3. **If count ≤ 2:** Tell the user: "Only N session(s) since the last
   review — not enough data for cross-session patterns yet." Offer to
   proceed anyway if the user insists. If they decline, stop.
4. Read YAML frontmatter from each session log in the review window.
   Read the body of the most recent 3 logs.
5. Read `learning/current-state.md`, `learning/goals.md`,
   `learning/arcs.md` (each optional — note what's missing).
6. List `learning/scaffolds/` files with dates.
7. Run `git log --oneline -20` for project work evidence.
8. Read `learning/.progress-review-log.md` deferred entries (if any).

Proceed to Phase 1 with whatever data is available.

---

## Phase 1: Analyze

Single-pass analysis across four lenses. Returns findings only — zero
file writes.

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
scores), `learning/scaffolds/` files.

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
bodies, git log.

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
(project, concepts, arcs).

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
principles).

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
| `.progress-review-log.md` | First run. Review all available session logs. No deferred findings to check. |
| 1-2 session logs (startwork path) | Should not fire — startwork threshold is > 2. |
| 1-2 session logs (standalone path) | Warn user. Offer to proceed. Cross-session patterns limited. |

Never error on missing data. Degrade each analytical lens silently.
Only surface a message when the degradation meaningfully changes what
the skill can offer.

---

## Anti-Patterns

- **Don't teach** — identify patterns, don't explain concepts. This
  is a diagnostic, not a lesson.
- **Don't auto-write** — every change is human-gated. Present proposed
  changes; wait for approval.
- **Don't invent patterns** — every finding needs specific evidence
  (session dates, scores, log references). "No patterns detected" is
  valid and useful.
- **Don't use jargon** — plain language in all user-facing output.
  "You've been stuck on X" not "stall detected: times-quizzed ≥ 3,
  score ≤ 2."
- **Don't bloat** — 3-5 themes max. If the review takes more than 3
  minutes to read, it has failed.
- **Don't ignore deferrals** — if a finding was deferred in a prior
  review and the pattern persists or worsened, escalate its priority.
  Problems don't disappear because they were postponed.
- **Don't block startwork** — when running as a background sub-agent,
  if analysis fails or takes too long, startwork proceeds unaffected.
  This skill is an enrichment, not a gate.
- **Don't compete with session-review** — session-review owns
  single-session scoring from direct observation. Progress-review owns
  cross-session patterns. Different evidence bases, different
  confidence levels, different scopes.

## Consent Gate — External Signal Paths

Progress-review may publish to the learner's signal repo (Phase 5,
when built). All external signal paths obey one consent gate:

- **Check `.claude/consent.json`.** If absent, the user has not
  consented to data sharing — skip all external publishing silently.
- **Check `learning/relationships.md`.** If absent or has no
  `signal_repo`, skip teacher-facing publishing silently.
- Both checks run before any network call. No prompt, no mention —
  just skip.
