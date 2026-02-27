---
name: startwork
description: Composes a session plan from local state. Reads git status, learning state (goals, arcs, current-state, session logs), schedule, and project context to rank what matters most and propose a time-budgeted session plan. Use when starting a work session, or when the user says "startwork", "start work", "what should I work on", "session plan", or "what's next."
---

# Startwork

Four core phases plus one conditional. Phases 1-4 are read-only —
startwork never writes to learning state files. It reads the landscape
and composes a briefing. Phase 5 (Progress Review) fires only when
enough sessions have accumulated, running in the background during
Phases 2-4 and presenting findings after the session plan is confirmed.

## Path Resolution

Resolve all harness file paths (learning/, .claude/references/,
.claude/consent.json) from the harness root in `~/.claude/CLAUDE.md`,
not the current working directory. If needed, read
`~/.config/weft/root` for the absolute path.

## Phase 0: Sync (pre-gather)

If the harness directory is a git repo with a remote, pull latest
learning state before reading it:

```bash
cd <harness-root> && git pull --ff-only 2>/dev/null
```

Silent on failure — the session still works with local state. This
ensures cross-machine sync when the learner has pushed learning state
from another device.

## Phase 1: Gather

Read all local data sources. Fail fast and degrade gracefully — every
source is optional. No network calls.

### Step 1: Learning state check

Check whether `learning/current-state.md`, `learning/goals.md`, and
`learning/arcs.md` exist.

- **All exist:** Full gather. Proceed normally.
- **Some exist:** Work with what's available. Silent — don't warn about
  individual missing files.
- **None exist:** Tell the user: "No learning profile found. I can work
  from git state and project context. Run `/intake` for a fuller
  picture." If they proceed, Tiers 3 (Unblocking) and 4 (Growth-edge)
  have no data — the briefing focuses on Tiers 1, 2, and 5.

### Step 2: Git state

Run:
- `git status --short` — uncommitted work (Tier 1 continuation signal)
- `git branch --show-current` — current branch name
- `git log --oneline -10` — recent commits

Interpretation:
- Feature branch + uncommitted changes = strongest Tier 1 signal
- Feature branch + clean = weaker continuation (finished a unit, may
  want to continue or switch)
- Main/master branch + clean = no continuation signal

### Step 3: Session logs

List files in `learning/session-logs/`. For each log file, read the
YAML frontmatter. Extract:

```yaml
date: YYYY-MM-DD
project: project-name
concepts:
  - name: concept-name
    score: N
    gap: type
arcs:
  - arc-name
```

Also scan the body of the most recent log for a "remaining work" or
"next steps" section — this feeds directly into Tier 1 continuation.

From the collected frontmatter, build a picture of:
- **Last session date** — how long since the user last worked
- **Active project** — what project was last worked on
- **Recent concepts and scores** — what was just reviewed and where gaps
  remain
- **Arcs touched recently** — which developmental lines are active
- **Unfinished threads** — remaining work noted in recent logs

If no session logs exist, this is the first session. Skip silently.

### Step 3b: Progress-review check

After reading session logs, check whether a progress review is due:

1. Check for `learning/.progress-review-log.md`. Read the most recent
   entry's `date` field. If the file doesn't exist, no prior review.
2. Count session logs since that date (or all logs if no prior review).
3. If count > 2: dispatch the progress-review skill as a background
   sub-agent (`subagent_type: "general-purpose"`,
   `run_in_background: true`). Pass it:
   - All session log frontmatter for the review period
   - Full contents of `learning/current-state.md`, `learning/goals.md`,
     `learning/arcs.md`
   - List of scaffold files in `learning/scaffolds/` (with dates)
   - `git log --oneline -20`
   - Data source inventory (what exists, what's missing)
   - The full contents of `.claude/skills/progress-review/SKILL.md`
   - Contents of `learning/.progress-review-log.md` (for deferred
     findings)
   Continue to Step 4 without waiting.
4. If count ≤ 2: skip silently. No mention to user.

### Step 4: Learning state

If the learning state files exist, read them:

**`learning/current-state.md`** — concept inventory table. Extract:
- Low-scoring concepts (score ≤ 2) — candidates for growth-edge work
- Stale concepts (last-updated > 2 weeks) — may need refresh
- Gap types — conceptual vs. procedural vs. recall informs what kind
  of work is needed
- Evidence sources — quiz-verified scores carry more weight than
  estimates (see `.claude/references/scoring-rubric.md`)

**`learning/goals.md`** — active goals. Extract:
- Goal aspirations and timeframes
- Capabilities required for each goal

**`learning/arcs.md`** — developmental lines. Extract:
- Current state of each arc
- Next move (reps or abstraction)
- Dependencies (hard prerequisites, bridges)
- Which goals each arc serves

Cross-reference: which arcs are closest to their next milestone? Which
concepts are on the growth edge (score 2-3, gap identified, actively
being worked)? Consult `.claude/references/developmental-model.md` for
the ordering heuristic.

### Step 5: Schedule / deadlines

Discover schedule information through convention-based search:

1. Check the project's CLAUDE.md for a schedule reference or path
2. Look for `schedule.md` or `SCHEDULE.md` at the project root
3. Check for date-bearing sections in `README.md`

If found, extract items with:
- Dates (due dates, milestones, demo dates)
- Status markers (Done, In progress, Planned)
- Time estimates if annotated

Compute proximity: days until due. Items due within 48 hours rank
highest within Tier 2.

If no schedule information is found, skip Tier 2 silently.

### Step 6: Project context

Light scan for available work beyond what's already captured:

- Check for `TODO.md`, `.todo`, or similar task files
- Scan `README.md` for task sections or checklists
- Note any agent todo files (`.claude/todos` patterns)

Read file names and section headers, not full content. Items marked
with in-progress or planned status feed into the briefing as available
work. This step is supplementary — if nothing is found, move on.

---

## Phase 2: Rank

Apply the five-tier priority model to gathered data. Each candidate
gets a tier assignment and a brief rationale.

### Tier 1: Continuation

Something already mid-flight. Default to finishing what you started —
context-switching fragments awareness.

Signals, strongest to weakest:
- Uncommitted work on a feature branch
- In-progress items in local task files
- "Remaining work" noted in the most recent session log
- Recent commits on a feature branch (finished a unit but more to do)

### Tier 2: Deadline-driven

What has a hard date. Surface proximity and estimated effort.

Format: "X is due in N days, estimated at Y hours of work."

Ranking within tier: due within 48h > due within a week > further out.

### Tier 3: Unblocking

What needs to happen before other things can. Three detection
approaches:

- **Learning prerequisites:** goals.md lists required capabilities;
  current-state.md shows score ≤ 2 for a prerequisite concept; that
  gap blocks progress on an active project.
- **Arc dependencies:** arcs.md tracks hard prerequisites and bridge
  dependencies per arc. If a prerequisite arc is stalled, flag it.
- **Textual signals:** scan gathered materials for dependency language
  ("depends on", "requires", "blocked by", "unblocks").

### Tier 4: Growth-edge

Where the developmental frontier is, surfaced through the lens of
active projects. This is where the learning happens.

Use the ordering heuristic from `.claude/references/developmental-model.md`:
breadth, compounding, upstreamness, time-to-value, complexity-chunking
gap.

The growth-edge item should connect a project need to a learning
opportunity: "This project needs X, and you're at level Y — this is
where the learning happens."

### Tier 5: Maintenance

Important over time, never urgent in a given session:
- Stale todos (> 48 hours old)
- Cleanup and documentation tasks
- Review items with no deadline pressure

### Demotion rule

Items with flags rank below clean items at the same tier. Flags:
- `blocked` — explicitly annotated as blocked
- `needs-decision` — requires a decision before work can proceed
- `waiting-on-external` — depends on something outside the user's
  control

---

## Phase 3: Present

### Step 1: Ask for time budget

> How much time do you have today?

Accept natural language ("a couple hours", "30 minutes", "all
afternoon"). Confirm the number: "Got it — about 2 hours."

### Step 2: Compose session briefing

Given the ranked list and the time budget, compose a session briefing.
Four sections:

**The gap that matters most right now**

Narrative synthesis of the highest-priority context. Connects goal →
current state → active project → deadline (as applicable). Answers
"why this, why now" in 3-5 lines.

**What your project needs today**

Numbered list, time-estimated, fitting within the declared budget.
Each item includes:
- Task description (concrete, actionable)
- Time estimate
- Why it matters (tier rationale, briefly)
- Learning note if at the growth edge ("you're at level 2 with X,
  this is where the learning happens")

**Also on your radar**

Bulleted list of items that didn't make the plan but are worth knowing
about: deferred work, stale items, other projects, items from lower
tiers.

**Something to try**

One playful suggestion connected to the growth edge. A small,
exploratory, low-stakes variant of the work — the kind of thing you'd
build just to see what happens. This serves the explore state: playful
attention with low cost of failure.

### Presentation style

- Plain language throughout. No developmental model jargon.
- The briefing should be scannable in under 2 minutes.
- Time estimates are rough — "about 45 min", not "43 minutes."
- When a concept score or gap type informs a recommendation, show the
  insight, not the data: "you're growing with X" not "score: 2,
  gap: procedural."

### Example output

```
## Session Briefing — Monday Feb 24

### The gap that matters most right now
- Goal: "Build and deploy full-stack apps independently"
- Current state: solid backend, growing React, growth edge
  at state management and frontend testing
- Active project: Assignment 4 (exercises useReducer +
  testing — directly at the edge)
- Due Wednesday. ~4-6h remaining.

### What your project needs today (you said ~3 hours)
1. Finish API endpoints (45 min) — continuation, unblocks frontend
2. The frontend component needs useReducer — you're at level 2,
   this is where the learning happens (1.5h)
3. If time: write one test for the endpoint (30 min) — growth-edge,
   new territory

### Also on your radar
- Weft: solo startwork design (serves a different goal —
  "build tools that compound learning")
- Stale todo from Friday: error handling refactor (48h old)

### Something to try
- The useReducer component could be playful — build the smallest
  silliest thing that needs it before tackling the assignment
```

---

## Phase 4: Confirm

Present the session briefing. Three possible responses:

- **Approve:** "Sounds good" / "Let's go" → Print a compact plan
  summary and begin the session.
- **Adjust:** User modifies priorities, swaps items, changes time
  estimates → Recompose the relevant sections and re-present.
- **Override:** "Actually I want to work on X" → Accept without
  arguing. Acknowledge the choice. If the skill gathered relevant
  context about that item (deadline, prerequisites, learning state),
  mention it briefly. The system proposes; the human decides.

Startwork is done. The session begins. No files written, no state
persisted — unless Phase 5 fires.

---

## Phase 5: Progress Review (conditional)

Only runs if a progress-review sub-agent was dispatched in Step 3b.

1. After the user confirms the session plan (Phase 4), check if the
   progress-review sub-agent has returned.
2. **If returned:** Present findings. "I also looked across your recent
   sessions and noticed some patterns." Show the review summary and
   proposed changes. User approves all / selects specific changes /
   adjusts / defers / rejects.
   - **Approve (all or selective):** Startwork writes approved changes
     to learning state files. Tag updates as `progress-review:pattern`.
     Startwork appends the review to `learning/.progress-review-log.md`
     per the progress-review skill's Phase 4 log format (date, sessions
     reviewed, themes with applied/deferred status, changes applied,
     deferred items).
   - **Defer:** Startwork appends the review log with deferred findings
     recorded. No learning state changes. Deferred findings escalate
     next review.
   - **Reject:** Startwork appends the review log with empty changes
     and empty deferrals. This advances the review window so the same
     sessions aren't re-analyzed.

   In all three cases startwork is the writer — the progress-review
   sub-agent returns findings but does not write files.
3. **If not yet returned:** "I'm also running a learning review across
   your recent sessions — I'll share when it's ready." Check again
   after a brief pause. Present when available.
4. **If failed:** Skip silently. Don't mention it. The session
   proceeds.

Startwork's read-only contract is preserved for Phases 1-4. Phase 5
writes happen only with explicit user approval, following the
progress-review skill's log format and evidence tagging conventions.

---

## Graceful Degradation

| Missing | Effect |
|---------|--------|
| All learning state | Tiers 3-4 unavailable. Briefing from git + schedule + project context. Suggest `/intake`. |
| `current-state.md` only | Growth-edge limited. Goals and arcs still provide direction. |
| Session logs empty | No "last session" context. Git provides continuation signals. |
| Schedule not found | Tier 2 unavailable. Silent. |
| No git repo | Tier 1 weakened. Unusual but not an error. |
| Everything empty | "This looks like a fresh start. What are you working on?" — simple planning conversation. |

Never error on missing data. Degrade the briefing silently. Only
surface a message when the degradation meaningfully changes what
the skill can offer.

---

## Anti-Patterns

- **Don't teach during startwork.** Name the growth edge; the session
  teaches. Startwork composes attention, not content.
- **Don't write to learning state in Phases 1-4.** Startwork's core is
  read-only. Phase 5 (progress-review) may write with user approval,
  but that runs through the progress-review skill's own protocol.
- **Don't rank personal vs. team work.** If both contexts exist, present
  both domains clearly labeled. The human decides which gets their time.
- **Don't ignore the override.** If the user says "I want to work on X,"
  accept it. Offer context, not resistance.
- **Don't bloat the briefing.** If it takes more than 2 minutes to read,
  it has failed. This is an attention composition, not a report.
- **Don't hardcode paths.** Use convention-based discovery for schedule
  and project context files.

## Consent Gate — External Signal Paths

Startwork may check for teacher responses on the learner's signal repo
(teacher-response check, when built). All external signal paths obey
one consent gate:

- **Check `.claude/consent.json`.** If absent, the user has not
  consented to data sharing — skip all external queries silently.
- **Check `learning/relationships.md`.** If absent or has no
  `signal_repo`, skip the teacher-response check silently.
- Both checks run before any network call. No prompt, no mention —
  just skip.
