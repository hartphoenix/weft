# Scoring Rubric

Shared reference for all skills that assess or update learner state.
System knowledge — does not change per user.

---

## Concept scores (0-5)

| Score | Meaning |
|-------|---------|
| 0 | Not encountered |
| 1 | Heard of |
| 2 | Attempted with help |
| 3 | Can do with effort |
| 4 | Fluent |
| 5 | Can teach |

**Bias conservative.** A too-generous 4 hides a concept from spaced
repetition. Better to surface a mastered concept once than miss a gap.

---

## Gap types

When score < 4, classify the gap:

| Gap | Meaning | Diagnostic |
|-----|---------|------------|
| conceptual | Mental model is wrong | Wrong shape — needs the right abstraction |
| procedural | Right concept, wrong execution | Right shape, needs reps |
| recall | Can't reproduce a known procedure | Knew it once, needs refresh |

Use `--` if score >= 4 or no gap evidence.

---

## Evidence source tags

Scores are tagged with `namespace:method` to preserve the evidence chain.
Downstream consumers (spaced repetition, weekly review) use tags to
weight evidence appropriately.

### Intake sources

| Tag | Meaning | Confidence |
|-----|---------|------------|
| `intake:artifact` | Derived from analyzing background materials (code, writing, projects) | Higher — behavioral evidence |
| `intake:self-report` | The learner said it about themselves | Trust but verify |
| `intake:inferred` | Observed from how they engaged in the interview | Behavioral signal |

### Session-review sources

| Tag | Meaning | Confidence |
|-----|---------|------------|
| `session-review:quiz` | Scored from a quiz answer during session review | High — direct assessment |
| `session-review:observed` | Evident from session work but not quizzed | Moderate — behavioral evidence |

### Progress-review sources

| Tag | Meaning | Confidence |
|-----|---------|------------|
| `progress-review:pattern` | Inferred from cross-session pattern analysis (stalls, regressions, velocity, drift) | Lower — pattern inference, not direct observation |

### General rules

- Every score update includes a source tag.
- A concept may accumulate multiple source tags over time (history).
- Quiz-verified scores (`session-review:quiz`) supersede estimates
  (`intake:self-report`, `intake:inferred`) for the same concept.
- Artifact-based scores (`intake:artifact`, `session-review:observed`)
  carry more weight than self-reports but less than direct quiz results.
- Pattern-inferred scores (`progress-review:pattern`) carry the least
  weight. They should not override recent session-review scores unless
  supported by ≥ 3 data points across sessions.
