---
name: debugger
description: Guides debugging when something is broken or behaving unexpectedly. Collects full error context, prompts for hypotheses, identifies the error layer, and rescopes when stuck. Use when the user hits an error, shares a stack trace, or describes unexpected behavior. Teaches error-reading as a byproduct of fixing the problem.
---

# Debugger

Fix the bug. Teach error-reading along the way, not instead of fixing it.

## On Arrival

Two things are almost always missing. Get them before doing anything else:

1. **Full error text.** Users often summarize errors rather than paste them. Ask for the complete output — the line you need is usually the one they paraphrased away.
2. **Their hypothesis.** They usually have one and it's usually decent. Ask: "What do you think is happening?" This isn't Socratic — it's efficient. Their guess narrows the search space.

If both are already provided, skip straight to visibility check.

## Visibility First

Debugging fails not from lack of intelligence but lack of visibility. Before classifying the bug or proposing a fix, ask: **can I see enough to diagnose this?**

If the error text alone points to the answer → skip ahead to layer classification.

If it doesn't — the error is vague, the behavior is intermittent, or the cause could be several things — **instrument before guessing:**

- **Add targeted logging.** Don't fix yet. Add logging that tracks the data flow, state changes, or execution order around the failure. The user runs it, pastes the output back, and the cause becomes visible. One round of logs beats five rounds of guessing.
- **Request runtime evidence.** Console output, network responses, actual values of variables at the failure point. Whatever the user can see that Claude can't.

The pattern: make the invisible visible, then diagnose from evidence.

## Layer Classification

Every bug lives on a layer. Name the layer before proposing a fix — it prevents solutions aimed at the wrong altitude.

- **Syntax** — the code doesn't parse. Typos, missing brackets, wrong operators.
- **Logic** — the code runs but does the wrong thing. Off-by-one, wrong variable, flipped condition.
- **Runtime** — the code is correct but fails in execution. Type errors, null references, async timing.
- **Environment** — the code is correct but the setup is wrong. Wrong version, missing dependency, misconfigured path.
- **Integration** — each piece works alone but they fail together. API contract mismatch, state shape disagreement, event ordering.

State the layer in one sentence: "This is an environment problem — your Node version doesn't support optional chaining." Then fix it at that layer.

**For regressions** ("it was working yesterday"): use `git diff` or `git log` to find what changed. LLMs are strong at parsing diffs — the bug is usually in the delta.

## Rescoping

If the first fix doesn't land, or if the bug is fuzzy ("it just doesn't work"), rescope with one question at the right altitude:

- **Too zoomed in** (fixating on a line when the problem is architectural) → "What are you trying to accomplish with this whole block?"
- **Too zoomed out** (describing the goal when the problem is a typo) → "What's the exact error message on which line?"

One question. Not a sequence of questions. Rescope once, then act on the answer.

**For cascading bugs** (error points to the wrong file, multiple possible sources): map the dependency or call chain before proposing a fix. Trace what calls what, what depends on what. This prevents the try-fix-wrong-try-again loop.

## Error-Reading Byproduct

When the error message itself contains the answer — and the user missed it — point to the specific part that tells the story. One sentence, same move as Quick Reference's one-sentence flag:

"The key line is `Cannot read properties of undefined (reading 'map')` — that means the thing before `.map()` is `undefined`, so trace where it was supposed to get its value."

This teaches error-reading without stopping to teach. The fix is still the priority.

## When to Hand Off

- If debugging reveals a **design problem**, name it and suggest stepping back to think about architecture before continuing to debug.
- If the bug is actually a **concept gap** (the user doesn't understand why it's wrong, not just what's wrong), name the concept and explain it briefly.
- If it's a **plumbing problem** (wrong Node version, missing env var, broken path), fix it directly. No teaching frame for plumbing — just fix it.

## Anti-Patterns

Do not:
- Start fixing before you have the full error text
- Guess at fixes without visibility into the runtime behavior
- Turn debugging into a teaching session (the fix comes first; learning is incidental)
- Ask a cascade of diagnostic questions — one rescoping question at a time
- Propose solutions at the wrong layer (environment fix for a logic bug, etc.)
