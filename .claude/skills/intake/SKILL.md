---
name: intake
description: Onboarding interview for the personal development harness. Scans background/ for pre-loaded materials (code, resumes, writing, transcripts), runs a conversational interview to discover background, goals, current skills, and learning preferences, then generates a personalized CLAUDE.md and initial current-state.md. Use when setting up a new learner, onboarding, or bootstrapping the harness.
---

# Intake

Onboard a new learner. Five phases, in order. Do not skip or reorder.

---

## Path Resolution

This skill reads and writes files in the weft harness directory, which
may not be the current working directory.

**To find the harness root:** Read `~/.config/weft/root`. If the file
exists, use its contents as the absolute path. If it doesn't exist, fall
back to the current working directory (local-install compatibility).

**All file paths in this skill resolve from the harness root:**
- `learning/*` → `<harness-root>/learning/*`
- `background/*` → `<harness-root>/background/*`
- `.claude/skills/*` → `<harness-root>/.claude/skills/*`
- `.claude/references/*` → `<harness-root>/.claude/references/*`
- `.claude/consent.json` → `<harness-root>/.claude/consent.json`

**Phase 4 (Write) targets `~/.claude/CLAUDE.md`** — the global file, not
a project-local CLAUDE.md. Intake replaces the content between the
`<!-- weft:start -->` and `<!-- weft:end -->` markers with a
personalized version. See Phase 4 for details.

**Skip .gitignore steps.** The global install doesn't need gitignore
entries — learning state lives in the harness directory, not in user
projects.

---

## Phase 0: Resume Check

Before starting intake, check if `learning/.intake-notes.md` exists.

**If found:** Read the file. The YAML frontmatter fields `phase` and
`last_completed` tell you where intake was interrupted. Present a
summary of what's already captured and offer:
1. Resume from the interruption point
2. Start fresh (delete the notes file and any partial drafts first)

If resuming into Phase 2, re-read the notes to restore context. If
the notes contain a `## Background Analysis` section, use its signal-strength
ratings to calibrate remaining interview domains the same way a fresh
run would (strong = confirmation only, thin = full question set). Also
read `.claude/references/developmental-model.md` if you haven't yet.
Pick up at the next step not listed in `domains_completed` — this
includes the five interview domains plus `reflection` and `projects`.

If resuming into Phase 3, proceed directly to synthesis sub-agent
dispatch.

**If not found:** Proceed to Phase 1.

---

## Phase 1: Discover

Scan for materials before asking questions. Richer input produces a
sharper starting model.

Before starting, read `.claude/references/developmental-model.md`. This
reference tells you how to analyze a learner's development — the
complexity/chunking dimensions, dependency types, ordering heuristic,
and compounding engine. Use it to calibrate interview questions and
identify bridge opportunities from the learner's background.

### 1a. Scan background materials

Look for a `background/` directory in the project root. List its contents
(file names, sizes, types) but **do not read file contents yourself**.
Produce a file manifest — this is what you'll pass to the analysis
sub-agent.

### 1b. Dispatch background analysis

**If background has files**, tell the user you're analyzing their
materials and it will take a moment. Then dispatch a background analysis
sub-agent using the Task tool. Read
`.claude/skills/intake/subagents.md § Background Analyzer` for the full
dispatch prompt, extraction table, and output schema. Pass the sub-agent
the background path and your file manifest. It reads the files, reads the
developmental model independently, and returns a structured Background
Analysis Report with signal-strength ratings per interview domain.

If the sub-agent fails or returns unusable output, retry once. If it
fails again, tell the user the automated analysis didn't work and
proceed to the interview without background findings — background is an
accelerant, not a gate.

**If the background folder is empty or absent**, skip the sub-agent.
Explain the convention: `background/` is where they can drop materials
(code, resumes, writing, conversation logs, course materials) for a
sharper starting profile. None of it is required — the interview can
build the profile from scratch.

### 1c. Present findings and offer paths

**If a background report was returned**, present what it found — be specific
about signals, not just file names. Use the signal-strength ratings to
tell the user what's well-covered vs. thin, and suggest materials that
could fill gaps. Frame it as opportunity, not requirement.

**Either way**, offer three paths:
1. Add materials to background (wait for them, then re-dispatch)
2. Point to another directory to read from
3. Skip straight to the interview

### 1d. Initialize intake notes

Create `learning/.intake-notes.md` with YAML frontmatter:

```yaml
---
phase: discover
last_completed: discover
domains_completed: []
started: YYYY-MM-DD
---
```

If a background report was generated, append it as the `## Background Analysis`
section. This file is your running record for the rest of intake.

### 1e. Proceed

Whatever the user chose, move to Phase 2. Background is an accelerant,
not a gate.

---

## Phase 2: Interview

Adaptive conversational interview. The background findings (if any)
inform which questions to ask and which to skip. Target: 10-15 minutes.
If the background was rich, this may be shorter.

### Interview protocol

- Conversational, not interrogative. One domain at a time.
- Acknowledge what you learned from background before asking related
  questions. ("Your writing shows clear structural thinking — tell me
  more about how you approach organizing ideas.")
- When the user gives a short answer, one follow-up is okay. Two
  follow-ups on the same topic is too many — move on.
- If the interview is running long (more than 15 minutes), offer to
  wrap up: "I have enough to build a solid starting profile. We can
  always refine it later. Want to continue or should I synthesize
  what I have?"

### Question domains

Work through these domains in order. The background report's signal-strength
ratings guide your depth: **strong** domains need only a confirmation
question or two, **moderate** domains get targeted follow-ups, **thin**
or missing domains get the full question set. Within each domain, follow
interesting threads briefly but don't interrogate — one follow-up per
short answer, max.

**1. Background and context**

What to discover: experience level, how they got here, prior domains.
The learner may be studying software, data science, writing, design,
research, or any other field — discover the domain, don't assume it.

- What are you learning? What's the domain or field?
- How long have you been at it? (timeline, formal vs self-taught,
  what context — course, degree, bootcamp, hobby, career switch)
- What were you doing before? (prior domains often shape learning
  style and strengths — note these as potential bridge material)
- What have you built or produced? What felt good about it?
- How does [prior domain] show up in how you approach [current domain]?
  (→ feeds "How {name} learns" transfer mappings, "Strengths")

**2. Goals and aspirations**

What to discover: who they want to become, not just what they want to
learn. States of being, not skill checklists.

- What kind of [practitioner] do you want to become? (use their
  domain — developer, designer, researcher, writer, etc.)
- What excites you about this field? What would you create if you
  could create anything?
- Is there a timeframe or milestone driving you? (course end date,
  job search, project deadline, personal target)

**3. Current state**

What to discover: concrete skill levels for initial calibration.

- What skills and tools do you work with? For each: comfortable,
  learning, or tried-once?
- What's the hardest problem you've solved recently in this domain?
  Walk me through how you approached it.
- What concepts feel solid? What feels shaky or confusing?
- What do you do well that you might take for granted?
  (→ feeds "Strengths")

**4. Learning style**

What to discover: how they learn best, how they get unstuck, what
helps vs. what annoys.

- When you're stuck, what do you do first?
- Do you learn better by reading, building, watching, or discussing?
- Do you prefer someone to explain the answer or guide you to find it?
- How do you feel about making mistakes while learning?
- Think of a time someone helped you get unstuck really effectively —
  what did they actually do?
  (→ feeds "How {name} gets unblocked")
- When you make mistakes, is there a pattern to where they tend to
  happen?
  (→ feeds "How {name} learns" error patterns)

**5. Work and communication preferences**

What to discover: how they want the system to interact with them.

- What does good work look like to you? (quality standards, style)
- Do you prefer structure or flexibility in your workflow?
- How direct do you want feedback? Gentle nudges or straight talk?
- When someone is helping you, what's most useful? What's annoying?

### Record domain notes

After completing each interview domain, append structured notes to
`learning/.intake-notes.md`. Format:

```markdown
## [Domain Name]

[Key findings — specific quotes, concrete details, not summaries]
**Signal strength:** strong | moderate | thin
**Key signals:**
- [most important things learned, bulleted]
```

Then update the YAML frontmatter: add the domain name to
`domains_completed`, set `phase: interview`, set `last_completed` to
the domain name.

Write as if you will not remember anything that isn't in this file.
This is your compression-resistant record — if context is lost, these
notes are what survives.

### Reflect and check

After the five interview domains, pause and reflect back what you've
heard. Present a brief portrait: here's where I think you are in your
learning. Include:

- What they seem confident about and where they light up
- Where they feel stuck or uncertain
- Predictions about their workflow — how you'd expect them to approach
  a new problem, what patterns might show up
- Bridge material from prior domains that could accelerate learning

This is a mirror, not a grade. The learner should recognize themselves
or correct the picture. Ask: "Does this sound right? Anything I'm
missing or getting wrong?"

After the user confirms or corrects, append a `## Reflection` section
to the intake notes with your summary and any corrections they offered.
Update the frontmatter: add `reflection` to `domains_completed`, set
`last_completed: reflection`.

### Projects

Projects are how skills develop — the instrument for closing the gap
between current state and goals. After the reflection, explore what
the learner is currently working on.

If projects came up in background or earlier in the interview, build
on what you know. Otherwise ask directly.

- What are you working on right now? (current projects, assignments,
  personal builds, work deliverables)
- For each project: where are you in it? What's going well? What's
  blocked or unclear?
- What do you not yet know how to do to finish this?
- What do you want out of this project as a learner? (what skills or
  understanding should it build?)
- What do you want it to do in the world? (functional purpose, who
  it's for, why it matters)

The *why* is as important as the *what*. A project that serves a goal
the learner cares about generates intrinsic motivation; one that
doesn't becomes a chore.

**If the learner has no current projects**, note this as something to
address after intake. Don't dive into project brainstorming during
the interview — but mention that the system can help with that as a
next step and ask if they'd like to schedule it.

After the projects discussion, append a `## Projects` section to the
intake notes following the same format (findings, signal strength, key
signals). Update the YAML frontmatter: add `projects` to
`domains_completed`, set `last_completed: projects`.

---

## Phase 3: Synthesize

Read `learning/.intake-notes.md` and verify completeness — all interview
domains, reflection, and projects should be present. If any are missing,
ask the user for that information directly before proceeding to
synthesis. A missing reflection is especially important — the learner
needs to have validated the portrait before it becomes the basis for
their profile.

Tell the user you're generating their personalized learning profile and
it will take a minute (four documents are being drafted in parallel).

Dispatch up to 4 synthesis sub-agents in parallel using the Task tool.
Read `.claude/skills/intake/subagents.md § Synthesis Agents` for the
dispatch prompt pattern. Each sub-agent receives the full contents of
`.intake-notes.md` plus its specific template and guidelines (from
sections 3a-3d below — include the relevant section text in the
dispatch prompt).

If a synthesis sub-agent fails or returns unusable output, retry once.
If it fails again, dispatch a fresh sub-agent for that document. Do not
draft the document yourself — keep the main agent's context clean.

The arcs and current-state sub-agents also read
`.claude/references/developmental-model.md` independently.

Collect all drafts. Review for cross-document consistency: do arcs
reference the same goals? Do current-state concepts align with arcs?
Does the CLAUDE.md calibration match current-state evidence? Fix
discrepancies before presenting to the user.

Update the intake notes: set `phase: synthesize`,
`last_completed: synthesize`.

Present all drafts to the user for review before writing anything.

### 3a. Draft CLAUDE.md

The synthesis sub-agent reads `.claude/references/claude-md-template.md`
directly. It follows the synthesis annotations (HTML comments) in the
template to populate each section from the intake notes.

The sub-agent emits User through Teaching Mode. It stops there — the
main agent appends the four system invariant sections (Security,
Recovery, Complex operations, Unexpected behavior) verbatim from the
template after collecting the synthesis output.

**Phase 3 consistency check:** verify the CLAUDE.md draft contains no
HTML comments (catches annotation leak from the template).

The three predictive sections — "How {name} learns", "How {name}
gets unblocked", and "Strengths" — are the highest-value content.
They turn the CLAUDE.md from a preference sheet into a model that
changes how the agent intervenes.

**Minimum bar:** at least 1 entry each in "How learns" and "How gets
unblocked." Strengths can be sparse if background evidence is thin.
Sparse is fine; empty is not.

**Quality bar:** each entry should be predictive (changes agent
behavior), not merely descriptive (restates a preference). The
template annotations include examples of the difference — the
sub-agent reads them directly.

### 3b. Draft learning/goals.md

Goals are the highest level of abstraction — states of being, not skill
checklists. Derived from the interview's goals & aspirations domain.

```markdown
# Goals

States of being the learner is working toward. Each goal describes who
they want to become, not what they want to learn. Capabilities and
skills emerge from pursuing goals through projects.

## [Goal name]

[1-2 sentences: the aspiration as a state of being.]

**Capabilities required:**
- *(populated as arcs develop)*
```

Guidelines:
- **States of being, not skills.** "A developer who ships products
  people use" or "A researcher who designs rigorous studies" — not
  "Learn React" or "Pass statistics."
- **The learner's words matter.** Use their language, not curriculum
  language. Refine over time.
- **2-4 goals is typical.** More than that suggests the goals need
  consolidation.
- **Timeframes if mentioned.** Note driving deadlines or milestones.

### 3c. Draft learning/arcs.md

Arcs are developmental lines that serve goals — the decomposed
capability clusters and skill sequences needed to get there. Lower
abstraction than goals, higher than individual concepts.

Use the developmental model (`.claude/references/developmental-model.md`)
to structure arcs. Each arc tracks a capability cluster with its
complexity/chunking state and dependencies.

```markdown
# Arcs

Developmental lines serving goals. Each arc tracks a capability cluster
— a group of related skills that develop together and compound.

## [Arc name]

**Serves:** [which goal]
**Current state:** [brief assessment — note evidence basis: artifact, self-report, or inferred]
**Key skills:** [the specific skills this arc develops]
**Dependencies:** [hard prerequisites, bridge opportunities, altitude gates]
**Next move:** [reps or abstraction, based on complexity-chunking gap]
```

Guidelines:
- **Derive from goals + current state.** What capability clusters need
  to develop to close the gap between where the learner is and where
  they're headed?
- **Note bridge opportunities.** Any background experience that could
  accelerate this arc (from the developmental model).
- **Be concrete about next move.** The complexity-chunking diagnostic
  from the developmental model tells you: reps or abstraction?
- **Start sparse.** Intake seeds arcs from interview evidence. They
  fill in as the learner works on projects and completes sessions.

### 3d. Draft learning/current-state.md

Seed initial concept entries from the interview. Use the scoring rubric
in `.claude/references/scoring-rubric.md` for scores, gap types, and
evidence source tags.

Template:

```yaml
# Current State
#
# Scores: 0-5 (see .claude/references/scoring-rubric.md)
#   0 = not encountered, 1 = heard of, 2 = attempted with help,
#   3 = can do with effort, 4 = fluent, 5 = can teach
#
# Gap types (when score < 4): conceptual | procedural | recall
# Source tags: intake:artifact | intake:self-report | intake:inferred

concepts:
  - name: concept-name
    score: 3
    gap: procedural
    source: intake:artifact
    last-updated: YYYY-MM-DD
```

Populate entries from concrete evidence in the interview. Guidelines:

- **Bias conservative.** See rubric — a too-generous 4 hides a concept
  from spaced repetition.
- **Use specific concepts**, not entire domains. "Array methods" not
  "JavaScript." "Experimental design" not "statistics." Match the
  granularity to the learner's domain.
- **Tag the evidence source.** Use the intake source tags from the
  scoring rubric (`intake:artifact`, `intake:self-report`,
  `intake:inferred`). Session-review will calibrate with quiz-verified
  scores later.
- **Only include concepts that came up.** Don't speculatively populate
  a curriculum. Session-review adds concepts from real sessions.
- **Gap type from evidence.** If they described a wrong mental model,
  that's conceptual. If they know the concept but struggle to execute,
  that's procedural. If they've done it before but can't recall how,
  that's recall. Use `--` if score >= 4 or no gap evidence.

### 3e. Present and confirm

Present the learner-facing drafts for review. The CLAUDE.md is a
behind-the-scenes configuration file — don't lead with it.

> **Here are your goals.** These are the aspirational states I heard
> from our conversation. Anything to add or rephrase?

> **Here's how I see your growth path** — the groups of related skills
> I'd focus on to get you from where you are to where you're headed.

For each arc, present it in plain language: what the skill group is,
where they seem to be with it, what they'd need before going further,
and what the natural next step looks like. Don't use terms like
"capability cluster," "altitude gate," "complexity-chunking gap," or
other developmental model jargon. The stored arcs.md file keeps the
structured format (other skills read it), but what you show the learner
should read like a conversation, not a technical spec.

> **And here's your initial learning state.** These scores are estimates
> from our conversation. Adjust anything that feels off.

After the learner reviews goals, arcs, and current state:

> I also generated a configuration file called CLAUDE.md — it tells the
> system how to work with you (communication style, calibration level,
> preferences). You can view and edit it anytime. Want to see it now, or
> should we move on?

If they want to see it, show the draft. If not, proceed. Either way,
the CLAUDE.md is written in Phase 4 with the same human-gated approval
as every other file.

Wait for explicit approval of all drafts before proceeding to Phase 4.
Accept edits — incorporate them into the drafts and re-present if needed.

---

## Phase 4: Write

All file writes are human-gated. Present what you will write and where
before writing.

### 4a. Check for conflicts

Before writing, check whether target files already exist:

**CLAUDE.md** — intake writes to `~/.claude/CLAUDE.md` (the global
file), replacing the content between `<!-- weft:start -->` and
`<!-- weft:end -->` markers. The markers were placed by bootstrap.sh.
- If the markers exist: replace everything between them (inclusive) with
  the personalized section (see 4b.1 for the template).
- If no markers found but the file exists: append the personalized
  section with markers.
- If no file exists: create it with the personalized section.

**If `learning/` directory has existing files** (current-state.md,
goals.md, arcs.md):
- Warn the user. For each file, offer to merge or skip.

### 4b. Write approved files

1. Write the personalized weft section to `~/.claude/CLAUDE.md`
   between the markers. The personalized section has three blocks:

   **Block 1 — Synthesis output** (from § 3a sub-agent):
   User, Calibration, How {name} learns, How {name} gets unblocked,
   Strengths, Preferences, Conventions, Communication, Teaching Mode.

   **Block 2 — System invariants** (appended by main agent, verbatim
   from `.claude/references/claude-md-template.md`):
   Security — Context Files, Recovery after interruption, Complex
   operations are decision points, Unexpected behavior — pause and
   report. All at ## level.

   **Block 3 — Weft Harness** (path resolution, retained verbatim
   from bootstrap):

   The full section template between markers:

   ```markdown
   <!-- weft:start -->
   <!-- weft:section-version:2 -->
   [Block 1: Synthesis output — User through Teaching Mode]

   [Block 2: System invariants — 4 sections at ## level, verbatim]

   ## Weft Harness

   **Harness root:** <harness-root>

   ### Path resolution

   When skills reference harness files, resolve paths from the harness
   root above — not from the current working directory:

   - `learning/*` → `<harness-root>/learning/*`
   - `background/*` → `<harness-root>/background/*`
   - `.claude/references/*` → `<harness-root>/.claude/references/*`
   - `.claude/consent.json` → `<harness-root>/.claude/consent.json`

   When a skill says "read learning/current-state.md", read
   `<harness-root>/learning/current-state.md`.

   ### Architecture

   Skills: `<harness-root>/.claude/skills/` (registered globally)
   References: `<harness-root>/.claude/references/`
   Learning state: `<harness-root>/learning/`
   Background materials: `<harness-root>/background/`
   <!-- weft:end -->
   ```

   Note: section-version bumps to 2 (personalized replaces generic).

2. Create `learning/` and `learning/session-logs/` directories if they
   don't exist (resolve from harness root).
3. Write `learning/goals.md`.
4. Write `learning/arcs.md`.
5. Write `learning/current-state.md`.

### 4c. Wrap up

After writing, summarize:

- List every file written or modified, with paths.
- Remind the user: "All generated files are editable. The intake gives
  you a starting point — refine anything that doesn't fit as you work."
- Suggest next steps based on what's available (e.g., "Start working —
  the system adapts to you as you go. After a session, try
  `/session-review` to begin building your learning profile.")

### 4d. Data sharing (optional)

> One more thing — this harness can share your learning data to
> GitHub. Two things happen if you opt in:
>
> 1. At the end of each session review, a short signal gets posted to
>    the developer's repo — your feedback on how the tool worked, plus
>    the agent's own observations. You see every signal before it
>    sends, and you approve or skip each one.
>
> 2. A public repo is created on your GitHub account where progress
>    summaries get posted when you run `/progress-review`. Teachers,
>    mentors, or peers can watch that repo and comment with guidance.
>
> **What's shared:** concept scores, gap types, progress patterns,
> goals, and growth edges — the learning data the harness tracks.
> **What's never shared:** conversation content, code, file paths,
> background materials, or raw quiz answers.
>
> You can turn this off anytime by deleting `.claude/consent.json`.
> Want to opt in?

If they decline, skip. Don't push.

If they agree:

1. **Write `.claude/consent.json`** (creates the consent gate):
   ```json
   {
     "repo": "hartphoenix/weft-signals"
   }
   ```

2. **Create the learner's signal repo.** Run:
   ```
   gh repo create learning-signals --public --description "My learning progress — shared with teachers and mentors"
   ```
   If it already exists, skip creation.

3. **Set up labels.** Run:
   ```
   gh label create progress-review --repo USERNAME/learning-signals --description "Cross-session progress summary" --color 0E8A16
   gh label create goal-update --repo USERNAME/learning-signals --description "Goal or arc change" --color 1D76DB
   gh label create needs-teacher --repo USERNAME/learning-signals --description "Student requesting teacher input" --color D93F0B
   gh label create responded --repo USERNAME/learning-signals --description "Teacher has responded" --color BFD4F2
   gh label create acknowledged --repo USERNAME/learning-signals --description "Student has seen teacher response" --color C2E0C6
   ```

4. **Write `learning/relationships.md`:**
   ```yaml
   # Where I publish (my own repo)
   signal_repo: USERNAME/learning-signals

   # Who I learn from (they watch my repo)
   teachers: []

   # Who I teach (I watch their repos)
   students: []
   ```

5. **Confirm and explain the share link:**
   > You're set up. Your progress repo is at:
   >
   > **https://github.com/USERNAME/learning-signals**
   >
   > If you have a teacher or mentor who'd like to follow your
   > progress, send them that link — they just Watch the repo on
   > GitHub. You can add their GitHub handle to
   > `learning/relationships.md` anytime, and `/progress-review`
   > will assign issues to them automatically.

### 4e. Clean up

After all approved files are written, delete `learning/.intake-notes.md`
— it has served its purpose. The learning files are the permanent record.

---

## Anti-patterns

- **Don't teach during intake.** Discover who the learner is. Teaching
  happens in sessions, not onboarding.
- **Don't over-interview.** If background answered a question completely, skip it.
  If the user gives short answers, respect the signal — they may not
  know yet, or may not care to articulate right now.
- **Don't write files without approval.** Every generated file gets
  presented and approved before writing. This is a security invariant,
  not a courtesy.
- **Don't overwrite silently.** If CLAUDE.md or current-state.md already
  exists, the user decides what happens. Never auto-replace.
- **Don't inflate initial scores.** Intake scores are estimates from
  conversation, not quiz results. Bias conservative. Session-review
  calibrates with real evidence.
- **Don't bloat the CLAUDE.md.** Only include what the agent needs to
  behave appropriately. The reasoning token tax is real — a 200-line
  CLAUDE.md competes with every conversation turn.
- **Don't read background files in the main agent.** The sub-agent handles
  file analysis. The main agent works from the structured report. This
  is how context stays clean for the interview and synthesis phases.
