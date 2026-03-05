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

Read all local data sources. Every source is optional — degrade
gracefully. No network calls.

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

After reading session logs, check whether a progress review is due.
Two gates must both pass.

1. Read `~/.config/weft/config.json`. Extract `progressReviewDays`
   (default 3) and `progressReviewSessions` (default 5).
2. Read `learning/.progress-review-log.md` for last review date. If
   file doesn't exist: first run. Set window start to intake date
   (creation date of `learning/current-state.md` via `stat`).
3. **Day gate:** compute days since last review. If <
   `progressReviewDays`, skip silently. First run (no prior review):
   day gate passes.
4. **Session gate:** run session-discovery for the review window
   (`--since <window-start>`). Filter manifest: count only sessions
   where `userMessageCount >= 10` (substantive sessions). If count <
   `progressReviewSessions`, skip silently.
   - **Fallback:** if session-discovery fails, count session logs in
     `learning/session-logs/` since the window start. Apply
     `progressReviewSessions` threshold against that count.
5. Both gates pass → dispatch progress-review as a background
   sub-agent (`subagent_type: "general-purpose"`,
   `run_in_background: true`). Pass it:
   - The full session-discovery manifest (unfiltered — all sessions
     go to analysis, threshold filtering was just for the gate)
   - All session log frontmatter for the review period
   - Full contents of `learning/current-state.md`, `learning/goals.md`,
     `learning/arcs.md`
   - List of scaffold files in `learning/scaffolds/` (with dates)
   - `git log --oneline -20`
   - Contents of `learning/.progress-review-log.md` (for deferred
     findings)
   - Full contents of `.claude/skills/progress-review/SKILL.md`
   Continue to Step 4 without waiting.
6. If either gate fails: skip silently. No mention to user.

### Step 3c: Digest staleness check

**If progress-review was dispatched in step 3b, skip this step.**
Progress-review handles its own digest dispatch internally and updates
`.last-digest-timestamp` in its Phase 4.

If step 3b did not fire:

1. Read `learning/.last-digest-timestamp`. If missing, use the oldest
   session log filename date. If no logs exist, use
   `current-state.md` creation date. Last resort: 30 days ago.
2. Run session-discovery with `--since <window-start>`.
3. If 3+ undigested sessions: dispatch session-digest as a background
   sub-agent (`subagent_type: "general-purpose"`,
   `run_in_background: true`). Pass it:
   - The session-discovery manifest (limit to 10 most recent sessions)
   - Full contents of `learning/current-state.md`
   - The full contents of `.claude/skills/session-digest/SKILL.md`
   - Instruction: operate in sub-agent mode, return structured diff
   Continue to Step 4 without waiting.
4. If < 3: skip silently.

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

Default to finishing what's mid-flight. Signals, strongest to weakest:
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

Connect a project need to a learning opportunity. Use the ordering
heuristic from `.claude/references/developmental-model.md`: breadth,
compounding, upstreamness, time-to-value, complexity-chunking gap.

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

One playful, low-stakes suggestion connected to the growth edge.

### Presentation style

Plain language — no developmental model jargon. Show insights, not
data: "you're growing with X" not "score: 2, gap: procedural."

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


---

## Phase 5: Background Reviews (conditional)

Only runs if a sub-agent was dispatched in Step 3b or 3c.

### Session-digest results

If step 3c was skipped because progress-review was dispatched (step
3b), there are no standalone digest results to present. The progress-
review sub-agent handles digest internally and includes coverage info
in its findings.

If a session-digest sub-agent was dispatched in Step 3c:
- Present its proposed diff to the user
- User approves/adjusts/rejects
- If approved: write changes to `current-state.md`, update
  `learning/.last-digest-timestamp`
- If more than 10 sessions were undigested, note that older
  sessions remain — user can run `/session-digest` standalone

### Progress-review results

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

---

## Consent Gate

External signal paths (teacher-response checks) require both
`.claude/consent.json` and `learning/relationships.md` with a
`signal_repo`. If either is absent, skip silently.
