# Getting Started with Weft

You completed intake. Weft now has a model of how you learn. This lesson covers the tools that keep it accurate and working for you.

**You're reading a scaffold of this lesson** — adapted to your intake profile. The original is at `guides/getting-started.md` in your weft installation. You'll compare them in section 4.

---

## 1. Your learning state

Intake created three files in `learning/`:

- `goals.md` — where you're headed, stated as capabilities and aspirations
- `arcs.md` — the developmental lines you're working along
- `current-state.md` — scored concept inventory; single source of truth (0–5 scale)

**Action:** Read `learning/current-state.md`. Note the structure: arc names, concept names, scores.

Scores start rough. They update from evidence as you work. You don't maintain this file — the harness does.

**The win:** the harness keeps up with your learning so you're always working at your edge.

---

## 2. How context works

Each Claude conversation starts fresh. The context window is finite working memory — no persistence between sessions.

The harness stores your learning state in files so each session reads where you left off. Learning state lives in weft, not in any project — skills running across different repos all read the same model of you.

Context fills up over long sessions (large codebases, heavy tool use). The harness helps manage this — that's a later module. For now: know that `learning/` is durable and lives outside any single context window.

**The win:** reflecting on recent learning while it's fresh cements it in memory — session reviews make you *and* your harness more skillful, with less effort.

---

## 3. The core loop

**`/startwork`** — run at session start

- Reads: learning state, git status, active arcs
- Produces: prioritized session plan (continuation → deadline → unblocking → growth-edge → maintenance)
- Follow it or not — the value is the full picture ranked

**`/session-review`** — run at session end; the most important habit

- Scans recent Claude conversations since last review, extracting learning signals
- Quizzes 4–6 concepts targeted at current gaps
- Writes results to `learning/current-state.md`, logs the session

Low quiz scores → more exposure routed to that concept. Consistent high scores → drilling stops. Conversation analysis catches what the quiz misses: fluent concepts, patterns in where you got stuck, arc readiness signals.

**The win:** `/startwork` unfreezes you from the paralysis of choice; `/session-review` makes sure you keep all your gains.

---

## 4. External materials: `/lesson-scaffold`

**Action:** Open `guides/getting-started.md` (the raw original). Compare to what you're reading.

The original is a plain action-oriented outline. This scaffold was adapted to your intake profile — concepts your intake marked solid got compressed; growth-edge concepts got room.

`/lesson-scaffold` works on anything Claude can read:

```
/lesson-scaffold [URL or file path]
```

Pass it a course chapter, tutorial, documentation page, or blog post. Each time your learning state updates through session reviews, scaffolds of the same material would read differently — the model gets more precise.

**The win:** turn even the most barebones lesson plan into a walkable path that targets your specific needs.

---

## 5. Cross-session progress: `/progress-review`

Auto-dispatched by `/startwork` after several sessions — runs briefly before the session plan appears.

Detects patterns no single review can see:
- Stalled concepts (quizzed repeatedly, score not moving)
- Arcs ready to advance
- Goal drift

Proposes updates to your learning state. Nothing writes without your approval. Approve what's accurate; reject with a reason — the correction becomes evidence.

Manual trigger any time the model feels out of sync:

```
/progress-review
```

**The win:** even when you're locked in, weft works in the background to keep you attuned to your biggest goals.
