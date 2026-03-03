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

3. **Dispatch session-digest as foreground sub-agent.**

   Send to the digest sub-agent:
   - The review window start date (from step 2)
   - Full contents of `learning/current-state.md`
   - Full contents of `.claude/skills/session-digest/SKILL.md`
   - Instruction: "Discover and extract sessions since {date}. Return
     structured diff."

   Receive the structured diff (score changes, new evidence, new
   concepts, flags). The transcript bulk stays in the sub-agent's
   isolated context — the main window only sees the compressed output.

   If digest returns "no undigested sessions," proceed with
   current-session evidence only (step 4).

4. **Current-session evidence.** Read the current conversation context
   (always available in the main context window). Identify concepts
   encountered, strengths, growth edges, and procedural observations
   from THIS session. Merge with digest findings — current-session
   evidence takes priority for concepts seen in both.

5. **Scaffold check.** Read `learning/scaffolds/` for files dated
   within the review window. Compare scaffold concept classifications
   against digest findings and current-session evidence. Note
   discrepancies — these inform quiz-target selection and are
   high-value calibration data for Phase 4.

6. **Session log deduplication.** Check `learning/session-logs/` for
   frontmatter from already-reviewed sessions in the window. Their
   `concepts:` lists show what's already been quizzed — don't re-quiz
   those concepts.

7. **Analysis output.** Synthesize digest findings + current-session
   evidence + scaffold checks:
   - Concepts encountered (with specific evidence: digest output,
     current conversation, or commit references)
   - Strengths (what the user did well, with evidence)
   - Growth edges (name the gap type — conceptual/procedural/recall —
     not just the topic)
   - Procedural observations (workflow patterns, tool usage, debugging
     approach)

8. Select 4-6 quiz targets from merged evidence. Bias toward
   partial/stuck concepts. Include at least one application question.
   If learning/current-state.md has stale low-score concepts relevant
   to the session, resurface them. Digest entries flagged as "low
   confidence — suggest for quiz" are strong candidates.

9. Present the analysis before quizzing: strengths, growth edges, quiz
   targets with rationale.

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

**Prioritize concepts that compound.** If X is a prerequisite for Y, Z, and W, drill X. Leaf nodes are lookups, not quiz targets.

**Weight architecture over error detail.** A session with both systems design and debugging should weight the design questions higher — don't default to quizzing on the bugs.

**Quiz at the right altitude.** If a concept is a detail of something larger, quiz the parent. "How does `Set-Cookie` work?" might really be "how does session-based auth work?"

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
- `digest:observed` — proposed by session-digest from transcript
  evidence, written by session-review for concepts not covered by the
  quiz

**Merge logic:** If a concept appears in both digest findings AND quiz
results, the quiz score supersedes. Write digest-proposed scores only
for concepts the quiz didn't cover. This ensures quiz-verified evidence
always takes priority over transcript-inferred evidence.

Create new entries as needed. Check existing names first — don't create
near-duplicates. Quiz-verified scores supersede prior estimates
(`intake:self-report`, `intake:inferred`, `digest:observed`) for the
same concept.

### Digest timestamp

After all current-state.md writes complete, update
`learning/.last-digest-timestamp` to the latest digested session's end
date. This prevents future digest runs from re-processing sessions
already covered by this review.

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

**If no updates are needed:** Move on silently.

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

**Privacy boundary:** Never include conversation content, code, file
paths, background materials, or raw quiz answers in the signal.


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

## Interoperation

| Consumer | What it reads from session-review output |
|---|---|
| progress-review | Session log frontmatter, bodies, current-state.md |
| lesson-scaffold | Session log frontmatter (scores, gap types) |
| startwork | Session log frontmatter (continuation, concepts, arcs) |

Consistent YAML frontmatter and concept names across sessions is what
makes downstream windowing work.
