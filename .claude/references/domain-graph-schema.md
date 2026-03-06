# Domain Graph Schema

Shared reference for skills that read or write domain graphs and learner
state. Canonical types live in `scripts/types/domain-graph.ts` and
`scripts/types/learner-state.ts`. This file documents semantics, field
rules, and the interaction matrix.

---

## Core distinction: topology vs. observation

**Domain graph** = properties of the domain. Shared, versioned, learner-
independent. Concepts, prerequisite edges, arcs, complexity ranges,
knowing profiles. Lives at `domains/<domain-slug>.domain.json`.

**Learner state** = properties of one learner's relationship to a domain
graph. Per-learner, per-domain. Scores, gap types, chunking state,
assessment history, bridges, goals. Lives at
`learning/state/<domain-slug>.state.json`.

They join on concept ID. The domain graph says "concept X requires
concept Y at level 3." The learner state says "this learner is at
level 4 on Y and level 2 on X."

**Invariant:** The domain graph never contains scores, gaps, or
assessment data. The learner state never contains prerequisite edges,
complexity ranges, or knowing profiles. If you find yourself putting
learner data in the domain graph, stop.

---

## Domain Graph fields

### DomainMeta

| Field | Type | Semantics |
|-------|------|-----------|
| id | string | Stable slug. Never changes after creation. |
| version | semver string | Minor = additive (new concepts, edges). Major = breaking (removed concepts, restructured arcs). |
| name | string | Human-readable domain name. |
| description | string | What this domain covers. |
| created | ISO date | When the graph was first generated. |
| lastModified | ISO date | When any content was last changed. |
| fluxRate | "stable" / "moderate" / "rapid" | How fast the domain itself changes. See flux classification below. |
| validationCadence | number | Days between re-validation checks. |
| lastValidated | ISO date (optional) | When the graph was last cross-checked against sources. |
| sources | SourceRef[] | Materials used to build or validate the graph. |

### ConceptNode

| Field | Type | Semantics |
|-------|------|-----------|
| name | string | Human-readable concept name. |
| type | "concept" / "horizon" | Horizon = known to exist but not mapped. Has an ID and maybe a description, but no complexity range, no prerequisites, no knowing profile. |
| description | string (optional) | What this concept is, briefly. |
| arc | string | Which arc this concept belongs to. |
| complexityRange | {min, max} (optional) | Score range where the concept is functional (min) to generative (max). Uses the 0-5 scoring scale from scoring-rubric.md. Not MHC orders — score range is the observable proxy. |
| knowingProfile | 4P object (optional) | Which types of knowing the domain demands. See knowing profile section below. |
| isThreshold | boolean (optional) | Domain topology marker: crossing this concept produces a qualitative shift in understanding of everything downstream. |
| transitionBarrier | number (optional) | Score where the functional-to-generative boundary sits. |
| coverageDepth | "detailed" / "sketched" / "stub" | How thoroughly this concept is mapped. Detailed = full prerequisites, complexity, knowing profile. Stub = just an ID and name. |
| composedOf | string[] | Sub-concept IDs this decomposes into. |
| composesInto | string[] | Parent concept IDs this is a component of. |
| tags | string[] (optional) | Free-form tags for filtering. |

**Composition is bidirectional.** If A.composedOf includes B, then
B.composesInto must include A. Skills that write domain graphs must
enforce this invariant.

### PrerequisiteEdge

| Field | Type | Semantics |
|-------|------|-----------|
| from | string | Dependent concept ID (the one that needs the prerequisite). |
| to | string | Prerequisite concept ID. |
| minLevel | number | Minimum score on 'to' required. 0-5 scale. |
| knowingType | 4P type (optional) | Which type of knowing on the prerequisite is required. |
| logic | "and" / "or" | How this edge combines with others sharing the same 'from' and 'group'. |
| group | string (optional) | Groups edges into AND/OR sets. Edges in the same group with logic "or" form an OR-set (any one suffices). Edges in the same group with logic "and" form an AND-set (all required). Ungrouped edges are implicitly AND. |
| confidence | "confirmed" / "inferred" / "hypothesized" | How well-established this edge is. Confirmed = validated by multiple sources or human review. Inferred = extracted from a single source. Hypothesized = agent's best guess. |
| note | string (optional) | Context for the edge. |

### Arc

| Field | Type | Semantics |
|-------|------|-----------|
| name | string | Human-readable arc name. |
| description | string | What this arc covers. |
| outcomes | string[] | Domain-level capabilities this arc develops. |
| dependencies | ArcDependency[] (optional) | Other arcs this one depends on. Hard = must complete first. Bridge = dramatically easier if completed first but not required. |

---

## Learner State fields

### LearnerMeta

| Field | Type | Semantics |
|-------|------|-----------|
| learnerId | string | Who this state belongs to. |
| domainGraphId | string | Which domain graph this overlays. Must match a domain graph's meta.id. |
| domainGraphVersion | string | Pinned version. When the domain graph version exceeds this, migration detection triggers. |
| created | ISO date | When this learner state was initialized. |
| lastModified | ISO date | When any observation was last updated. |

### ConceptObservation

| Field | Type | Semantics |
|-------|------|-----------|
| score | number or null | 0-5 scale (scoring-rubric.md). Null = unassessed. |
| gap | gap type or null | "conceptual" / "procedural" / "recall" / null. Null when score >= 4 or no gap evidence. |
| fluencyTarget | "production" / "evaluation" | Whether the learner needs to produce or evaluate this concept. Evaluation = can recognize and assess but doesn't need to generate from scratch. |
| chunkingState | "early" / "consolidated" | System's coarse binary. Early = still building chunks. Consolidated = patterns are wired. |
| chunkingSelfReport | self-report value (optional) | Learner's own assessment: "exposure" / "recognition" / "fluency" / "automaticity". Kept separate — the system never overwrites the learner's voice with its own inference. |
| lastAssessed | ISO date or null | When this concept was last scored. |
| timesAssessed | number | How many times this concept has been assessed. |
| assessments | Assessment[] | Full history of assessments. Newest first. |

### Assessment

| Field | Type | Semantics |
|-------|------|-----------|
| date | ISO date | When the assessment occurred. |
| score | number or null | Score assigned. Null if gap-only update. |
| source | string | Evidence tag from scoring-rubric.md. E.g., "session-review:quiz", "intake:artifact", "digest:observed". |
| gap | gap type (optional) | Gap classification at time of assessment. |
| note | string (optional) | Context for the score. |
| evidence | string (optional) | What the learner did or said that produced this score. |
| instrument | instrument type (optional) | How the assessment was conducted. Maps to knowing profile assessment capabilities — see below. |

### BridgeHypothesis

| Field | Type | Semantics |
|-------|------|-----------|
| from | string | Source concept or external skill. |
| to | string | Target concept ID in the domain graph. |
| fromDomain | string (optional) | If the bridge originates outside this domain graph. |
| status | bridge status | "hypothesized" / "tested" / "confirmed" / "disconfirmed". |
| complexityFloor | number (optional) | Minimum complexity level at which the bridge becomes visible. |
| evidence | string (optional) | What suggests this bridge exists. |
| date | string (optional) | When the hypothesis was formed or last updated. |

### Goal

| Field | Type | Semantics |
|-------|------|-----------|
| id | string | Stable identifier. |
| name | string | Human-readable goal name. |
| description | string (optional) | What achieving this goal looks like. |
| priority | number | Lower = higher priority. 1 = primary goal. |
| status | "active" / "deferred" / "achieved" | Current goal status. |

---

## Knowing profile

Vervaeke's 4P knowing types and how the system assesses each:

| Knowing type | What it means | Assessment instrument | Observable? |
|-------------|---------------|----------------------|-------------|
| Propositional | Knowing-that. Facts, definitions, relationships. | Quiz | Yes — directly assessable |
| Procedural | Knowing-how. Can execute the procedure. | Artifact review | Yes — observable in work product |
| Perspectival | Knowing-what-it's-like. Can take the perspective. | Conversation | Partially — requires engaged dialogue |
| Participatory | Knowing-by-being-in-relation-to. Embodied practice. | Self-report only | No — only the learner can assess this |

**Categorical weights:** "primary" / "necessary" / "minor" / "negligible".
Not numeric. Numeric precision is false precision for something inferred
from source materials.

- **Primary:** This knowing type is the core demand. Can't claim the
  concept without it.
- **Necessary:** Required but not the main event.
- **Minor:** Helps but not required for functional use.
- **Negligible:** Not meaningfully demanded by this concept.

**Example:** `Array.prototype.map()` — procedural: primary (you need to
write it), propositional: necessary (you need to know it transforms
without mutating), perspectival: minor (seeing the data flow helps but
isn't required), participatory: negligible.

**Example:** "code review" — perspectival: primary (you need to see the
code from the reader's perspective), procedural: necessary (you need to
execute the review process), propositional: minor (naming patterns
helps), participatory: minor (team norms matter).

---

## Interaction matrix (2x3)

Maps `{chunkingState} x {gap}` to practice mode recommendation. This
is the core dispatch logic for selecting what kind of practice a
concept needs.

| | conceptual | procedural | recall |
|---|---|---|---|
| **early** | Bridge-building: find the structural analogy from a known domain. Socratic questions, not explanations. | Guided practice: work through examples with scaffolding. Tight feedback loops. | Spaced retrieval: prompt, attempt, reveal. Low stakes, high frequency. |
| **consolidated** | Reframing: the learner has chunks but the wrong model connecting them. Present the correct model and let them reorganize. | Deliberate practice: harder variations, edge cases, time pressure. Remove scaffolding. | Interleaved review: mix with related concepts. The chunks are there but retrieval paths need refreshing. |

**How to read it:** Look up the learner's chunkingState and gap for a
concept. The cell tells you what kind of practice to assign.

**Who uses this:** session-review (selecting quiz type), lesson-scaffold
(structuring practice), startwork (recommending session activities).

---

## Domain flux classification

| Rate | Meaning | Examples | Validation cadence |
|------|---------|----------|--------------------|
| stable | Core domain knowledge changes on decade+ timescales. | Mathematics, data structures, algorithms, music theory | 365 days |
| moderate | Tools and practices evolve but foundations persist. | Web development frameworks, database patterns, design systems | 90 days |
| rapid | Significant changes on month timescales. | AI/ML tooling, specific framework APIs, cloud service features | 30 days |

Flux rate affects:
- How aggressively to age unvalidated concepts
- Whether to trust older sources
- How often to run domain-update

---

## Edge confidence definitions

| Level | Meaning | When to assign |
|-------|---------|---------------|
| confirmed | Validated by multiple independent sources or explicit human review. | Multi-source extraction, human approval, or cross-reference validation. |
| inferred | Extracted from a single source with reasonable confidence. | Single-source extraction where the prerequisite relationship is explicit in the material. |
| hypothesized | Agent's best guess based on domain knowledge or structural analysis. | Implicit prerequisites, structural inference, or gap-filling. |

Multi-source edges get promoted: hypothesized + second source confirming
→ inferred. Inferred + human confirmation → confirmed.

---

## Versioning protocol

**Minor version** (e.g., 1.0 → 1.1): Additive changes only. New
concepts, new edges, new arcs, expanded descriptions, upgraded coverage
depth. No existing concept IDs changed or removed. Learner state files
pinned to an older minor version remain valid — all their concept IDs
still exist.

**Major version** (e.g., 1.1 → 2.0): Breaking changes. Concept IDs
removed, renamed, or restructured. Arc boundaries changed. Learner
state files pinned to the old major version need migration — some
concept IDs may no longer exist. The migration script
(`migrate-observations.ts`) handles this.

---

## The learning state as hypothesis

The learner state is always a working hypothesis about where the learner
is. It is never ground truth. Every score, gap classification, and
chunking assessment is an inference from limited evidence — quizzes,
artifacts, conversations, self-reports — each with its own confidence
level and instrument limitations.

**Stein's constraint:** Don't track what you can't observe. The schema
has resolution ceilings. The system can assess propositional knowing via
quizzes and procedural knowing via artifacts, but perspectival knowing
requires engaged conversation and participatory knowing can only be
self-reported. Fields that exceed the system's assessment capability
create false precision that corrupts decision-making.

**Practical implication:** When the system can't assess a knowing type
for a concept, it should leave the observation empty rather than guess.
An explicit null is more honest than an inferred score.

---

## Dynamic surmise relation

The learner-specific prerequisite graph combines three constraint types:

- **Q_hard** — Universal hard prerequisites from the domain graph.
  Static across learners.
- **Q_bridge** — Learner-specific bridge dependencies. Confirmed bridges
  from learner state create additional prerequisite paths that make
  certain concepts easier to reach.
- **Q_altitude** — Threshold concept gates. Downstream concepts only
  fully unlock when the threshold concept is consolidated (chunkingState
  = "consolidated"), not just scored above a threshold.

The union Q_hard + Q_bridge + Q_altitude defines what's reachable for
this specific learner. The outer fringe is computed against this union.
