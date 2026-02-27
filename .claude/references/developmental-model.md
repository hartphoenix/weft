# Developmental Model

Reference for analyzing a learner's development. Consulted during
intake (background analysis, interview calibration), session review
(scoring context), and startwork (priority computation).

This is system knowledge — it does not change per user.

---

## Two development dimensions

Every skill develops along two semi-independent dimensions:

**Complexity level (top-down).** What order of abstraction the learner
can bring to bear. Higher complexity enables recognition of structural
isomorphisms across domains — the bridge phenomenon. A skill becomes
*functional* at one complexity level and *generative* (producing bridges
to other domains) at a higher level.

**Chunking depth (bottom-up).** How fluent the learner's domain-specific
pattern recognition is. Built through reps. Letters → words → sentences.
Individual chess positions → familiar configurations → whole game states.
useState calls → component patterns → architectural patterns. Chunking
binds frequently co-occurring patterns into single recognizable units.
This is what gives experts their "at a glance" quality.

These interact but don't substitute for each other:

| Complexity | Chunking | State | Move |
|---|---|---|---|
| High | Low | Correct shape, wrong boundary | Reps — bridge is built, chunks need to wire |
| Low | Low | Unfamiliar territory | Bridge first, then reps |
| Low | High | Learned the handshake | Fine as-is; invest complexity only if domain warrants it |
| High | High | Fluent and generative | Bridge-ready material for other domains |

The gap between complexity and chunking for a given skill is diagnostic:
it tells you whether the next move is reps or abstraction.

---

## Three dependency types

**Hard prerequisites.** X genuinely requires Y. Stable across learners.
Handled by ordering within a capability cluster.

**Bridge dependencies.** X is dramatically easier given Y from another
domain. Complexity-gated — visible only at a sufficient complexity
level. Learner-specific: these reflect the learner's topology, not the
curriculum's.

**Altitude dependencies.** Concepts meaningful only after enough reps to
feel the problem they solve. Not knowledge prerequisites — experiential
prerequisites. "Requires reps" rather than "requires concepts."

---

## The compounding engine

Bottom-up chunking builds raw material in each domain. Top-down bridging
connects domains by recognizing structural isomorphisms between chunks.
Bridges don't substitute for chunks — they scaffold faster chunking by
giving incoming patterns a place to land. As chunks mature, they become
bridge-ready material for the next domain.

At sufficient complexity, each new domain increases bridge density to all
existing domains. The rate of acquisition accelerates as the portfolio
grows.

**Implication for intake:** A learner's non-technical background is not
irrelevant — it is potential bridge material. Music, theatre, writing,
management, sports, crafts — all produce chunks that may bridge to
technical domains at sufficient complexity. Discover these domains and
note the complexity level, not just the technical skills.

---

## Ordering heuristic

When prioritizing what to learn next, five factors determine expected
impact:

1. **Breadth** — Does it improve one capability or many?
2. **Compounding** — Does the return grow over time or stay flat?
3. **Upstreamness** — How many downstream skills does it unblock?
4. **Time-to-value** — How quickly does the return start?
5. **Complexity-chunking gap** — Skills where complexity is high but
   chunking is low are highest ROI: the bridge is pre-built, only reps
   are needed.

Use this heuristic when:
- Analyzing background materials to identify high-value prior experience
- Calibrating interview questions toward high-leverage gaps
- Seeding initial current-state.md concept priorities
- Computing growth edges in startwork

---

## Skill entry structure

When tracking a specific skill in arcs or current-state, the following
dimensions capture its state:

- **Serves:** which goal and capability this skill develops
- **Complexity range:** functional at what level, generative at what level
- **Chunking state:** exposure → recognition → fluency → automaticity
- **Prerequisites:** hard, bridge (with complexity floor), altitude
- **Enables:** downstream skills and capabilities
- **Acquisition type:** concept-first or reps-first

Not every skill needs all fields. Use the minimum that captures the
diagnostic state — what the next move is.

---

## Applying this model

### During intake (background analysis)

When analyzing background materials, use this model to extract:
- What domains has the learner built chunks in? (code, writing, other)
- What complexity level do their artifacts suggest?
- Where are the complexity-chunking gaps? (bridge built but chunks
  missing, or chunks present but no bridging)
- What bridge dependencies might their background provide?

### During intake (interview)

Use the model to calibrate questions:
- Don't just ask "what do you know?" — ask about the *shape* of their
  knowledge. Can they explain why (complexity) or just execute how
  (chunking)?
- Prior domains matter. Ask about non-technical experience and note
  potential bridges.
- The hardest-problem-solved question reveals both complexity ceiling
  and chunking depth simultaneously.

### During session review

Use the model to classify gaps accurately:
- A wrong mental model is a complexity gap (conceptual).
- A right concept with wrong execution is a chunking gap (procedural).
- A forgotten procedure is a recall gap (needs reps).
- Score the shape of the model, not the precision of the words.

### During startwork

Use the ordering heuristic to prioritize the day's work:
- What has the highest combination of breadth, compounding, and
  upstreamness?
- Where is the complexity-chunking gap widest? (highest ROI targets)
- What altitude dependencies need more reps before the concept lands?
