---
name: extract
description: >
  Divides sprawling content (voice transcripts, plan catch basins, session
  extracts) into discrete, provenance-stamped chunks staged for /route.
  Use when raw material needs to be split into routable pieces.
---

# /extract

## Path resolution

Read `~/.config/weft/config.json`:
- `learningRoot` → `{learningRoot}/extract/` is the staging area
- `voiceMemoRoot` → `{voiceMemoRoot}/inbox/` for `--inbox` mode
  (falls back to `{learningRoot}/resources/voice-memos`)

All chunks go to `{learningRoot}/extract/` regardless of source
location. /route scans this directory.

## Input

File paths, or `--inbox` to process all `status: raw` transcripts
in `{voiceMemoRoot}/inbox/`.

Source types:
- **Voice transcripts:** `{voiceMemoRoot}/inbox/*.md` with `status: raw`
- **Plan catch basins:** any plan with a `## Catch basin` section
- **Session extracts:** readable text from `session-extract.ts`
- **Arbitrary files:** any markdown the user points to

## Process

For each source file:

1. **Read** the full file. Determine origin date (see below).

2. **Identify chunk boundaries.** A chunk is a **routable unit** —
   content that would go to the same destination. Cut where the
   destination changes, not where the topic shifts.

   - Prefer fewer, meatier chunks over many fragments. A chunk that
     tells a complete story beats three that each need the others.
   - **Self-containment test:** can a reader understand this chunk's
     *purpose* without reading any other chunk? If not, it needs
     more content or a better context line.
   - Keep material together when it forms a cascade (specific →
     general, problem → solution, example → principle). The
     progression is often the insight; splitting it loses the arc.
   - Single-topic sources → one chunk.

3. **Write one file per chunk** to `{learningRoot}/extract/`.
   Naming: `<source-id>--<chunk-N>--<slug>.md`

   ```yaml
   ---
   origin: <earliest date — when the idea was born>
   context: >
     <one sentence grounding this chunk in its source — what was
     being discussed, what prompted this idea. Resolve any anaphoric
     references ("this", "that", "the thing we discussed") so the
     chunk stands alone. Written by the agent, not verbatim.>
   extracted-from: <path to source file>
   extracted-at: <ISO timestamp>
   chunk: <N> of <total>
   follows: <previous chunk filename, omit for first>
   precedes: <next chunk filename, omit for last>
   title: <short descriptive title>
   type: <action-item | plan-seed | decision | question | reference | idea | fragment>
   ---

   <chunk content — verbatim from source, not rewritten>
   ```

4. **Classify** with a type hint (/route uses these but isn't bound):
   `action-item`, `plan-seed`, `decision`, `question`, `reference`,
   `idea`, `fragment`

5. **Mark the source** as extracted:
   - Frontmatter sources: add `status: extracted`, `chunks: N`,
     `extracted-at: <timestamp>`
   - No-frontmatter sources: append
     `<!-- extracted: <timestamp>, N chunks -->`

6. **Archive** voice transcripts: move from `inbox/` to
   `{voiceMemoRoot}/archive/transcripts/`. Other sources: leave in
   place (the status mark is sufficient).

7. **Report:** source file, chunk count, titles with types.

## Origin date

The `origin` field is the idea's birthday — the earliest meaningful
date. This is the primary date for human decision-making.

| Source type | Origin from |
|-------------|------------|
| Voice transcript | `recorded` field in frontmatter |
| Plan catch basin | Date-prefix in filename, or frontmatter date, or git |
| Session extract | Session date from manifest |
| Arbitrary file | Frontmatter date if present, else file birth time |

## Source ID derivation

| Source type | ID format |
|-------------|----------|
| Voice transcript | `id` field from frontmatter |
| Plan file | `<filename-without-ext>` |
| Session extract | `session-<date>-<first-4-of-uuid>` |
| Arbitrary | `<filename-without-ext>` |

## Chunk content is verbatim

Do not rewrite, summarize, or clean up. /extract finds the seams
and cuts. /route and the human decide what to do with the pieces.

## Sources with `status: minimal`

Voice transcripts flagged minimal (<20 words): present raw text,
ask user to classify (music, ambient, fragment, misfire). Update
status. Do not chunk.
