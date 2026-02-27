---
name: lesson-scaffold
description: Restructures external learning materials into a conceptual scaffold tailored to the learner's current level. Reads learning state (current-state, goals, session logs) to classify concepts and shape the scaffold. Writes a persistent scaffold file to learning/scaffolds/. Use when the user provides learning materials and wants to understand the "why" before executing.
---

# Lesson Scaffold

Restructure what someone else organized by procedure into what the
learner needs organized by understanding. The learner's current state
drives the scaffold — it determines which concepts get emphasis,
where the bridges are, and what gaps need attention.

Name concepts plainly, bridge them to what the learner knows, and get
out of the way. The scaffold is a map, not a lecture.

## Inputs

1. **Source material** (required). URL, file path, or pasted text — any
   learning content.
2. **Context** (optional). Energy, time, emotional context, what they
   need. Shapes scope.

## Phase 1: Gather

Read local learning state. Fail fast and degrade gracefully — every
source is optional.

### Step 1: Learning state check

Check whether `learning/current-state.md` and `learning/goals.md` exist.

- **Both exist:** Full gather. Proceed normally.
- **Some exist:** Work with what's available. Silent.
- **None exist:** Tell the user: "No learning profile found — I'll
  scaffold from the material alone. Run `/intake` for a personalized
  scaffold." Proceed with concepts classified as new.

### Step 2: Recent session context

List files in `learning/session-logs/`. For the most recent 1-2 log
files, read the YAML frontmatter. Extract:

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

Also scan the body of the most recent log for "remaining work" or
"next steps" — material that connects to unfinished threads gets
extra relevance.

From the collected frontmatter, build a picture of:
- **Recent concepts and scores** — what was just reviewed and where
  gaps remain
- **Arcs touched recently** — which developmental lines are active
- **Unfinished threads** — remaining work that the material might
  connect to

If no session logs exist, skip silently.

### Step 3: Learning state files

If the learning state files exist, read them:

**`learning/current-state.md`** — concept inventory. Extract:
- Concept scores — focus on concepts relevant to the source material
- Gap types — conceptual vs. procedural vs. recall informs how to
  scaffold each concept
- Evidence sources — quiz-verified scores carry more weight than
  estimates (see `.claude/references/scoring-rubric.md`)

**`learning/goals.md`** — active goals. Extract:
- Goal aspirations and capabilities required
- Which goals the source material serves

Reference files consulted as needed:
- `.claude/references/scoring-rubric.md` for score interpretation
- `.claude/references/developmental-model.md` for ordering heuristic

---

## Phase 2: Analyze and Scaffold

### Step 1: Fetch the source material

Read or fetch the source material provided by the user.

### Step 2: Extract concepts

Extract every concept the material teaches or assumes — explicit and
implicit. Implicit concepts (things the lesson takes for granted) are
often where the real learning edges are.

### Step 3: Classify each concept using gathered state

For each extracted concept, assign a classification:

- **Solid** (score ≥ 4 in current-state) — use as anchor. Bridge new
  concepts to these. Brief mention only.
- **Growing** (score 2-3) — reinforcement opportunity. Note the gap
  type: conceptual gaps need framing, procedural gaps need reps,
  recall gaps need spaced exposure.
- **New** (not in current-state) — new territory. Connect to the
  nearest known concept as a bridge.
- **Prerequisite gap** (score ≤ 1, or missing but the material assumes
  it) — flag as risk. Suggest pre-work or flag for extra attention
  during execution.

If no learning state exists, classify all concepts as new.

### Step 4: Connect to goals

If `learning/goals.md` exists, note:
- Which goals does this material serve?
- Which arcs does it touch?
- One sentence connecting the material to the learner's trajectory.

### Step 5: Produce the scaffold

Six sections, each shaped by the concept classifications:

**What this material covers** — one paragraph connecting the material
to the learner's goals and current state. What it teaches, why it
matters now.

**Concepts to understand** — each concept with:
- Classification (solid / growing / new / prerequisite gap)
- A one-sentence bridge to something the learner already knows
- For growing concepts: note the gap type
- For prerequisite gaps: flag the risk

**Execution sequence** — the instructor's steps reordered by
conceptual dependency. Group steps that share a concept. Mark which
concepts each step exercises. Weight time toward growing and new
concepts — solid concepts need less attention.

**Resurfaced gaps** — low-scoring concepts from current-state.md that
this material happens to touch. Spaced repetition for free.

**Goal connection** — one line: what this material moves forward in
the learner's trajectory.

**Pre-work** (only if prerequisite gaps were found) — specific
concepts to review or brush up on before starting.

### Step 6: Write the scaffold file

Write the scaffold to `learning/scaffolds/YYYY-MM-DD-<topic-slug>.md`.

Derive the topic slug from the source material title, URL path, or
filename. If the `learning/scaffolds/` directory doesn't exist, create
it.

**File format:**

```markdown
---
date: YYYY-MM-DD
source: <URL, file path, or "pasted text">
arcs: [list of arcs this material touches]
concepts: [list of concepts extracted]
---

# Scaffold: <topic>

## What this material covers
<paragraph connecting to learner's goals>

## Concepts
<classified concept list with bridges, gaps, and status>

## Execution sequence
<reordered steps grouped by concept, weighted toward growth edges>

## Resurfaced gaps
<low-scoring concepts this material touches>

## Goal connection
<one line: what this moves forward>

## Pre-work
<only if prerequisite gaps found>
```

### Step 7: Link to session log

Check whether `learning/session-logs/YYYY-MM-DD.md` exists for today.

**If it exists:** add a `scaffold:` field to its YAML frontmatter
pointing to the scaffold file.

**If it doesn't exist:** create it with minimal frontmatter:

```yaml
---
date: YYYY-MM-DD
scaffold: scaffolds/YYYY-MM-DD-<topic-slug>.md
---
```

This creates a breadcrumb so session-review can connect the scaffold's
predictions to session evidence. Session-review will merge its own
frontmatter (project, concepts, arcs) into this file later — don't
duplicate those fields here.

### Step 8: Present and confirm

Present the scaffold to the user. Ask whether the scope and
classification feel right. If they adjust, update the file.

They drive.

---

## Graceful Degradation

| Missing | Effect |
|---------|--------|
| All learning state | Scaffold from material alone. All concepts classified as new. Suggest `/intake`. |
| `current-state.md` only | No concept scoring. Goals still provide trajectory connection. |
| `goals.md` only | No trajectory connection. Concepts still scored from current-state. |
| Session logs empty | No recent session context. Scaffold still works. |

Never error on missing data. Shape the scaffold to available data.
Only surface a message when the degradation meaningfully changes what
the skill can offer.

---

## Anti-Patterns

- **Don't execute the assignment.** Scaffold is for understanding, not
  walkthrough.
- **Don't teach the concepts yet.** Name and bridge them. Teaching
  happens during execution.
- **Don't skip implicit concepts.** Procedural lessons bury
  assumptions.
- **Don't ignore emotional context.** "I'm tired" is load-bearing
  information about session scope.
- **Don't update learning state.** Lesson-scaffold does not modify
  concept scores, gaps, or arc state. It writes to
  `learning/scaffolds/` and may add a `scaffold:` field to session log
  frontmatter (Step 7), but session-review owns all state updates.
