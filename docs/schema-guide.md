# Schema Guide

A plain-language companion to the domain graph and learner state schemas.
For the full technical reference, see
`.claude/references/domain-graph-schema.md` and the TypeScript types in
`scripts/types/`.

---

## What is a domain graph?

A map of a learning territory. Concepts are the landmarks; prerequisite
edges are the paths between them; arcs group related concepts into
coherent storylines. The graph describes the domain, not the learner.

A domain graph for "web development" contains concepts like "HTTP
request lifecycle," "component state," and "database indexing" — with
edges saying which concepts you need before others make sense. It
doesn't say anything about how well *you* know these things. That's
what learner state is for.

Domain graphs are shareable. Two learners studying the same curriculum
use the same domain graph but have separate learner states.

---

## What is learner state?

Your position on the map. Scores record how well you know each concept.
Gap types say what kind of practice would help. The state is always a
working hypothesis — it updates every time new evidence comes in.

Learner state tracks:
- **Scores** (0-5) for each concept you've been assessed on
- **Gap types** — whether you're missing the mental model (conceptual),
  the execution (procedural), or the recall (recall)
- **Assessment history** — every time you were scored, by what method,
  with what evidence
- **Bridges** — hypotheses about where your experience in one area
  might accelerate learning in another
- **Goals** — what you're working toward, in priority order

---

## How they connect

The domain graph and learner state share concept IDs. The graph says
"concept X requires concept Y at level 3." The state says "you're at
level 4 on Y and level 2 on X." Together they compute what's ready to
learn next.

This separation means:
- The domain graph can be updated (new concepts added, edges refined)
  without touching your scores
- Your scores can be updated (new quiz results, session reviews)
  without changing the domain map
- When the domain graph does change, the system detects the version
  mismatch and handles migration

---

## Key fields explained

### Complexity range

The score window where a concept goes from "I can use this" to "I can
teach this and see it in other domains." A concept with
`complexityRange: {min: 2, max: 5}` becomes functional at score 2
(you can work with it) and generative at score 5 (you can teach it and
recognize its patterns in other domains).

Not every concept has the same range. Some are binary (you either know
the syntax or you don't — range 1-2). Others have deep generative
potential (architecture patterns — range 2-5).

### Knowing profile

What kind of knowing the domain demands for each concept. Based on
Vervaeke's four types:

- **Propositional** — facts you can state ("Arrays are zero-indexed")
- **Procedural** — procedures you can execute ("Write a map callback")
- **Perspectival** — perspectives you can take ("See the code from a
  reviewer's viewpoint")
- **Participatory** — practices you participate in ("Pair programming
  dynamics")

Each concept labels these as primary, necessary, minor, or negligible.
A concept like `Array.map()` is primarily procedural — you need to
write it. A concept like "code review" is primarily perspectival — you
need to see code from the reader's perspective.

This matters because different knowing types need different assessment
methods. You can quiz propositional knowledge, review artifacts for
procedural knowledge, but participatory knowledge can only be
self-reported.

### Threshold concepts

Doorway concepts that change how you see everything downstream once you
cross them. "Closures" in JavaScript is a threshold concept — once it
clicks, callbacks, React hooks, and module patterns all reorganize in
your understanding.

Threshold concepts are marked in the domain graph so the system knows
to treat them specially: they gate downstream concepts not just by
score but by whether you've truly consolidated the understanding
(not just passed a quiz).

### Bridges

Hypotheses about where your experience in one area might accelerate
learning in another. If you have deep experience in theater directing,
that might bridge to multi-agent orchestration — both involve directing
independent actors with sealed instructions toward a shared outcome.

Bridges are learner-specific (they depend on your background) and
status-tracked: hypothesized → tested → confirmed or disconfirmed.
Confirmed bridges influence what the system recommends you learn next.

### Domain flux

How fast the domain itself changes. Mathematics is stable — the core
knowledge changes on decade timescales. Web framework APIs are rapid —
significant changes happen monthly. This affects how aggressively the
system ages information that hasn't been recently validated.

---

## Reading the output

### Domain graph JSON

The top-level structure:

```
{
  "meta": { id, version, name, sources, fluxRate, ... },
  "concepts": {
    "concept-slug": { name, type, arc, complexityRange, knowingProfile, ... },
    ...
  },
  "relations": [
    { from: "dependent-concept", to: "prerequisite-concept", minLevel: 3, ... },
    ...
  ],
  "arcs": {
    "arc-slug": { name, description, outcomes, ... },
    ...
  }
}
```

- **concepts** is a dictionary keyed by concept ID (slug form)
- **relations** is a flat list of prerequisite edges
- **arcs** groups concepts into coherent learning storylines

### Learner state JSON

```
{
  "meta": { learnerId, domainGraphId, domainGraphVersion, ... },
  "observations": {
    "concept-slug": { score, gap, chunkingState, assessments: [...], ... },
    ...
  },
  "bridges": [ { from, to, status, ... }, ... ],
  "goals": [ { id, name, priority, status, ... }, ... ]
}
```

- **observations** is keyed by the same concept IDs as the domain graph
- Only assessed concepts appear — absence means unassessed
- **assessments** array preserves the full scoring history, newest first

This guide will expand as visualization tooling is added.
