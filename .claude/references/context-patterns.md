# Context Management Patterns

Design patterns for skills that handle large inputs, multi-phase
workflows, or parallel synthesis. Extracted from the weft intake
skill (Feb 2024) where these patterns were discovered under real
context pressure — non-technical users who can't manage their own
context window.

This is system knowledge — reusable across skills.

---

## 1. Manifest-then-delegate

**Problem:** Raw materials (files, logs, transcripts) are too large
and noisy for the main agent's context. Reading them directly crowds
out the decision-making and conversation that the main agent needs
context budget for.

**Pattern:** Main agent lists what exists (names, sizes, types) but
does not read contents. A sub-agent receives the manifest + file
paths, reads and analyzes in isolation, returns a structured report.
Main agent works from the report.

**When to use:** Any skill that needs to process unstructured input —
background files, session logs, multi-file codebases, research materials.

**Key constraint:** "Do not draft the document yourself — keep the
main context clean." If a sub-agent fails, retry or dispatch fresh.
The main agent never falls back to reading raw materials.

---

## 2. Progressive state persistence

**Problem:** Long-running workflows (interviews, multi-step synthesis,
large refactors) can be interrupted by context limits, crashes, or
the user stepping away. Without state persistence, the entire
workflow restarts.

**Pattern:** A structured state file with YAML frontmatter tracking
phase and completion, plus appended work product that grows as the
workflow progresses.

```yaml
---
phase: interview
last_completed: background
domains_completed: [background, goals]
started: 2026-02-24
---

## Background
[captured findings from this phase]

## Goals
[captured findings from this phase]
```

**Resume logic:** Read frontmatter → determine next step → validate
prerequisites → offer resume or restart. The file is both state
machine and audit log.

**When to use:** Any skill that takes more than one conversational
turn to complete, or any workflow that might hit context limits
before finishing.

---

## 3. Parallel synthesis with consistency check

**Problem:** Generating multiple interdependent documents (goals,
arcs, current-state, CLAUDE.md) sequentially consumes too much
context. But generating them in parallel risks cross-document
inconsistency.

**Pattern:** Dispatch up to 4 sub-agents in parallel, each receiving
the same base data plus its domain-specific template. Collect all
outputs. Main agent validates for cross-document consistency before
presenting to user.

**Consistency check is structural, not cosmetic:** Do arcs reference
the same goals? Do current-state concepts align with arcs? Does the
calibration match the evidence? Fix discrepancies before showing
anything.

**Failure recovery:** Retry failed sub-agent once, then dispatch
fresh. Main agent never generates the content itself.

**When to use:** Any skill that produces multiple related outputs —
session briefings, weekly reviews, compound docs, multi-file
refactors.

---

## 4. Human-gated writes with conflict detection

**Problem:** Skills that write persistent context files (CLAUDE.md,
current-state, goals) can silently overwrite user work or accumulate
without oversight.

**Pattern:** Present all drafts together → user reviews → per-file
approval with conflict handling:
- If target exists: offer merge (show diff), backup-and-replace,
  or skip
- Frame technical operations in plain language ("I'm going to keep
  your learning data private" not "append to .gitignore")
- This is a security invariant, not a courtesy

**When to use:** Any skill that writes to files loaded into future
context (CLAUDE.md, current-state.md, goals.md, session-logs).

---

## 5. Signal-strength calibration

**Problem:** Sub-agent analysis produces findings of varying
confidence. Without explicit confidence signals, the main agent
can't calibrate its follow-up behavior.

**Pattern:** Sub-agents rate each finding domain on a 3-tier scale:
strong (confirmation only needed), moderate (targeted follow-up),
thin (full exploration). Main agent uses these ratings to modulate
depth — don't re-ask what's already well-established, do probe
what's uncertain.

**When to use:** Any skill where upstream analysis gates downstream
interaction depth — background analysis → interview, log scan →
weekly review, codebase audit → refactor planning.

---

## 6. Evidence-tagged scoring

**Problem:** Scores and assessments enter the system from different
sources with different reliability. A score from artifact analysis
carries more weight than self-report, which carries more weight
than inference. Without tagging, downstream consumers can't
distinguish them.

**Pattern:** Tag every score with its evidence source:
- `artifact` — derived from analyzing work product (higher
  confidence)
- `self-report` — the user said it (trust but verify)
- `inferred` — observed from behavior (what confused them, what
  they avoided)

Pair with conservative bias: a too-generous score hides gaps from
spaced repetition. Better to resurface a mastered concept once
than miss a real gap.

**When to use:** Any skill that writes to current-state.md or
produces assessments that downstream skills consume.

---

## 7. Dependency validation before phase entry

**Problem:** Multi-phase workflows can advance past prerequisites
if phase transitions aren't gated. This produces invalid downstream
outputs (e.g., synthesizing a profile before the user has validated
the portrait).

**Pattern:** Define hard prerequisites per phase. Check explicitly
before entry. Distinguish optional (user can skip) from hard-gated
(system enforces). Special-case prerequisites where user validation
is structurally necessary for downstream integrity.

**When to use:** Any multi-phase skill. The critical case is when
one phase's output becomes institutional memory (persisted state
that future skills consume) — that output must be user-validated
before persistence.

---

## 8. Dual-layer output

**Problem:** Technical formats (YAML frontmatter, concept tables,
arc structures) are designed for machine consumption but
overwhelming for users to validate. But showing only plain language
loses the precision that downstream skills need.

**Pattern:** Store in technical format, present in plain language.
Don't show both simultaneously. The user validates the plain
version; the system persists the technical version. "Don't use
terms like 'capability cluster' or 'complexity-chunking gap.'
The stored file keeps the structured format (other skills read it),
but what you show the learner should read like a conversation."

**When to use:** Any skill that writes structured state consumed by
other skills but reviewed by humans — current-state updates,
goal-refinement interviews, session briefings.

---

## Applying these patterns

### Startwork (planned)

Startwork's gather phase is a manifest-then-delegate candidate:
read file list (current-state, goals, recent session-logs, git
state), dispatch sub-agent to read and summarize the landscape,
return structured briefing to main agent for session composition.

### Session-review (existing)

Currently reads current-state directly — works because it's small
and structured. If current-state grows, consider sub-agent read.
Already uses evidence-tagged scoring and human-gated writes.

### Weekly review (planned)

Will read across a week's session-log frontmatter — a
manifest-then-delegate candidate. Signal-strength calibration
applies: some sessions are rich learning sessions, others are
routine. The review should weight accordingly.

### Compound engineer (planned)

Parallel synthesis pattern applies: read multiple session logs,
extract patterns in parallel sub-agents, consistency-check the
findings, present unified report.
