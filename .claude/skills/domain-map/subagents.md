# Domain Map Sub-agents

Reference for domain-map skill sub-agent dispatch. Read on demand during
Phases 1, 1.5, and 2.

---

## Chapter Analyst

Dispatch as an Agent sub-agent (`subagent_type: "general-purpose"`).

The Chapter Analyst is the primary analytical unit. Its job is to read
a chapter as a pedagogical unit — understanding what the author is
teaching, how concepts build on each other, and what dependencies are
communicated through structure rather than explicit statement.

### Framing

Educational materials communicate concept dependencies primarily
through structure — ordering, example construction, progressive
elaboration, refactoring chains — not through explicit prerequisite
statements. The most important relationships in the graph are often
the ones the author communicates by showing, not telling. Your job is
to detect both explicit and implicit dependency signals.

### What to include in the dispatch prompt

```
You are analyzing a chapter of educational material to build a
structured concept dependency graph. This is analytical work, not
mechanical extraction. You are reading the chapter as a teacher would
— understanding the pedagogical structure, not just labeling concepts.

**Before reading source material**, read these two reference files:
- `.claude/references/developmental-model.md` — the complexity/chunking
  model that governs how concepts relate
- `.claude/references/domain-graph-schema.md` — the field definitions
  and knowing profile rules

**Assigned chapter:** [insert path or URL]
**Chapter sequence position:** [N of M — where this falls in the source]
**Prior chapter titles (for context):** [list preceding chapter titles]

Work in two passes:

---

### Pass 1: Pedagogical Analysis

Read the chapter and produce a narrative analysis. Answer these
questions in order:

1. **Teaching sequence.** What concepts does this chapter introduce,
   and in what order? List them in presentation order.

2. **Code example dependency analysis.** For each significant code
   example:
   - What concept is this example primarily teaching?
   - What other concepts does this example USE without re-explaining?
   - Are any of those used concepts from a prior chapter?
   - Is this example a modification of an earlier example in the same
     chapter? If so, what changed and what does the change teach?

3. **Refactoring chains.** Does the chapter show the same code
   evolving through multiple versions? Trace the chain: what does
   each version add or change? Each step in a refactoring chain
   implies that the new concept depends on the concepts in the
   previous version.

4. **Motivating problems.** Where does the chapter introduce a new
   concept by first describing a problem with the current approach?
   The problem statement references the prior concept; the solution
   is the new concept. This encodes a dependency.

5. **Explicit callbacks.** Where does the text say "as we saw,"
   "recall that," "shown earlier," or reference prior material?
   These are the author's own dependency declarations.

6. **Assumed knowledge.** What does this chapter assume the reader
   already knows? Look for concepts used without introduction —
   especially in opening paragraphs and early code examples.

7. **Warnings and anti-patterns.** Where does the text show a wrong
   approach to establish why the right approach is needed? "Don't do
   X when using Y" implies understanding X is required for Y.

---

### Pass 2: Structured Extraction

Now express your analysis using the extraction schema below.

[Insert the extraction schema from this file, § Extraction Schema]
[Insert the implicit signal schema from this file, § Implicit Signals]

**Rules:**
- Only extract concepts that appear in the source material. Do not
  invent concepts from general domain knowledge.
- Classify each concept's origin as "taught", "used", or "assumed"
  (see definitions in extraction schema).
- For knowing profile inference, use the signal mapping table below.
- Estimate complexity range using the 0-5 scoring scale.
- When uncertain about a field, note the uncertainty rather than
  guessing.
- The implicit signals section is as important as the concept list.
  These signals produce the edges that the schema alone would miss.

**Do NOT write any files. Return text only.**
```

### Extraction schema

Include this in the dispatch prompt:

For each concept identified:

| Field | What to extract |
|-------|----------------|
| id | Slug form: lowercase, hyphenated. e.g., "array-map" |
| name | Human-readable name |
| description | 1-2 sentence description from the source |
| origin | "taught" (explicitly covered), "used" (actively used in examples but taught elsewhere), or "assumed" (referenced as context but not taught in this source at all) |
| arc | Which topic area / module / arc this belongs to |
| prerequisites | List of concept IDs this depends on, with estimated minLevel |
| composedOf | Sub-concepts this decomposes into (if composite) |
| complexityRange | {min, max} on 0-5 scale |
| knowingProfile | 4P categorical weights (see signal mapping below) |
| isThreshold | true if crossing this concept reorganizes understanding downstream |
| coverageDepth | "detailed" if thoroughly covered, "sketched" if briefly mentioned, "stub" if only named |
| tags | Free-form tags |

**Origin field — three values, not two:**
- `taught`: This chapter explicitly teaches this concept. There is a
  definition, explanation, or dedicated code example introducing it.
- `used`: This chapter's code examples actively use this concept, but
  it was taught in an earlier chapter (or is general knowledge the
  chapter builds on). The concept appears in code blocks without being
  re-explained. This is the critical category for cross-chapter edge
  detection.
- `assumed`: Referenced as background context but never taught in this
  source material at all. Horizon candidate.

### Knowing profile signal mapping

Use these signals to infer knowing profile categories:

| Signal in source material | Knowing type | Likely category |
|--------------------------|-------------|----------------|
| Definitions, facts, rules, "know that..." | Propositional | primary or necessary |
| Step-by-step procedures, "implement...", code exercises, "build..." | Procedural | primary or necessary |
| "Think about it from the perspective of...", design thinking, user empathy | Perspectival | primary or necessary |
| Collaboration practices, team dynamics, "participate in...", pair programming | Participatory | primary or necessary |
| Mentioned but not practiced | Any | minor |
| Not mentioned | Any | negligible |

When a concept is primarily about doing (code, procedures), procedural
is likely primary. When it's primarily about understanding (theory,
architecture), propositional may be primary. Most programming concepts
have procedural as primary and propositional as necessary.

### Prerequisite edge extraction

For each prerequisite relationship:

| Field | What to extract |
|-------|----------------|
| from | Dependent concept ID |
| to | Prerequisite concept ID |
| minLevel | Estimated minimum score needed (1-5) |
| knowingType | Which 4P type is required (optional) |
| logic | "and" or "or" — does this combine with other prerequisites as AND or OR? |
| group | Group name if part of an OR-set (optional) |
| confidence | "inferred" (from explicit statement in source) or "hypothesized" (from structural analysis) |
| note | Context for why this edge exists |

### Implicit signals

**This section is required.** For each implicit dependency detected
during Pass 1, produce a structured entry:

| Field | What to extract |
|-------|----------------|
| from | Dependent concept ID |
| to | Prerequisite concept ID |
| signal | Signal type (see taxonomy below) |
| evidence | Specific example, quote, or description of the passage |
| confidence | "hypothesized" for most implicit signals |
| note | Why you believe this relationship exists |

#### Implicit signal taxonomy

| Signal type | What it means | How to detect |
|-------------|--------------|---------------|
| `co-occurrence` | Two concepts appear in the same code example; removing either breaks it | A code block requires concept X to function but is teaching concept Y |
| `sequencing` | Concept B appears after concept A; B's examples use A | The teaching order within the chapter implies dependency |
| `refactoring-chain` | The same code is shown in multiple versions; each adds a concept | Same component name, same behavior, different syntax across code blocks |
| `motivating-problem` | Concept B is introduced by describing a limitation of concept A | "We had to..." / "this is awkward because..." followed by a new approach |
| `definitional-embedding` | Concept B is defined in terms of concept A | "X is like Y but..." / "X replaces Y when..." |
| `explicit-callback` | The text references a prior concept by name | "as we saw," "recall that," "shown earlier" |
| `anti-pattern` | A warning about concept B implies understanding concept A | "Don't do X when using Y" / showing wrong-then-right code |
| `scaffolded-example` | Example adds one new concept to an otherwise-familiar pattern | Everything except the teaching target was introduced earlier |

### Output schema

```markdown
## Chapter Analysis Report: [Chapter Title]

### Source
- Path: [file path or URL]
- Sequence position: [N of M]
- Estimated words: [count]

### Pedagogical Analysis

[Narrative analysis from Pass 1. This is the analytical foundation —
include the teaching sequence, code example analysis, refactoring
chains, motivating problems, explicit callbacks, assumed knowledge,
and anti-patterns. Be specific — cite code blocks and passages.]

### Concepts Extracted

[For each concept, use the extraction schema fields above.
Format as a structured list. Include origin field (taught/used/assumed).]

### Explicit Prerequisite Edges

[Edges inferred from explicit statements in the text.]

### Implicit Dependency Signals

[Edges detected through structural analysis — co-occurrence,
sequencing, refactoring chains, etc. Use the implicit signal schema.
This section is as important as the explicit edges.]

### Assumed and Used Concepts

[Concepts with origin "assumed" — horizon candidates.
Concepts with origin "used" — taught elsewhere, used here.
For "used" concepts, note WHERE in this chapter they appear
(which code examples, which explanations) so the cross-chapter
analyst can trace the dependency.]

### Arc Assignment

[Proposed arc name and description for concepts in this chapter.]

### Uncertainties

[Ambiguities, concepts that might overlap with other chapters,
edge cases in classification, anything the assembler should know.]
```

---

## Cross-Chapter Analyst

Dispatch as an Agent sub-agent (`subagent_type: "general-purpose"`).
Receives all Chapter Analysis Reports after Phase 1 completes.

### What to include in the dispatch prompt

```
You are analyzing relationships between chapters in an educational
source to detect concept dependencies that no single-chapter analysis
can see. You receive structured analysis reports from individual
chapter analysts — do not read the raw source material.

**Before analyzing**, read:
- `.claude/references/domain-graph-schema.md` — field definitions
- `.claude/references/developmental-model.md` — dependency types

**Chapter analysis reports:** [insert all reports]

Analyze the following:

### 1. Resolve "used" concepts

For every concept marked origin: "used" in any chapter report, find
where it was marked origin: "taught." This creates a cross-chapter
prerequisite edge: the chapter that uses concept X depends on the
chapter that taught it.

For each resolved reference, produce:
- from: concept being taught in the later chapter
- to: concept taught in the earlier chapter
- evidence: "Chapter N uses [concept] (taught in Chapter M) in
  [specific context]"
- confidence: inferred (the textbook structure confirms the
  dependency)

### 2. Detect progressive elaboration

Find concepts that appear in multiple chapter reports at different
complexity levels. If Chapter 2 introduces "props" at complexity 1-2
and Chapter 5 revisits "props" at complexity 3-4, this is progressive
elaboration. The higher-complexity treatment depends on the
lower-complexity one being consolidated.

For each instance, produce an altitude dependency edge.

### 3. Validate sequencing dependencies

The chapter ordering itself implies prerequisite direction. For each
adjacent pair of chapters, check: does the later chapter's "used"
concepts list include concepts from the earlier chapter? If so, the
sequencing signal is confirmed.

Flag cases where the sequencing seems wrong: a later chapter appears
to teach something that an earlier chapter already uses.

### 4. Measure concept reuse frequency

Count how many chapters each concept appears in (as taught, used, or
referenced). Concepts appearing across many chapters are more
foundational. Flag high-frequency concepts as threshold candidates if
they aren't already marked as such.

### 5. Identify arc-level dependencies

Based on the chapter groupings and the cross-chapter edges discovered,
propose arc-level dependencies: "arc X depends on arc Y" with
evidence from the concept-level edges.

### 6. Flag coverage gaps

Concepts with origin "used" in some chapters but not "taught" in ANY
chapter represent a coverage gap — the source assumes knowledge it
never teaches. These should become horizon concepts with a note about
where they're used.

---

**Output format:**

## Cross-Chapter Analysis Report

### Resolved Cross-Chapter Edges
[For each: from, to, chapters involved, signal type, evidence,
confidence]

### Progressive Elaboration
[Concepts with multiple complexity levels across chapters]

### Sequencing Validation
[Chapter pairs with confirmed or questionable ordering]

### Concept Reuse Frequency
[High-frequency concepts with chapter counts and threshold
recommendations]

### Arc-Level Dependencies
[Proposed arc ordering with evidence]

### Coverage Gaps
[Concepts used but never taught in any chapter]

### Uncertainties
[Ambiguities, potential false positives, edge cases]

**Do NOT write any files. Return text only.**
```

---

## Graph Merger (optional)

For domains with 15+ chapters where the total extraction output exceeds
the main agent's context budget.

Dispatch as an Agent sub-agent. Receives a subset of Chapter Analysis
Reports and produces a partially merged graph. The main agent then
merges the partial graphs (fewer, larger inputs).

### Dispatch prompt

```
You are merging multiple chapter analysis reports into a partial
domain graph. Read `.claude/references/domain-graph-schema.md` for
field definitions.

**Chapter reports to merge:** [insert reports]

Merge following these rules:
1. Deduplicate concepts: exact name match → merge. Near-match → flag
   as ambiguous (do not auto-merge).
2. Consolidate edges: merge explicit and implicit edges. Same from/to
   → keep highest confidence. Conflict → flag both.
3. Reconcile complexity ranges: take the union (min of mins, max of
   maxs).
4. Aggregate knowing profiles: modal consensus per type. Flag ties.
5. Validate composition: no cycles. Build bidirectional links.
6. Preserve all "assumed" and "used" concepts with their chapter
   provenance for cross-chapter analysis.
7. Preserve all implicit signal entries — do not discard them during
   merge.

**Output:** A single merged report in the same format as the chapter
reports, plus a "Merge Decisions" section listing every deduplication,
conflict, and ambiguity.

**Do NOT write any files. Return text only.**
```
