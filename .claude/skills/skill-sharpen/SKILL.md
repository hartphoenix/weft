---
name: skill-sharpen
description: >-
  Activates when composing, editing, or reviewing a SKILL.md file or any
  agent-facing instruction document (reference files, CLAUDE.md sections,
  sub-agent dispatch payloads). Guides the author toward token-efficient,
  behaviorally precise prose.
---

# Skill Sharpen

The reader is a language model. It knows how to interview, classify
errors, write summaries, structure output, and avoid leading questions.
Every line costs context window and competes with the session's work.

## The test

For each line: **would the agent behave differently without it?**

If no, cut it.

## What earns its tokens

- **File paths and invocation commands** — not derivable from training
- **Schemas and output templates** — exact formats other code depends on
- **Behavioral overrides** — things the agent would NOT do unprompted
  ("Do not read files. Work from memory." / "Commit immediately — do
  not wait for approval.")
- **Decision trees with specific thresholds** — score cutoffs,
  conditional branches, dispatch criteria
- **One concrete example** of good vs. bad output — one calibrates;
  two is redundant
- **Graceful degradation tables** — exact behavior per failure mode
- **Interoperation tables** — how this skill connects to others, compact

## What to cut

- **Negative restatements of positive instructions.** If the workflow
  says "answer first, be terse, stop," then "don't scaffold, don't
  elaborate, don't continue" pays double. Write the positive
  instruction clearly and trust it.
- **Concepts the model already has.** Don't define syntax errors,
  describe what a fresh Claude instance can access, or list interview
  questions a competent interviewer would ask. Direct the capability;
  don't explain it.
- **Commentary and philosophy that don't change behavior.** "This is
  the key design move" / "Debugging fails not from lack of intelligence
  but lack of visibility" — the behavioral instruction does the work.
  Cut the rationale.
- **Downstream documentation.** What other skills do with this skill's
  output doesn't change this skill's execution. Use an interoperation
  table if connections matter; don't narrate them.
- **Boilerplate repeated across skills.** Consent gates, path
  resolution, "don't teach during X" — reference from one shared
  location instead of copying into each skill.

## Density reference

persist (8 lines, 95% load-bearing) and handoff-prompt (29 lines, 75%)
set the standard. When reviewing a draft, estimate what percentage of
lines pass the behavioral-difference test. Below 65% means a trim pass
is needed.

## Diction carries persona

Tutor-facing skills don't just direct actions — their word choices
anchor the agent's posture (direct, Socratic, honest-signal). Trimming
for density must not flatten this. When editing a skill whose reader
operates in tutor mode: check that the surviving prose still sounds like
the tutor, not like a spec sheet. The lever is selective diction, not
added length.

## Editing existing material

Read the full skill first. Identify lines that fail the test. Propose
cuts as a batch. Preserve every file path, schema, threshold, and
behavioral override — these always earn their keep. Check that the
remaining prose preserves the skill's tonal register.
