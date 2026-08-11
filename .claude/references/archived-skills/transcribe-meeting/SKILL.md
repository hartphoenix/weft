---
name: transcribe-meeting
description: >
  Transcribe and summarize a meeting recording. Extracts audio from
  video if needed, transcribes via whisper-server (Metal GPU),
  optionally diarizes speakers, and writes a structured summary with
  action items to the target thread directory. Use when the user has
  a meeting recording to process.
---

# /transcribe-meeting

## Invocation

The user may provide a file path, or the recording may be inferable
from conversation context (e.g., "transcribe the latest Stage11
meeting" when there's an obvious file in `~/Desktop/Transcribe/`).
The target thread is usually clear from context too. Ask only when
genuinely ambiguous.

## Prerequisites

Read roger's CLAUDE.md `### Meeting transcription` section for tool
locations and model paths. That section is the canonical reference —
this skill describes the workflow, CLAUDE.md describes the tools.

## Process

### 1. Locate the recording and thread

- Find the recording. Check `~/Desktop/Transcribe/` for recent files
  if no path was given. Confirm it exists, get duration via ffmpeg.
- Determine the thread. If not specified, infer from who the meeting
  is with or what project it's about.
- Read the thread's `_thread.md` for participant names and project
  context. This informs speaker identification in the summary.

### 2. Extract audio (if video)

For .webm, .mp4, .mkv, .mov files:
```bash
ffmpeg -i <input> -vn -acodec pcm_s16le -ar 16000 -ac 1 <output.wav>
```

Write the .wav to `$TMPDIR` (intermediate, deleted after transcription).
For .m4a, .wav, .mp3 — skip extraction, use directly.

### 3. Start whisper-server (if not running)

```bash
curl -s http://127.0.0.1:8080/ >/dev/null 2>&1
```

If not running:
```bash
whisper-server -m ~/Applications/whisper.cpp/models/ggml-medium.en.bin \
  --convert --port 8080 &
```

Wait up to 30s for health check to pass. If it fails, tell the user
to start it manually (sandbox may block Metal — see ensemble thread's
Metal GPU crash diagnosis).

### 4. Transcribe

POST the audio to whisper-server:

```bash
curl -s http://127.0.0.1:8080/inference \
  -F file="@<audio-file>" \
  -F response_format="verbose_json" \
  -o "$TMPDIR/transcript.json"
```

`verbose_json` returns segments with timestamps. Parse the JSON to
extract segments with `start`, `end`, and `text` fields.

For files longer than whisper-server can handle in one request
(timeout after ~30 min of audio), split with ffmpeg first:
```bash
ffmpeg -i <input.wav> -t <seconds> -c copy chunk_N.wav
```

### 5. Diarize (optional)

**Skip diarization if:**
- The ensemble venv is not available
- There are only 2 speakers (identifiable from content)
- Speed matters more than speaker labels

**If diarizing:** use the ensemble venv via a Python script that runs
whisperx.align + pyannote DiarizationPipeline + assign_word_speakers.
The ensemble pipeline plan describes the four-stage process:
`threads/ensemble/2026-04-07-diarization-pipeline-plan.md`

MPS (Metal GPU for diarization) only works outside Claude's sandbox.
If running from Claude Code, either:
- Accept CPU fallback (~15-20 min for 35 min audio)
- Ask the user to run the diarization step via the .command trigger

### 6. Write transcript files

Write to `threads/<thread>/`:

**`meeting-YYYY-MM-DD-<topic>.srt`** — SRT format with timestamps.
If chunked, adjust timestamps by chunk offset before combining.

**`meeting-YYYY-MM-DD-<topic>.txt`** — Plain text, one line per
segment. If diarized, prefix each line with `[SPEAKER_XX]:`.

### 7. Write meeting summary

Read the full transcript. Read the thread's `_thread.md` for context
(participants, project state, open questions). Write:

**`meeting-YYYY-MM-DD-<topic>.md`** with this structure:

```markdown
# <Meeting Title>

**Date:** YYYY-MM-DD
**Participants:** <names>
**Duration:** <X minutes>
**Recording:** `<path to source file>`
**Transcript:** `<path to .txt file>`

## Key Discussion Topics

### 1. <Topic>
<Summary — what was discussed, what positions were taken>

## Decisions Made
- <decision and rationale>

## Action Items

| Who | What | When |
|-----|------|------|
| ... | ...  | ...  |

## Open Questions
- <question>
```

Identify speakers from content context (names, roles, what they're
talking about) even without diarization. The thread's `_thread.md`
lists participants and their roles.

### 8. Clean up

- Delete intermediate .wav files from $TMPDIR
- Do NOT delete the source recording — the user decides when

### 9. Report

Tell the user what was produced:
- Summary path
- Transcript path(s)
- Duration and number of segments
- Whether diarization was applied
- Any issues (truncation, unclear speakers, gaps)

## What this skill does NOT do

- Install missing tools. Check and report, don't install.
- Determine which thread a recording belongs to. The user specifies.
- Process voice memos. Those go through the voice-memo pipeline
  (`resources/voice-memos/inbox/` → `/extract` → `/route`).
- Push to git. The user decides when to commit meeting artifacts.
