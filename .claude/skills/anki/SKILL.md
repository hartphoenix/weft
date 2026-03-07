---
name: anki
description: Use when the user explicitly asks to "make an anki card", "create flashcards",
  "add to anki", invokes "/anki", OR when you recognize the user is struggling with
  a concept, asked a clarifying question that reveals a gap, just had an "aha" moment,
  or is working through something they'll need to recall later. Proactively suggest
  anki cards when learning is happening — don't wait to be asked.
---

# Anki Card Generator (Mochi Integration)

Create spaced repetition flashcards and push them to Mochi after user approval.

## Configuration

Read the config file at `.claude/anki.local.md` to get the Mochi API key and deck IDs. The YAML frontmatter contains:
- `mochi_api_key`: API key for Mochi
- `default_deck`: deck ID for Code (default)
- `decks`: map of topic → deck ID

Available decks: code, ai, design, product, eg_domain, crypto, philosophy, meditation, miscellaneous.

## When to Trigger Proactively

Suggest anki cards when you notice:
- The user asks "what does X mean?" or "why does X work that way?"
- The user hits a bug caused by a misunderstanding and then resolves it
- The user has an "oh" or "wait" moment — a concept just clicked
- The user is learning a new API, pattern, or mental model they'll need again
- A correction was made to the user's understanding

When triggering proactively, say something like:
> "This seems worth locking in. Want me to make anki cards for it?"

If the user says yes (or invoked `/anki` directly), generate the cards.

## Card Generation Rules

### 1. Atomicity — One concept per card
- Each card tests exactly ONE thing
- If you're tempted to put "and" in a card, split it into two
- Bad: "What is a closure and how does it capture variables?"
- Good: "What is a closure?" + separate card "How does a closure capture variables from its enclosing scope?"

### 2. Clarity — Precise, minimal language
- Front of card: a specific question, not a vague prompt
- Back of card: the shortest correct answer, then optionally a one-line example
- Bad front: "Tell me about useEffect"
- Good front: "When does a useEffect cleanup function run?"

### 3. Connections — Link concepts together
- Include cards that ask "how does X relate to Y?"
- Include cards that contrast similar concepts
- Example: "How does `useEffect` differ from `useLayoutEffect` in timing?"

### 4. Deep Understanding — Why and How over What
- Prioritize "why" and "how" questions over pure recall
- Include cards that test application, not just definition
- Example: "Why would you use a ref instead of state to store a value in React?"

## Card Types to Consider

For each concept, consider generating cards from multiple angles:

- **Definition**: "What is X?" (only if the definition is worth memorizing)
- **Mechanism**: "How does X work?" / "What happens when X?"
- **Reason**: "Why does X exist?" / "What problem does X solve?"
- **Contrast**: "How does X differ from Y?"
- **Application**: "When would you use X instead of Y?"
- **Gotcha**: "What's a common mistake when using X?"
- **Mental model**: "What's a good analogy for X?"

Not every concept needs all types. Use judgment — 2-5 cards per concept is typical.

## Workflow

### Step 1: Generate and Present Cards

For each card, present it like this:

```
**Card 1** [deck: code]
Front: When does a useEffect cleanup function run?
Back: Before the effect re-runs (on dependency change) and when the component unmounts.
Tags: react, hooks, useEffect
```

Choose the appropriate deck based on topic. Default to `code` for programming topics.

### Step 2: Walk Through Each Card

After presenting all cards, walk through them **one at a time** using `AskUserQuestion`. For each card, show the front/back in the question text and offer these options:

- **Yes, add it** — Push this card to Mochi as-is
- **Skip** — Don't add this card
- **Edit** — User wants to change the wording (pause, discuss, revise, then re-present)

Note: AskUserQuestion already provides a built-in "Chat about this" option — do NOT add a separate chat/discuss option.

If the user selects "Edit" or "Chat about this", have the conversation, revise the card if needed, then re-present it with `AskUserQuestion` before moving to the next card.

### Step 3: Create Approved Cards

After walking through all cards, batch-push all approved cards to Mochi in parallel.

**Read the API key and deck IDs from `.claude/anki.local.md` first.**

For each card, use curl to POST to the Mochi API:

```bash
curl -s -X POST https://app.mochi.cards/api/cards/ \
  -u "<mochi_api_key>:" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "<front>\n---\n<back>",
    "deck-id": "<deck_id>",
    "manual-tags": ["tag1", "tag2"]
  }'
```

Card content format for Mochi: the front and back are separated by `\n---\n` in the `content` field.

After creating each card, confirm success or report errors.

### Step 4: Summary

After all cards are created, give a short summary:
> "Added 3 cards to Code deck, 1 to AI deck."

## Guidelines

- Write for the user's current level. Don't over-explain things they already know.
- Use code snippets on the back of cards when they make the answer clearer.
- Keep tags consistent so cards can be grouped (e.g., `react, hooks, useEffect`).
- If the concept came from a specific mistake or debugging session, reference that context briefly on the back of the card — episodic memory strengthens retention.
- Don't generate cards for trivial facts. Focus on things that are easy to confuse, forget, or misapply.
