# Anki Card Patterns

Learned preferences from skipped and edited cards. Read by the anki skill during card generation.

## Anti-patterns (cards that get skipped or edited)

- Cards that cover distinctions already implied by other cards in the set (e.g., "difference between X and Y" when individual cards for X and Y already exist)
- Cards for concepts the user feels confident on — don't force cards for everything
- Compound cards that bundle multiple sub-questions into one front

## Preferred style (learned from edits)

- Backs should be short — strip redundant sentences and anything already implied by the answer
- One core fact per back is enough; additional details belong on separate cards
- Generalize when possible (e.g., "weight matrix" → "matrix" when the concept isn't domain-specific)
- Front should ask one precise question
- GPT-2 specifics (768, 50257) are fine as examples but shouldn't be the focus
- No filler phrases like "This is why..." or "It computes all X, every time" — trust the reader
