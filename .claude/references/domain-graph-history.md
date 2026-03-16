# Domain Graph Schema: Design History and Provenance

Date: 2026-03-16

This document traces the full design lineage of the domain graph schema,
from initial research through implementation, testing, and planned
extensions. It serves as a reference for any future modification — every
design decision recorded here has a reason, and changes should
understand that reason before proceeding.

---

## Timeline

### Pre-March 6, 2026 — Research Phase

Four research documents established the theoretical foundation. All live
in `/Users/rhhart/Documents/GitHub/weft-dev/research/`.

**learning-model-research-plan.md** (~1148 lines)
- Traced the evolution of learning state representation in the roger
  project through three stages: prose growth profile → flat YAML
  tracking → hierarchical goal structure
- Catalogued what the system encodes (score 0-5, gap type, evidence
  source, history, arc membership) vs. what it doesn't (complexity
  level, chunking state, bridge dependencies, hard prerequisites,
  altitude dependencies, next move)
- Evaluated three theoretical frameworks: Commons' Model of Hierarchical
  Complexity (MHC), Stein's metapsychology (task complexity ≠ person
  complexity), Freinacht's Four Fields (cognitive complexity, cultural
  code, psychological state, depth)
- Identified four core trade-offs: fidelity vs. legibility, fidelity vs.
  assessment capability, portability vs. domain-specificity, hierarchy
  vs. flatness
- Proposed four candidate representation strategies, evaluated each
- Established the "assessment resolution ceiling" principle from Stein:
  don't track what you can't observe
- Recommended empirical next steps in four phases

**learning-dag-representations.md** (~755 lines)
- Surveyed how ML/AI systems represent hierarchical knowledge structures
- Evaluated: Knowledge Graph Embeddings (TransE, RotatE, HAKE, Poincaré),
  Graph Neural Networks, Bayesian/Deep Knowledge Tracing, ALEKS/KST,
  OWL/RDF ontologies, Graph Attention Networks, Curriculum Learning
- Key finding: no ML/embeddings needed for the scale we're operating at
  (~80-200 concepts). The "cheapest useful structure" is a JSON DAG
  with bidirectional edges
- Proposed the query algorithm for "highest-priority growth edges" that
  became `getGoalWeightedPriority()`

**dag-representation-research.md** (~697 lines)
- Evaluated JSON schema approaches for DAG representation (5 candidates;
  bidirectional adjacency won)
- Surveyed graph theory structures (GRAIL reachability, algebraic graphs,
  interval-based reachability)
- Strongest finding: Knowledge Space Theory (KST) and the ALEKS system —
  the outer fringe IS the recommendation, directly computable
- Surveyed game systems for precedent: Civilization AND/OR prerequisites,
  Burning Wheel practice-type progression, Factorio prerequisite cost
- Evaluated graph databases (Graphology tier 1, SQLite tier 2, DataScript
  tier 3)
- Cross-domain analogies: BOM explosion, causal do-operator, Makefile
  DAGs, Tonnetz hub detection, Git Merkle DAG, TypeScript type checker
- Produced convergent schema design with full node structure

**deep-research-synthesis.md** (~665 lines)
- Second-round research from 9 targeted agents on three high-promise areas
- Thread 1 (KST + Assessment): Polytomous KST (outer fringe on graded
  mastery, not binary), fuzzy skill maps (variable prerequisite
  thresholds), gap types extending Competence-based KST, ALEKS internals
  (Continuous Markov Procedure), multiple developmental fields as product
  spaces, dynamic surmise relation (Q_hard + Q_bridge + Q_altitude)
- Thread 2 (Causal DAGs for Bridges): Do-calculus for typed skill graphs,
  d-separation for learning path independence, bridge detection pipeline,
  Lobato's actor-oriented transfer (bridges are learner-constructed),
  Gentner's Structure-Mapping Engine
- Thread 3 (Practice Progression): Interaction matrix (2×3: chunking
  state × gap type → practice mode), arrested development, 85% Rule for
  ZPD, phase transitions across six converging frameworks, catastrophe
  flags, Karmiloff-Smith representational redescription, threshold
  concepts as structural markers
- Produced the extended growth-edge algorithm and convergent schema

### March 6, 2026 — Primary Development Day

**Session 9ca28cf7** (21:53 UTC)
- Produced the complete schema specification plan:
  `/Users/rhhart/Documents/GitHub/weft-dev/plans/2026-03-06-domain-graph-schema-learner-state-domain-map.md`
  (763 lines)
- Defined three co-dependent deliverables: TypeScript types, reference
  files, and the domain-map skill
- Established the core architectural split: domain graph (shared domain
  topology) vs. learner state (per-learner observations), joining on
  concept ID

**Commit 2176a14** (17:10 EST) — "Add domain graph schema, learner state
types, and generation skills"
- 10 new files, 2143 insertions
- Created: `scripts/types/domain-graph.ts` (77 lines),
  `scripts/types/learner-state.ts` (57 lines),
  `.claude/references/domain-graph-schema.md` (286 lines),
  `docs/schema-guide.md` (176 lines),
  `.claude/skills/domain-map/SKILL.md` (253 lines, v1),
  `.claude/skills/domain-map/subagents.md` (174 lines, v1),
  `.claude/skills/domain-update/SKILL.md` (156 lines),
  `scripts/lib/graph-queries.ts` (455 lines),
  `scripts/migrate-observations.ts` (509 lines),
  `domains/.gitkeep`

**Session ce408b1e** (23:13 UTC) — Testing session
- Ran domain-map v1 against Full Stack Open Part 1
- v1 produced: 75 concepts, 87 edges, 6 arcs, 11 horizon concepts, 19
  threshold concepts
- **Critical finding:** v1 missed the `react-props →
  destructuring-assignment` edge. Root cause: v1 extraction was
  mechanical (single-pass, explicit prerequisites only), missing implicit
  dependencies communicated through pedagogical structure
- Produced handoff doc:
  `/Users/rhhart/Documents/GitHub/weft-dev/plans/domain-map-handoff.md`

**Commit e456f33** (19:40 EST) — "Refine domain-map skill and graph
query utilities"
- v2 skill: 503 insertions/113 deletions across 3 files
- Added two-pass extraction (narrative pedagogical analysis → structured
  extraction)
- Added implicit signal taxonomy (8 signal types): co-occurrence,
  sequencing, refactoring-chain, motivating-problem,
  definitional-embedding, explicit-callback, anti-pattern,
  scaffolded-example
- Added Phase 1.5 (Cross-Chapter Analysis)
- Added three-value origin field (taught/used/assumed) — the critical
  innovation enabling cross-chapter edge detection
- v2 results: 73 concepts, 108 edges, 6 confirmed cross-chapter edges.
  The `react-props → destructuring-assignment` edge was found.

**Session ce408b1e continued** — v3 handoff
- v3 refinement: assembly without scripts (agents write JSON directly,
  validate with graph-queries.ts)
- Produced:
  `/Users/rhhart/Documents/GitHub/weft-dev/plans/domain-map-v3-handoff.md`

### March 7-14, 2026 — Integration Planning

**Session 6f8c0bf4** (stamped March 14, 14:00 UTC)
- Produced the integration plan:
  `/Users/rhhart/Documents/GitHub/weft-dev/design/2026-03-07-domain-graph-integration-plan.md`
  (619 lines)
- Eight-phase update sequence for shipping schema to main
- 27 ranked open questions (blocker/priority matrix)
- Risk registry and dependency graph
- Skill-by-skill breakage analysis
- Existing user migration strategy (three profiles, five-step upgrade)
- Also produced:
  `/Users/rhhart/Documents/GitHub/weft-dev/research/2026-03-06-learning-state-evolution.md`
  (366 lines) — five-layer architecture, conversational correction loop

### March 16, 2026 — Lens Architecture and Stereoscopic Validation

Planned extension to handle non-technical source materials. Full plan at
`~/.claude/plans/dazzling-questing-meerkat.md` and persisted to
`/Users/rhhart/Documents/GitHub/weft-dev/plans/2026-03-16-universal-taxonomy-lens-architecture-stereoscopic-validation.md`.

Key additions designed in this session:
- Universal signal taxonomy (8 → 12 signals)
- Lenses as first-class artifacts with interface contracts, UUIDs,
  inventory, evolution chains
- Multi-lens stereoscopic validation (informed by Chari et al. 2023,
  "The Specious Art of Single-Cell Genomics")
- Anaglyphic encoding on edges (`channels` field for frame-provenance)
- Adversarial cross-chapter agent (separate from standard cross-chapter
  analyst)
- Chesterton's fence analysis of every proposed schema change

---

## Key Design Decisions and Their Rationale

### 1. Topology vs. observation split

**Decision:** Separate domain graph (shared, versioned, learner-
independent) from learner state (per-learner observations).

**Why:** The domain's structure is a property of the domain, not of any
learner. Prerequisites between React concepts don't change because a
different person is learning them. Learner-specific data (scores, gaps,
bridges) is an overlay on shared topology.

**Source:** learning-model-research-plan.md § emerging synthesis

### 2. Knowing profiles use categorical weights, not numeric

**Decision:** Vervaeke's 4P types (propositional, procedural,
perspectival, participatory) with categorical weights (primary /
necessary / minor / negligible).

**Why:** Numeric precision is false precision for something inferred from
source materials. "Propositional: 0.7, procedural: 0.3" implies a
measurement that didn't happen. Categorical weights communicate the
relative importance without claiming measurement.

**Source:** deep-research-synthesis.md, learning-model-research-plan.md
§ Stein's metapsychology

### 3. Complexity range uses 0-5 scores, not MHC orders

**Decision:** `complexityRange: {min, max}` on the observable 0-5 scoring
scale, not theoretical MHC orders (1-16).

**Why:** The assessment resolution ceiling. The system can observe and
score learning behavior on a 0-5 scale. MHC orders are theoretically
correct but require Lectical Assessment System-grade instruments that
this system doesn't have. Score range is the observable proxy.

**Source:** learning-model-research-plan.md § orders of complexity

### 4. Three-value origin field (taught / used / assumed)

**Decision:** Each concept extracted by a chapter analyst gets an origin
classification.

**Why:** "Used" was the critical innovation. v1 had only taught/assumed
and couldn't detect cross-chapter dependencies. When a chapter's code
examples USE a concept taught elsewhere, that's a prerequisite edge —
but v1 couldn't see it because it didn't distinguish "used here" from
"taught here." The three-value origin feeds directly into the
cross-chapter analyst's resolution step.

**Source:** v1 → v2 evolution, domain-map-handoff.md diagnostic results

### 5. Implicit signal taxonomy (8 types, later extended to 12)

**Decision:** Classify structural dependency signals by type (co-
occurrence, sequencing, refactoring-chain, etc.).

**Why:** v1's mechanical extraction missed dependencies communicated
through pedagogical structure. The `react-props → destructuring-
assignment` edge was invisible to explicit-only extraction. The taxonomy
gives chapter analysts a vocabulary for reporting HOW they detected a
dependency, which feeds confidence scoring and enables cross-chapter
validation.

**Source:** v1 test failure, commit e456f33

### 6. Confidence levels for source-level validation only

**Decision:** `confirmed / inferred / hypothesized` on prerequisite
edges, with promotion rules tied to multi-source validation.

**Why:** Confidence tracks how well-established an edge is by source
evidence. "Hypothesized + second independent source confirming →
inferred. Inferred + human confirmation → confirmed." This was designed
for Phase 3 (cross-reference validation against multiple sources).

**Critical constraint:** Confidence must NOT be repurposed for frame-
level validation (multiple lenses on the same source). These are
epistemically different operations. See Chesterton's fence analysis in
the March 16 plan.

**Source:** domain-graph-schema.md § edge confidence definitions

### 7. Dynamic surmise relation (Q_hard + Q_bridge + Q_altitude)

**Decision:** Three typed sub-orders combine into a learner-specific
prerequisite graph.

**Why:** Not all prerequisites work the same way. Hard prerequisites are
universal domain topology. Bridge dependencies are learner-specific
accelerants (gated by complexity). Altitude dependencies are threshold
gates (downstream concepts only fully unlock when the threshold concept
is consolidated, not just scored). Conflating these loses information
that the query library needs for accurate fringe computation.

**Source:** deep-research-synthesis.md § dynamic surmise relation

### 8. Interaction matrix (2×3)

**Decision:** `{early, consolidated} × {conceptual, procedural, recall}`
→ practice mode recommendation.

**Why:** What counts as productive practice varies by both chunking state
and gap type. A conceptual gap in early chunking needs bridge-building
(structural analogy). The same gap in consolidated chunking needs
reframing (the learner has chunks but the wrong model). The matrix
encodes these distinctions compactly.

**Known gap:** No practice mode for "no gap, early chunking" — the most
common learner state. Open question #18 in the integration plan.

**Source:** deep-research-synthesis.md § practice progression, Thread 3

### 9. Assessment instrument mapping

**Decision:** 1:1 mapping: propositional→quiz, procedural→artifact
review, perspectival→conversation, participatory→self-report only.

**Why:** Each knowing type has a natural assessment instrument with
different observability. The system can directly assess propositional
(quiz answers are right or wrong) and procedural (artifacts demonstrate
capability). Perspectival requires engaged dialogue (partially
observable). Participatory can only be self-reported (not observable by
the system). This mapping respects Stein's constraint.

**Source:** domain-graph-schema.md § knowing profile,
learning-model-research-plan.md § Stein's metapsychology

### 10. Composition is bidirectional

**Decision:** `composedOf` and `composesInto` on ConceptNode, with an
invariant that if A.composedOf includes B, then B.composesInto includes
A.

**Why:** Traversal needs to go both directions. "What is this concept
made of?" (decomposition) and "What larger concepts does this feed
into?" (composition) are both valid queries. The invariant is enforced
by `loadDomainGraph()` in graph-queries.ts.

**Source:** dag-representation-research.md § bidirectional adjacency

---

## Branch and PR Status

All schema files live on the `hart/domain-graph-schema` branch (PR #15,
open, not merged to main as of March 16, 2026).

**What exists on the branch:**
- Complete TypeScript types (`domain-graph.ts`, `learner-state.ts`)
- Complete query library (`graph-queries.ts` — 476+ lines)
- Complete migration script (`migrate-observations.ts` — 509 lines)
- Complete reference and skill documentation
- No actual domain graphs yet (`domains/.gitkeep` only)

**What's needed before merge:** Eight-phase integration plan detailed in
`/Users/rhhart/Documents/GitHub/weft-dev/design/2026-03-07-domain-graph-integration-plan.md`.
Every downstream skill needs updating. 27 open questions need resolution.

---

## File Inventory

### Weft repo (on `hart/domain-graph-schema` branch)

| File | Lines | Purpose |
|------|-------|---------|
| `scripts/types/domain-graph.ts` | 77 | TypeScript source of truth for DomainGraph types |
| `scripts/types/learner-state.ts` | 57 | TypeScript source of truth for LearnerState types |
| `.claude/references/domain-graph-schema.md` | 286 | Agent-facing field documentation, knowing profiles, interaction matrix |
| `.claude/references/developmental-model.md` | 153 | Complexity/chunking model, dependency types |
| `docs/schema-guide.md` | 176 | Human-facing schema explanation |
| `.claude/skills/domain-map/SKILL.md` | ~395 | Six-phase extraction pipeline |
| `.claude/skills/domain-map/subagents.md` | ~403 | Chapter Analyst, Cross-Chapter Analyst, Graph Merger prompts |
| `.claude/skills/domain-update/SKILL.md` | 156 | Four-phase update/validation pipeline |
| `scripts/lib/graph-queries.ts` | ~552 | Outer fringe, priority, practice mode, coverage, surmise queries |
| `scripts/migrate-observations.ts` | 509 | Migration from current-state.md YAML to learner state JSON |
| `domains/.gitkeep` | 0 | Empty directory for domain graph output |

### Weft-dev repo (design documentation)

| File | Lines | Purpose |
|------|-------|---------|
| `research/learning-model-research-plan.md` | ~1148 | Foundational model research |
| `research/learning-dag-representations.md` | ~755 | ML/AI representation survey |
| `research/dag-representation-research.md` | ~697 | DAG schema and cross-domain research |
| `research/deep-research-synthesis.md` | ~665 | Second-round KST, causal DAG, practice research |
| `research/2026-03-06-learning-state-evolution.md` | 366 | Five-layer architecture brainstorm |
| `plans/2026-03-06-domain-graph-schema-learner-state-domain-map.md` | 763 | Complete schema specification |
| `plans/domain-map-handoff.md` | 193 | v1→v2 testing and validation |
| `plans/domain-map-v3-handoff.md` | 261 | v3 skill refinement |
| `design/2026-03-07-domain-graph-integration-plan.md` | 619 | Eight-phase integration plan, 27 open questions |

### Session archive references

| Document | Session ID | Stamped |
|----------|-----------|---------|
| Schema specification plan | 9ca28cf7-60ad-4653-8256-d41a43206447 | 2026-03-06T21:53:26Z |
| domain-map handoff | ce408b1e-1fd9-4d44-9db8-948bca3614ab | 2026-03-06T23:13:19Z |
| domain-map v3 handoff | (no matching session) | 2026-03-06T23:47:44Z |
| Integration plan | 6f8c0bf4-b2d0-42a1-bf51-f9959d13fca8 | 2026-03-14T14:00:40Z |
| Learning state evolution | 6f8c0bf4-b2d0-42a1-bf51-f9959d13fca8 | 2026-03-14T14:00:40Z |
