---
name: domain-map
description: >-
  Generates a structured domain graph from source materials. Analyzes
  pedagogical structure to extract concepts, prerequisite edges,
  complexity ranges, and knowing profiles — including implicit
  dependencies communicated through sequencing, code examples, and
  progressive elaboration. Use when mapping a new learning domain or
  building a curriculum graph.
---

# Domain Map

Generate a domain graph from source materials. Six phases.

Extraction is the load-bearing function of the entire harness. The
quality of every downstream operation — outer fringe computation, goal
weighting, practice mode selection, session review targeting — is
bounded by the fidelity of the domain graph. Optimize for analytical
depth, not throughput.

---

## Path Resolution

Read `~/.config/weft/root` for harness root. All paths resolve from
there. Output goes to `<harness-root>/domains/`.

Read these references before starting:
- `.claude/references/domain-graph-schema.md` — field semantics, knowing
  profile mapping, interaction matrix, versioning protocol
- `.claude/references/developmental-model.md` — complexity/chunking
  model, dependency types

---

## Phase 0: Discover Sources

Accept materials in multiple forms: `background/` files, URLs, local
paths, pasted outlines.

### 0a. Scan sources

For each source, scan TOC / headings / file list only. Do not read
chapter contents. Produce a **chapter manifest**:

| Field | Value |
|-------|-------|
| Source name | e.g., "Full Stack Open Part 1" |
| Chapter title | Top-level division name |
| File path or page range | Where to find it |
| Estimated word count | Rough estimate from file size |
| Sequence position | Order in the source (1, 2, 3...) |

The **chapter** is the extraction unit. It maps to textbook chapters,
syllabus modules, documentation sections, or equivalent top-level
divisions. If the source has no chapter structure, treat each major
heading as a chapter.

Include a **total estimated word count** at the bottom of the manifest
(sum of per-chapter estimates).

**Preserve chapter boundaries.** Every chapter is its own extraction
unit, regardless of size. Do not group small adjacent chapters — the
boundary between chapters is a pedagogical signal (the author chose to
separate these topics). A 500-word chapter gets its own extraction.

### 0b. Create state file

Write `domains/.domain-map-state.md` for resume support:

```yaml
---
domain: <domain-slug>
phase: discover
scale: <small|medium|large|very-large|library>
chapters_total: N
chapters_completed: []
started: YYYY-MM-DD
---

## Chapter Manifest
[manifest table with sequence positions]
```

### 0c. Assess scale

Classify the source using total estimated word count:

| Scale | Total words | Chapters | Quality expectation |
|-------|------------|----------|-------------------|
| small | < 30k | 2-4 | Highest — single run, no special handling |
| medium | 30-100k | 4-12 | High — full pipeline sweet spot |
| large | 100-200k | 12-30 | Good — flag oversized chapters |
| very-large | 200-400k | 30-60 | Requires partitioning for full depth |
| library | 400k+ | 60+ | Requires partitioning |

Record the classification in the state file's `scale` field.

Flag individual chapters that are unusually large:
- Over 15k words: note that analytical depth may vary; offer to split
  at section boundaries.
- Over 50k words: recommend splitting.
- Over 130k words: require splitting (exceeds raw capacity).

Frame chapter size guidance in plain language: "Chapter 7 is very
long — I'll get better results if I analyze its sections separately."

### 0d. Present and confirm

Show the manifest, total word count, and scale classification. Then:

**Small or medium:** Confirm domain slug, source coverage, and whether
cross-reference sources are available (enables Phase 3). Proceed on
human approval.

**Large:** Same confirmations, plus: note any flagged chapters and
offer section splitting. If chapter count is under ~30, recommend
proceeding. If over, suggest a natural starting partition (textbook
part, course module, or topic boundary visible in the TOC) and note
that the graph can be extended later with domain-update.

**Very large or library:** Tell the user plainly that the material
exceeds what one pass can analyze at full depth. Propose a starting
partition based on the source's own structure. Example framing:

> "This is a large collection — [N chapters, ~Xk words]. The deepest
> analysis works best on 4-12 chapters at a time. I'd recommend
> starting with [specific partition based on TOC structure] and
> building out from there. You can extend the graph later — each new
> section adds to the same map."

Proceed on the user's chosen scope. Update the state file's
`chapters_total` to reflect the chosen partition, not the full source.

---

## Phase 1: Chapter Analysis

Dispatch sub-agents to analyze chapters. Each sub-agent receives its
chapter path(s) + the full analysis protocol from `subagents.md` +
instruction to read `developmental-model.md` and
`domain-graph-schema.md` independently.

**The sub-agent's job is analytical, not mechanical.** It reads the
chapter as a pedagogical unit: understanding what the author is
teaching, in what order, building on what assumptions, and
communicating what dependencies through structure. The structured
extraction comes second, after the analysis.

### Dispatch rules

One chapter per sub-agent. Maximum concurrent agents per batch: **4**.

| Manifest shape | Allocation |
|----------------|------------|
| 1-4 chapters | Single batch: 1 agent per chapter |
| 5-8 chapters | 2 sequential batches of <=4 agents |
| 9-20 chapters | 3-5 sequential batches of <=4 agents |
| 21+ chapters | Sequential batches of <=4 agents |

### Chapter size handling

| Chapter size (est. words) | Action |
|--------------------------|--------|
| Up to 15k words | One agent. Full analytical depth. |
| 15-50k words | One agent. Note to user: depth may vary on longest sections. |
| 50-130k words | Recommend splitting at section boundaries. Each section gets its own agent slot. Preserve section order metadata. |
| >130k words | Require splitting. Exceeds raw capacity. |

Small chapters are NOT grouped. Each chapter boundary is a signal.

### Between batches

Checkpoint progress to `.domain-map-state.md`: update
`chapters_completed` and `phase: analyzing`. Resume reads this file
and skips completed chapters.

### Failure handling

- Sub-agent fails: retry once. If retry fails, log the chapter as
  incomplete and continue.
- All agents in a batch fail: halt and surface the error to the human.

---

## Phase 1.5: Cross-Chapter Analysis

After all chapter analyses complete, dispatch 1-2 cross-chapter
analyst sub-agents. See `subagents.md § Cross-Chapter Analyst` for the
dispatch prompt.

Each analyst receives **all chapter extraction reports** (not raw
sources). Their job: detect relationships that no single-chapter
extractor can see.

### What cross-chapter analysis detects

1. **Forward references resolved.** Chapter 3's extractor reported
   "concept X used but not taught here." Cross-chapter analyst finds
   X was taught in Chapter 1 → creates edge with evidence.

2. **Progressive elaboration.** Same concept at complexity 2 in
   Chapter 1 and complexity 4 in Chapter 5 → creates altitude
   dependency edge.

3. **Sequencing-as-dependency.** Chapter order implies prerequisite
   direction. Cross-chapter analyst validates by checking whether
   later chapters' code examples use concepts from earlier chapters.

4. **Concept reuse frequency.** Concepts appearing across many
   chapters are more foundational → flags for threshold consideration.

5. **Arc-level dependencies.** The source's own organizational
   structure (parts, modules) implies arc-level ordering.

### Allocation

| Chapter count | Cross-chapter agents |
|--------------|---------------------|
| 1-6 | 1 agent receives all reports |
| 7-15 | 1 agent (reports are structured, not raw text) |
| 16+ | 2 agents with overlapping chapter ranges |

### State update

Update `.domain-map-state.md`: `phase: cross-analysis`.

---

## Phase 2: Graph Assembly

Main agent merges chapter analyses + cross-chapter findings. Do not
read raw sources — work from sub-agent reports only.

**Assembly is analytical work, not a script.** The merge steps below
involve judgment calls — semantic deduplication, edge confidence
promotion, knowing profile ties — that require reasoning in context.
Do the merge reasoning yourself. Write the result as JSON. Then
validate structurally by running:

```
bun run scripts/lib/graph-queries.ts \
  --graph <output-path> --query coverage
```

`loadDomainGraph()` checks that all edge targets exist, composition
links are bidirectional, and required fields are present. It will
throw on structural errors. Fix any errors it surfaces, then proceed
to human review. Do not write a build script for assembly.

### Merge steps

1. **Concept deduplication.**
   - Exact name match → auto-merge.
   - Alias overlap → auto-merge with primary name.
   - Semantic near-miss → **human decision point**. Present both and
     ask.

2. **Edge consolidation.**
   - Merge explicit edges (from chapter analysis) with implicit edges
     (from cross-chapter analysis).
   - Edges reported by multiple chapter analysts get higher confidence
     (hypothesized → inferred → confirmed). Two independent analysts
     reporting the same edge is sufficient for promotion.
   - Implicit edges corroborated by multiple signal types get promoted.
   - Conflicting edges flagged for human decision.

3. **Complexity range reconciliation.**
   - Same concept at different levels across chapters → range expands
     (take union).
   - Progressive elaboration creates altitude dependencies, not just
     wider ranges.

4. **Knowing profile aggregation.**
   - Modal consensus: for each knowing type, take the most frequent
     category across chapters.
   - Ties → **human decision point**.

5. **Composition tree construction + validation.**
   - Build composedOf/composesInto bidirectionally.
   - Validate: no cycles in composition.

6. **Horizon marking.**
   - Concepts with origin "assumed" across all chapters → type:
     "horizon".
   - Concepts with origin "used" in some chapters but "taught" in none
     → likely a coverage gap. Flag for human.

7. **Domain flux annotation.**
   - Based on source age and domain character.
   - Set fluxRate and validationCadence in meta.

### State update

Update `.domain-map-state.md`: `phase: assembling`.

---

## Phase 3: Cross-Reference Validation (Optional)

Only when multiple independent sources were provided in Phase 0.

Run Phases 1-1.5 against the second source. Compute graph diff:

| Category | Meaning | Action |
|----------|---------|--------|
| New concept | In second source, not first | Present for inclusion |
| Missing concept | In first, not second | Note coverage boundary |
| Edge conflict | Different prerequisite structure | Present both; human decides |
| Complexity conflict | Different ranges | Expand to union |
| Knowing profile conflict | Different categories | Present both |
| Structural match | Same in both | Boost confidence to "confirmed" |

Present decision table to human. Apply approved changes.

---

## Phase 4: Human Review + Output

### Present for review

Show:
- **Summary stats:** concept count, edge count (explicit vs. implicit),
  arc count, horizon count
- **Topology overview** in plain language: arcs, their major concepts,
  key prerequisite chains
- **Implicit edge summary:** edges detected through structural analysis
  (co-occurrence, sequencing, refactoring chains) with their evidence
- **Decision points** accumulated from Phase 2-3
- **Coverage boundaries:** what the graph covers and what it doesn't
- **Flux annotation:** classification and cadence

### Write output

After human approval:

1. Write `domains/<domain-slug>.domain.json` matching the DomainGraph
   type from `scripts/types/domain-graph.ts`.

2. Initialize empty learner state at
   `learning/state/<domain-slug>.state.json`:
   ```json
   {
     "meta": {
       "learnerId": "<from-context>",
       "domainGraphId": "<domain-slug>",
       "domainGraphVersion": "1.0.0",
       "created": "<today>",
       "lastModified": "<today>"
     },
     "observations": {},
     "bridges": [],
     "goals": []
   }
   ```

3. Clean up `.domain-map-state.md`.

---

## Behavioral Overrides

- Do not invent concepts not in the source material.
- Do not read raw sources in the main agent (manifest-then-delegate).
- Do not auto-merge ambiguous concept names (present as decision points).
- Do not write output without human approval.
- Do not put scores, gaps, or assessment data in the domain graph.
- Do not group small chapters together — each boundary is a signal.

---

## Graceful Degradation

| Missing | Effect |
|---------|--------|
| No sources | Exit with guidance on what to provide |
| Source too large | Segment further; map TOC-level if still too large |
| Sub-agent fails | Retry once; partial graph from successful chapters |
| No developmental model | Extract without complexity calibration; note in metadata |
| Single source only | Skip Phase 3; note single-source in metadata |

---

## Interoperation

| Skill | Relationship |
|-------|-------------|
| intake | Reads existing domain graphs if present; does NOT invoke domain-map |
| startwork | Reads domain graph for prerequisite-aware priority ranking |
| session-review | Uses knowing profiles to select assessment instruments |
| lesson-scaffold | Uses prerequisite edges for gap detection |
| progress-review | Uses domain graph for coverage analysis |
| domain-update | Companion skill: expands or validates existing graph against new sources |
