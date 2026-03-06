# Domain Map Sub-agents

Reference for domain-map skill sub-agent dispatch. Read on demand during
Phases 1 and 2.

---

## Section Extractor

Dispatch as an Agent sub-agent (`subagent_type: "general-purpose"`).

### What to include in the dispatch prompt

```
You are extracting learning domain concepts from source material for a
structured domain graph. Your job is to read assigned chapter(s) and
produce a structured extraction following the schema below.

**Before reading source material**, read these two reference files:
- `.claude/references/developmental-model.md` — the complexity/chunking
  model that governs how concepts relate
- `.claude/references/domain-graph-schema.md` — the field definitions
  and knowing profile rules

Use the developmental model as your analytical lens. Use the schema
reference for field definitions and categorical values.

**Assigned chapter(s):** [insert paths]

Read each chapter. For each concept you identify, extract:

[Insert the extraction schema from this file, § Extraction Schema]

After reading all assigned material, produce a Chapter Extraction
Report using the output schema below.

**Rules:**
- Only extract concepts that appear in the source material. Do not
  invent concepts from general domain knowledge.
- Mark concepts that are assumed (referenced as prerequisites but not
  taught) as "assumed" in the origin field.
- For knowing profile inference, use the signal mapping table below.
- Estimate complexity range using the 0-5 scoring scale: min = score
  at which the concept becomes functional, max = score at which it
  becomes generative.
- When uncertain about a field, note the uncertainty rather than
  guessing.

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
| origin | "taught" (explicitly covered) or "assumed" (referenced but not taught) |
| arc | Which topic area / module / arc this belongs to |
| prerequisites | List of concept IDs this depends on, with estimated minLevel |
| composedOf | Sub-concepts this decomposes into (if composite) |
| complexityRange | {min, max} on 0-5 scale |
| knowingProfile | 4P categorical weights (see signal mapping below) |
| isThreshold | true if crossing this concept reorganizes understanding downstream |
| coverageDepth | "detailed" if thoroughly covered, "sketched" if briefly mentioned, "stub" if only named |
| tags | Free-form tags |

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

### Output schema

```markdown
## Chapter Extraction Report: [Chapter Title]

### Source
- Path: [file path]
- Estimated words: [count]

### Concepts Extracted

[For each concept, use the extraction schema fields above.
Format as a structured list or table.]

### Prerequisite Edges

[List of edges using the edge extraction fields above.]

### Assumed Concepts

[Concepts referenced but not taught in this chapter.
These become horizon candidates in the assembled graph.]

### Arc Assignment

[Proposed arc name and description for concepts in this chapter.]

### Notes

[Uncertainties, ambiguities, concepts that might overlap with
other chapters, anything the assembler should know.]
```

---

## Graph Merger (optional)

For domains with 15+ chapters where the total extraction output exceeds
the main agent's context budget.

Dispatch as an Agent sub-agent. Receives a subset of Chapter Extraction
Reports and produces a partially merged graph. The main agent then
merges the partial graphs (fewer, larger inputs).

### Dispatch prompt

```
You are merging multiple chapter extraction reports into a partial
domain graph. Read `.claude/references/domain-graph-schema.md` for
field definitions.

**Chapter reports to merge:** [insert reports]

Merge following these rules:
1. Deduplicate concepts: exact name match → merge. Near-match → flag
   as ambiguous (do not auto-merge).
2. Consolidate edges: same from/to → keep highest confidence. Conflict
   → flag both.
3. Reconcile complexity ranges: take the union (min of mins, max of maxs).
4. Aggregate knowing profiles: modal consensus per type. Flag ties.
5. Validate composition: no cycles. Build bidirectional links.
6. Preserve all "assumed" concepts for horizon marking.

**Output:** A single merged extraction report in the same format as the
chapter reports, plus a "Merge Decisions" section listing every
deduplication, conflict, and ambiguity.

**Do NOT write any files. Return text only.**
```
