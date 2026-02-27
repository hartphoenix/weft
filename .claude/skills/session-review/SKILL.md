---
name: session-review
description: End-of-session learning review. Analyzes session for learning patterns and concept coverage, quizzes on 4-6 concepts biased toward gaps, then logs results to session log frontmatter and current-state.md. Use at the end of a working session or when the user requests a review, quiz, or session summary.
---

# Session Review

Four phases, in order. Do not skip or reorder. Phase 4 is optional.

## Path Resolution

Resolve all harness file paths (learning/, .claude/references/,
.claude/consent.json) from the harness root in `~/.claude/CLAUDE.md`,
not the current working directory. If needed, read
`~/.config/weft/root` for the absolute path.

## Phase 1: Analyze

1. Read `learning/current-state.md` to load current learning state.
   - If the file doesn't exist, warn the user that intake hasn't been run
     (or the file was deleted). Offer to proceed anyway — scores from this
     review will be initial estimates, tagged `source: session-review`
     rather than `source: intake`. Create the file during Phase 3 (Log)
     if it doesn't exist.

2. **Determine the review window.**
   Find the last session-review date: check the most recent file in
   `learning/session-logs/` for its `date:` frontmatter. If no daily
   notes exist, this is the first review — the window starts at intake
   (or repo init).

3. **Gather evidence since last review.** Three evidence sources,
   gathered in parallel where possible:

   a. **Conversation context** — the current session's full conversation
      history. Always available; primary source for the current session.

   b. **Git history since last review:**
      ```
      git log --since="YYYY-MM-DD" --oneline
      git diff <last-review-date>..HEAD --stat
      ```
      Shows what was built, what files changed, commit messages reveal
      intent. For large diffs, use `--stat` first to get the manifest,
      then read only files relevant to learning (not config, not lock
      files).

   c. **Artifacts produced** — new or modified files since the review
      window. Use `git diff --name-status` to get the list. Focus on
      source code, tests, and documentation the user wrote (not
      generated files).

   d. **Prior session logs in the window** — session logs are created
      only by this skill (Phase 3). If multiple reviews ran on the
      same day or in a short window, read their frontmatter for
      already-logged concepts and scores. Don't re-quiz concepts
      already reviewed in the window.

   e. **Lesson scaffolds in the window** — check `learning/scaffolds/`
      for scaffold files dated within the review window. If found,
      read concept classifications (solid / growing / new /
      prerequisite gap) and the execution sequence. These are
      predictions made before the session — use them as a baseline
      to validate against session evidence. Note where the scaffold's
      classification was accurate and where it was wrong (e.g.,
      scaffold predicted "solid" but the learner struggled, or
      predicted "prerequisite gap" but the learner handled it fine).
      These discrepancies are high-value calibration data.

4. **Context management gate.**

   After gathering the evidence manifest (file list + conversation
   size + git stat), assess total volume:

   **If manageable** (conversation is the primary source, git diff is
   < ~200 lines, < ~10 modified files): analyze inline. Read the
   relevant diffs and conversation, produce the analysis directly.

   **If context-heavy** (large git diff, many modified files, multiple
   unreviewed sessions): apply manifest-then-delegate from
   `.claude/references/context-patterns.md` pattern #1. Dispatch a
   sub-agent with:
   - The evidence manifest (file paths, git stat, session log dates)
   - The current `learning/current-state.md` content
   - Instructions to read the files/diffs and return a structured
     analysis report: concepts encountered (with evidence), strengths,
     growth edges (named gaps), procedural observations

   The main agent works from the sub-agent's report, never falling
   back to reading raw evidence itself. If the sub-agent fails, retry
   once or dispatch fresh.

5. **Analysis output.** Whether analyzed inline or via sub-agent, the
   output is:
   - Concepts encountered (with specific evidence: file, commit, or
     conversation reference)
   - Strengths (what the user did well, with evidence)
   - Growth edges (name the gap type — conceptual/procedural/recall —
     not just the topic)
   - Procedural observations (workflow patterns, tool usage, debugging
     approach)

6. Select 4-6 quiz targets. Bias toward partial/stuck concepts. Include at least one application question. If learning/current-state.md has stale low-score concepts relevant to the session, resurface them.

7. Present the analysis before quizzing: strengths, growth edges, quiz targets with rationale.

Honest feedback is the default. The learner is here to grow, not to be reassured. 100% positive review is a failure of the skill — always surface growth edges.

## Phase 2: Quiz

Present all questions as free-text prompts. Evaluate answers after the user responds.

**Question type follows gap classification:**
- **Conceptual** → "Explain why..." / "What happens if..."
- **Procedural** → "Write the code..." / "What would you reach for?"
- **Recall** → "What are the..." / "Name the..."
- **Application** → "Given [novel scenario], how would you..."

Score each answer 0-5 using the rubric in
`.claude/references/scoring-rubric.md`. Classify gap type from the
answer: mental model wrong = conceptual, right concept but wrong
execution = procedural, can't reproduce = recall. Correct errors
directly — brief and on-task.

**Score the shape of the model, not the precision of the words.** A correct pipeline with wrong locations is a 3; a wrong pipeline is a 2. The question is "does this person understand the system?" — not "did they name every mechanism?"

**Prioritize concepts that compound.** A concept's review value scales with how many other concepts depend on it. If understanding X is a prerequisite for Y, Z, and W, drill X. If X is a leaf node — one thing, no dependencies downstream — it's a lookup, not a quiz target.

**The most important concepts may not be the ones that produced errors.** Architectural decisions, design principles, and structural reasoning often compound more than implementation details. A session that includes both systems design and debugging should weight the design questions higher, not default to quizzing on the bugs.

**Quiz at the right altitude.** If a concept is a detail of something larger, check whether the parent concept is the real learning edge. "How does `Set-Cookie` work?" might be a subquestion of "how does session-based auth work?" — quiz the one that matters more.

## Phase 3: Log

### Session log (`learning/session-logs/YYYY-MM-DD.md`)

Check whether a session log already exists for today's date. Other
skills (lesson-scaffold) may have created one earlier in the session.

**If it exists:** merge into it. Read existing YAML frontmatter and
preserve any fields already present (e.g., `scaffold:`). Add or update
`project:`, `concepts:`, and `arcs:` fields. Append to the body —
don't overwrite existing content.

**If it doesn't exist:** create it with full frontmatter:

```yaml
---
date: YYYY-MM-DD
project: project-name
concepts:
  - name: concept-name
    score: N
    gap: type  # only when score < 4
arcs:
  - arc-name
---
```

Body: what happened, quiz results table, learning patterns, key files, remaining work.

### current-state.md (`learning/current-state.md`)

Update quizzed concepts: score, gap, last-quizzed, increment
times-quizzed, append to history.

Each concept is a YAML list entry under `concepts:`:

~~~yaml
  - name: concept-name
    score: 3
    gap: conceptual        # omit or use -- when score >= 4
    source: session-review:quiz
    last-updated: YYYY-MM-DD
    last-quizzed: YYYY-MM-DD
    times-quizzed: 1
    history:
      - { date: YYYY-MM-DD, score: 3, note: "brief qualitative note" }
~~~

Tag every score update with its
evidence source per `.claude/references/scoring-rubric.md`:

- `session-review:quiz` — scored from a quiz answer (default for this
  skill)
- `session-review:observed` — evident from session work but not directly
  quizzed (use sparingly — only for concepts with strong behavioral
  evidence from commits or artifacts)

Create new entries as needed. Check existing names first — don't create
near-duplicates. Quiz-verified scores supersede prior estimates
(`intake:self-report`, `intake:inferred`) for the same concept.

### Goals and arcs check (`learning/goals.md`, `learning/arcs.md`)

After updating current-state, read `learning/goals.md` and
`learning/arcs.md`. Check whether session evidence suggests updates:

**Goals (`learning/goals.md`):**
- A goal has been achieved or is no longer relevant
- A new aspiration emerged from the session (the learner expressed a
  direction not captured in existing goals)
- A goal's framing needs refinement based on how the learner is
  actually working

**Arcs (`learning/arcs.md`):**
- An arc's current state needs updating (skill progression evident
  from quiz scores or session work)
- An arc's "next move" has shifted (e.g., reps completed, ready for
  abstraction — consult `.claude/references/developmental-model.md`)
- New capability clusters are emerging from the work that don't map
  to existing arcs
- An arc's dependencies have changed (prerequisites met, new bridges
  discovered)

**If updates are warranted:** Present proposed changes to the user
before writing. Show what would change and why — cite specific session
evidence. The user approves, edits, or skips each change.

**If no updates are needed:** Move on silently. Don't force updates
every session — goals and arcs are meant to be stable structures that
evolve gradually, not session-by-session.

These files are consumed by the startwork skill for daily priority
computation — keeping them accurate matters.

### CLAUDE.md enrichment check

After the goals/arcs check, check whether the session produced evidence
for the learner model sections in `~/.claude/CLAUDE.md` (weft section).

1. Read enrichment principles from
   `.claude/references/claude-md-template.md` (the preamble section).
2. Read the user's current `~/.claude/CLAUDE.md` (weft section between
   `<!-- weft:start -->` and `<!-- weft:end -->`).
3. Look for session evidence of:
   - A learning mechanic observed (→ "How {name} learns")
   - An unblocking pattern observed (→ "How {name} gets unblocked")
   - A prior-domain strength actively deployed (→ "Strengths")
   - An existing entry contradicted by session behavior

**If predictive sections are missing** (CLAUDE.md predates the learner
model template): create the sections when you have concrete evidence to
populate them. Propose adding the section header and initial entries.
This is organic migration — don't prompt the user to re-run intake.

**Threshold:** concrete single-session evidence. One clear observation
is enough for a new entry.

**When proposing updates:**
- **New entry:** show the proposed entry with its evidence citation.
- **Upgrade:** show the current entry and the proposed replacement.
  The replacement must be at least as informative (replace, don't
  accumulate — per enrichment principles).
- **Contradiction:** show the existing entry, the contradicting
  evidence, and a proposed revision.

The user approves, edits, or skips each proposed change.

**Most sessions produce no CLAUDE.md updates. That's correct.** Only
propose when evidence is concrete and the entry would change agent
behavior.

## Phase 4: Signal (optional)

If `.claude/consent.json` exists, offer to send a developer signal to
the harness developer. This signal answers "is the harness working
well?" — not "how is the learner doing?"

Two layers: learner feedback (prompted) + agent self-report
(auto-generated), composed into a single issue.

1. Read `.claude/consent.json` to get the target repo.

2. **Prompt for learner feedback.** Ask these questions — the learner
   can answer any, all, or none:

   - "Did the quiz focus on the right things from this session?"
     (yes / mostly / missed something important)
   - "Did the session analysis match your experience?"
     (yes / missed something / got something wrong)
   - "Anything else about how this review went?" (free-text, optional)

   If the learner skips all three, that's fine — the agent self-report
   still has value.

3. **Generate the agent self-report.** Review the session for harness
   observations. Each item follows the surprise pattern: expected →
   found → action taken. Report only items that occurred — omit
   empty sections.

   - **File state issues** — current-state.md missing, session logs
     with malformed frontmatter, schema violations encountered
   - **Instruction ambiguity** — places where SKILL.md was unclear
     and the agent had to guess (expected X, found Y, chose Z)
   - **Context management events** — did the context gate trigger?
     Did sub-agent dispatch succeed or fail? Why?
   - **Concept name drift** — near-duplicate names found across
     sessions, inconsistent gap type usage
   - **Workflow friction** — steps that required workarounds, retries,
     or fell outside what the skill instructions covered

   If no surprises occurred, report "No agent observations" — don't
   invent issues.

4. **Compose and present the signal:**

   ```yaml
   date: YYYY-MM-DD
   type: developer-signal

   learner_feedback:
     quiz_targeting: [yes | mostly | missed something important]
     analysis_accuracy: [yes | missed something | got something wrong]
     notes: "[free-text, if provided]"

   agent_observations:
     - category: [file-state | instruction-ambiguity | context-management | concept-drift | workflow-friction]
       expected: "..."
       found: "..."
       action: "..."
   ```

   > Here's the developer signal for this session. Want to send it?

   Show the exact payload. The learner approves, edits, or skips.
   No default — they choose.

5. If approved, post:

   ```
   gh issue create \
     --repo [repo from consent.json] \
     --title "[signal] YYYY-MM-DD" \
     --body "[composed signal]"
   ```

6. If `.claude/consent.json` doesn't exist or the learner skips,
   move on silently. Never prompt about opt-in outside of intake.

**Privacy boundary:** The signal includes learning data the user
consented to share (concept scores, gap types, progress patterns, goals,
growth edges) plus harness behavior observations and the learner's
explicit feedback about the tool. What **never** goes in: conversation
content, code, file paths, background materials, or raw quiz answers.

**Consent gate:** `.claude/consent.json` is the single consent gate for
all external data sharing. If the file doesn't exist, the user has not
consented — skip Phase 4 silently. If it exists, the user opted in
during intake. Per-signal approval still applies: show the payload,
user approves or skips each time.

## Phase 5: Sync (optional)

After all Phase 3 writes and optional Phase 4 signal, if the harness
directory is a git repo with a remote and `.claude/consent.json` exists
(consent gate), offer to push learning state:

> Want me to sync your learning state to GitHub? This pushes your
> updated scores and session log so they're available on other machines.

If they approve:
```bash
cd <harness-root> && git add learning/ && git commit -m "session-review: update learning state" && git push
```

Non-blocking on failure — warn but don't retry. If they decline, skip
silently.

## Anti-Patterns

- Don't teach during review. Note the gap; the next session teaches.
- Don't inflate scores. A generous 4 hides a concept from spaced repetition.
- Don't log without quizzing. Every logged score comes from a quiz answer, not session observation.
- Don't ask leading questions. Test recall, not recognition.

## Consumer Interfaces

**Progress-review** (built, `.claude/skills/progress-review/`): reads
session log frontmatter + bodies + current-state.md + goals.md +
arcs.md + scaffolds. Detects cross-session patterns (stalls,
regressions, goal drift, arc readiness). Dispatched by startwork when
unreviewed sessions > 2, or invoked standalone. Session-review must
write clean YAML and use consistent concept names across sessions.

**Lesson-scaffold** (built, `.claude/skills/lesson-scaffold/`): reads
recent session log frontmatter to classify concepts relative to the
learner's current state. Uses scores and gap types from session-review
output.

**Startwork** (built, `.claude/skills/startwork/`): reads session log
frontmatter for continuation signals, recent concepts/scores, arc
activity, and unfinished threads.

**Coordination file: `learning/.progress-review-log.md`** — not written
by session-review, but dependent on session-review's output. Progress-review
and startwork both read this file to determine the last review date (for
session-log windowing) and to retrieve deferred findings. They both
append entries after reviews. The review window starts from the date in
this log, covering all session logs since. Session-review's consistent
YAML frontmatter and concept naming across sessions is what makes the
windowing useful.

**Spaced repetition** (future): reads current-state.md only. Prioritizes by score ascending + last-quizzed ascending. Uses gap type to shape question style. Detects stalls via high times-quizzed with low score.
