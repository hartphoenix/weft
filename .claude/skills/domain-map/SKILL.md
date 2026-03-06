---
name: domain-map
description: >-
  Generates a structured domain graph from source materials. Extracts
  concepts, prerequisite edges, complexity ranges, and knowing profiles.
  Use when mapping a new learning domain or building a curriculum graph.
---

# Domain Map

Generate a domain graph from source materials. Five phases.

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

Accept materials in multiple forms: `background/` files, local paths,
pasted outlines.

### 0a. Scan sources

For each source, scan TOC / headings / file list only. Do not read
chapter contents. Produce a **chapter manifest**:

| Field | Value |
|-------|-------|
| Source name | e.g., "Fractal Bootcamp Syllabus" |
| Chapter title | Top-level division name |
| File path or page range | Where to find it |
| Estimated word count | Rough estimate from file size |

The **chapter** is the extraction unit. It maps to textbook chapters,
syllabus modules, documentation sections, or equivalent top-level
divisions. If the source has no chapter structure, treat each major
heading as a chapter.

### 0b. Create state file

Write `domains/.domain-map-state.md` for resume support:

```yaml
---
domain: <domain-slug>
phase: discover
chapters_total: N
chapters_completed: []
started: YYYY-MM-DD
---

## Chapter Manifest
[manifest table]
```

### 0c. Present and confirm

Show the manifest to the human. Confirm:
- Domain slug and name
- Source coverage — anything missing?
- Whether cross-reference sources are available (enables Phase 3)

Proceed on human approval.

---

## Phase 1: Batched Extraction

Dispatch sub-agents to extract from chapters. Each sub-agent receives
its chapter path(s) + the extraction schema from `subagents.md` +
instruction to read `developmental-model.md` and
`domain-graph-schema.md` independently.

### Batch allocation

Maximum concurrent agents per batch: **4**.

| Manifest shape | Allocation |
|----------------|------------|
| 1-4 chapters | Single batch: 1 agent per chapter |
| 5-8 chapters | 2 sequential batches of <=4 agents |
| 9-20 chapters | 3-5 sequential batches of <=4 agents |
| 21+ chapters | Group adjacent small chapters (est. <5k words) into shared agent slots; then batch at <=4 |

### Chapter size handling

| Chapter size (est. words) | Action |
|--------------------------|--------|
| <2k words | Group with adjacent chapter(s) into one agent slot |
| 2k-135k words | One agent per chapter (normal case) |
| >135k words | Split at section boundaries; each section becomes its own agent slot |

### Between batches

Checkpoint progress to `.domain-map-state.md`: update
`chapters_completed` and `phase: extracting`. Resume reads this file
and skips completed chapters.

### Failure handling

- Sub-agent fails: retry once. If retry fails, log the chapter as
  incomplete and continue.
- All agents in a batch fail: halt and surface the error to the human.

---

## Phase 2: Graph Assembly

Main agent merges section extractions. Do not read raw sources — work
from sub-agent reports only.

### Merge steps

1. **Concept deduplication.**
   - Exact name match → auto-merge.
   - Alias overlap → auto-merge with primary name.
   - Semantic near-miss → **human decision point**. Present both and
     ask.

2. **Edge consolidation.**
   - Multi-source edges get higher confidence (hypothesized → inferred).
   - Conflicting edges flagged for human decision.

3. **Complexity range reconciliation.**
   - Same concept at different levels → range expands (take union).

4. **Knowing profile aggregation.**
   - Modal consensus: for each knowing type, take the most frequent
     category across sections.
   - Ties → **human decision point**.

5. **Composition tree construction + validation.**
   - Build composedOf/composesInto bidirectionally.
   - Validate: no cycles in composition.

6. **Horizon marking.**
   - Concepts assumed-but-not-taught across sections → type: "horizon".
   - These get an ID and description but no complexity range, no
     prerequisites, no knowing profile.

7. **Domain flux annotation.**
   - Based on source age and domain character.
   - Set fluxRate and validationCadence in meta.

### State update

Update `.domain-map-state.md`: `phase: assembling`.

---

## Phase 3: Cross-Reference Validation (Optional)

Only when multiple independent sources were provided in Phase 0.

Run Phase 1-2 against the second source. Compute graph diff:

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
- **Summary stats:** concept count, edge count, arc count, horizon
  count
- **Topology overview** in plain language: arcs, their major concepts,
  key prerequisite chains
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

---

## Graceful Degradation

| Missing | Effect |
|---------|--------|
| No sources | Exit with guidance on what to provide |
| Source too large | Segment further; map TOC-level if still too large |
| Sub-agent fails | Retry once; partial graph from successful sections |
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
