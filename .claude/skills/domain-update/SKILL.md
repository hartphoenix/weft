---
name: domain-update
description: >-
  Updates an existing domain graph from new source materials. Handles
  both expansion (adding concepts from new resources) and validation
  (checking existing coverage against updated sources). Use when the
  learner acquires new material, a domain graph needs refreshing, or
  unmapped concepts are encountered.
---

# Domain Update

Update an existing domain graph from new source materials. Four phases.

---

## Path Resolution

Read `~/.config/weft/root` for harness root. Domain graphs live at
`<harness-root>/domains/`. Read `.claude/references/domain-graph-schema.md`
for field semantics and versioning protocol.

---

## Phase 0: Load

### 0a. Load existing graph

Read the target domain graph from `domains/<domain-slug>.domain.json`.
Report current state: version, concept count, edge count, arc count,
last validated date, flux rate.

### 0b. Scan new sources

Produce a chapter manifest of the new material (same chapter-level scan
as domain-map Phase 0). Do not read chapter contents.

### 0c. Create state file

Write `domains/.domain-update-state.md`:

```yaml
---
domain: <domain-slug>
existing_version: <current version>
phase: load
chapters_total: N
chapters_completed: []
started: YYYY-MM-DD
---
```

### 0d. Present and confirm

Show the existing graph summary alongside the new source manifest.
Confirm the update scope with the human.

---

## Phase 1: Diff Extraction

Dispatch sub-agents against the new source material using the same
Section Extractor from `domain-map/subagents.md`. Same batch allocation
rules as domain-map Phase 1 (max 4 concurrent agents).

Each agent receives its chapter(s) + extraction schema + instruction to
read developmental-model.md and domain-graph-schema.md.

Between batches, checkpoint to `.domain-update-state.md`.

---

## Phase 2: Diff Computation

Compare extractions against the existing graph. Classify every
difference:

| Category | Meaning | Default action |
|----------|---------|----------------|
| New concept | In new source, not in graph | Add (human confirms) |
| Deprecated | In graph, contradicted by new source | Flag for removal or horizon demotion |
| Coverage gap | In graph as stub/sketched, detailed in new source | Upgrade coverage depth |
| Edge change | Prerequisite relationship differs | Present both; human decides |
| Complexity drift | Complexity range differs | Expand range (take union) |
| Knowing profile shift | Profile categories differ | Flag for human |
| Structural match | Already in graph, confirmed by new source | Boost edge confidence to "confirmed" |

### Diff report

Produce a structured diff table with:
- Category for each difference
- Current value in graph
- New value from extraction
- Proposed action
- Confidence level

---

## Phase 3: Human Review + Merge

### Present the diff

Show the diff table organized by category. Allow the human to:
- Approve individual changes
- Approve all changes in a category
- Reject individual changes
- Modify proposed values

### Apply approved changes

1. Add new concepts with their full metadata.
2. Remove or demote deprecated concepts.
3. Upgrade coverage depth where new sources provide detail.
4. Update edges per human decisions.
5. Expand complexity ranges.
6. Update knowing profiles.
7. Boost confidence on structurally matched edges.

### Version bump

- **Minor** (1.0 → 1.1): Only additions and upgrades. No concept IDs
  removed or renamed.
- **Major** (1.x → 2.0): Any removal, rename, or structural
  reorganization of concept IDs.

### Update metadata

- `meta.version` → bumped per above
- `meta.lastModified` → today
- `meta.lastValidated` → today
- `meta.sources` → append new source references

### Write

Write the updated `domains/<domain-slug>.domain.json` after human
approval. Clean up `.domain-update-state.md`.

---

## Behavioral Overrides

- Do not auto-apply changes without human review.
- Do not remove concepts without explicit human approval.
- Do not modify learner state — this skill only touches the domain graph.
- When in doubt about a classification, present it as a decision point.

---

## Graceful Degradation

| Missing | Effect |
|---------|--------|
| No existing graph | Exit — use domain-map instead |
| No new sources | Exit with guidance |
| Sub-agent fails | Retry once; partial diff from successful chapters |
| Ambiguous diff | Present all ambiguities as decision points |
