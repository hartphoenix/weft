---
name: handoff-test
description: >
  Naive reader handoff test. Audits the session's primary artifact(s) for
  self-containedness before context is lost. Use before compaction, /clear,
  or end-of-session. Identifies what the artifact assumes but doesn't say.
---

# Handoff Test

## The Naive Reader

A fresh Claude instance with no session history. Technically competent — can read the codebase, run code, check git history. Has access to standard tooling, CLAUDE.md, and memory files. But has seen nothing from this conversation: no decisions made, options rejected, constraints discovered, or terminology coined. The only things that exist for the naive reader are what's written in persistent artifacts.

The test: could that instance pick up the artifact and execute without asking clarifying questions?

## Process

1. Identify what was created or modified this session. Read each artifact in full.
2. From the naive reader perspective, find implicit dependencies:
   - Session-local terminology used without definition
   - References to "the bug," "the approach," "what we discussed" without grounding
   - Decisions recorded without rationale (a future reader needs *why* to know when the decision expires)
   - Scope assumed but not stated
   - Next steps that depend on conversation memory
3. Report gaps. For each: what's missing, where it goes, concrete suggested text. Offer to apply fixes.

If the artifact passes, say so in one sentence.
