---
name: transcribe
description: >
  Transcribe one or more audio/video files into voice-memo inbox entries or
  thread-routed transcripts. Emits a line-delimited JSON event stream
  (schema v:1) so progress adapters can render in any surface — terminal
  today, React/Slack later. Accepts Superwhisper recent recordings via
  `--superwhisper N`. After transcription, the agent reads the `.txt`,
  classifies content type, and optionally runs diarization + a
  content-shaped summary. Uses mlx-whisper on Metal by default with
  whisper-server as fallback.
---

# /transcribe

Two-phase workflow. **Phase 1** runs a shell pipeline that produces
transcript artifacts. **Phase 2** is work the agent MUST do after Phase 1:
read the `.txt`, classify what kind of recording this is, and act on it
(diarize, summarize, route to a thread, ask the user). Reporting "done"
after Phase 1 alone is wrong — the skill is not complete until Phase 2
runs.

The skill does not generate summaries itself, and the pipeline cannot
tell a meeting from a monologue from ambient noise without reading
content. That's the agent's job.

## Phase 1 — Run the pipeline

```
transcribe.sh <inputs> [flags]
```

**Invoke by basename (`transcribe.sh`), not by absolute path.** The
`excludedCommands: ["transcribe.sh:*"]` entry matches the first token of
the command, which must be the bare name — resolved via PATH through
`~/.local/bin/transcribe.sh` (symlinked to the script). Invoking
`~/Documents/GitHub/weft/scripts/transcribe.sh ...` or `bash transcribe.sh
...` instead leaves the command inside the sandbox, and Python crashes on
Metal init during mlx-whisper's `transcribe()` call.

### Flags

```
[paths...]                       explicit file paths
--dir <path>                     scan a directory for audio/video
--superwhisper [N=1]             latest N Superwhisper recordings
--thread <name>                  route outputs to roger/threads/<name>/
--diarize auto|on|off            default auto — off unless agent requests
--diarize-only                   skip transcribe, load existing .json, add speaker labels
--backend auto|mlx-whisper|whisper-server
--model <name>                   override backend default
--emit human|jsonl|both          default human
--force                          bypass dedup
```

### Input resolution (priority order)

1. Explicit `paths...`.
2. `--dir <path>` → scan for media (m4a/mp3/wav/mp4/webm/mkv/mov).
3. `--superwhisper [N]` → latest N recordings from
   `~/Documents/superwhisper/recordings/`. Meta.json transcripts are reused;
   no re-transcription unless `--force` is added later (deferred).
4. No args → default to `~/Desktop/Transcribe/`.

### Output routing

- **`--thread <name>` present** → writes `roger/threads/<name>/<date>-<topic>.{srt,txt,json}`.
  Date comes from the filename when it's in archived form
  (`YYYY-MM-DD-<hash>-<slug>`), else filesystem birth date.
  `<topic>` slugs the input filename with any leading archived-memo
  prefix stripped so the date doesn't double.
- **No `--thread`** → writes to `{voiceMemoRoot}/inbox/` using the
  existing voice-memo frontmatter so `/extract --inbox` sees it. Audio
  moves to `archive/audio/`.
- **`--superwhisper` + no `--thread`** → inbox with `source: superwhisper`.

### Backends

mlx-whisper is the default (one pass, Metal, native word timestamps).
Ensemble venv at `~/Documents/GitHub/ensemble/.venv/`. Install once:

```
uv pip install --python ~/Documents/GitHub/ensemble/.venv/bin/python mlx-whisper
```

Fallback: whisper-server at `localhost:8080`, model `ggml-medium.en`.
Auto-selected when mlx-whisper isn't importable.

## Phase 2 — Required agent follow-up

After Phase 1 completes, **always** do the following before reporting
back to the user. Reporting "done" after Phase 1 alone is a
half-finished skill invocation.

1. **Locate the `.txt`** produced by Phase 1 (path was in the
   `file_done` event's `outputs` array, or tail the sidecar JSONL at
   `~/.config/weft/transcribe/jobs/<job_id>.jsonl`).
2. **Read it.** Sample generously — first ~200 lines and last ~100 at
   minimum. For longer transcripts, scan the middle too.
3. **Classify** (see next section).
4. **Act** on the classification (diarize, summarize, route, ask).

### Classification

Read the `.txt`. Ask:

1. **Multiple speakers interacting?** (Q&A, turn-taking, responding
   to each other's points) → **meeting-like**. Action: run diarization
   if not already done, then write a meeting summary.
2. **One voice, sustained exposition / thinking aloud / reading?** →
   **monologue**. Action: optionally write an extract-style chunk
   outline, or defer to `/extract <path>` which can process the `.txt`
   into routable chunks.
3. **Ambient / noise / empty?** → flag to user, no summary.
4. **Music / hallucinated lyrics?** → flag to user, no summary.

### If meeting-like

**Decide the thread destination.** Options in priority order:

1. User passed `--thread <name>` at invocation → use it.
2. The transcript names a known thread topic (projects, recurring
   collaborators) and your judgment is clear → propose to user and
   write after confirmation. Never route silently.
3. Unclear → ask the user which thread.

**Move the transcript to the thread if Phase 1 landed it in the inbox.**
If `--thread` wasn't passed, Phase 1 wrote to `{voiceMemoRoot}/inbox/`
as a voice memo. For a meeting, re-invoke Phase 1 with `--thread <name>`
so the outputs live in `roger/threads/<name>/<date>-<topic>.{srt,txt,json}`
with the right naming. The first inbox output should be removed
afterward (ask before deleting).

**Add speaker labels.** Once transcripts are in the thread dir, run:

```
transcribe.sh <audio> --thread <name> --diarize-only
```

`--diarize-only` skips re-transcription and just runs pyannote +
speaker assignment (~1-3 min). The `.srt`/`.txt`/`.json` get overwritten
with speaker labels attached.

Skip diarization entirely when the user explicitly passed `--diarize off`
at invocation.

### Meeting summary

When the recording is meeting-like, write
`roger/threads/<name>/<date>-<topic>.md` with this shape:

```markdown
# <Title> — <date>

**Participants:** <names>
**Duration:** <X minutes>
**Recording:** `<path>`
**Transcript:** `<path to .txt>`

## Key Discussion Topics
### 1. <Topic>
<summary>

## Decisions Made
- <decision>

## Action Items
| Who | What | When |
|-----|------|------|
| ... | ...  | ...  |

## Open Questions
- <question>
```

Pull participants from the thread's `_thread.md` when possible;
refine based on what the transcript reveals. Use speaker IDs from
diarization when participant mapping is ambiguous.

### Where the summary goes

- User passed `--thread X` → write to `roger/threads/X/`.
- User didn't pass `--thread` but the content clearly belongs to a
  known thread (mentions project, people, specific work), propose the
  thread to the user before writing.
- Unclear destination → ask the user. Don't guess.

### Non-meeting outputs

For monologues, philosophical recordings, specimen material: don't
auto-generate a meeting-shaped summary. Offer to run `/extract
<path>` on the `.txt` to create routable chunks, or write a
content-appropriate writeup if the user requests one.

## The event contract (v:1)

Every run emits line-delimited JSON events through two channels:

- stdout when `--emit jsonl` or `--emit both` (both puts jsonl on stdout
  and the human renderer on stderr).
- A sidecar ledger at
  `~/.config/weft/transcribe/jobs/<job_id>.jsonl`, always. This is the
  integration point for future UIs — tail the file.

Event types: `job_start`, `file_start`, `stage_start`, `stage_progress`,
`stage_done`, `file_done`, `file_error`, `log`, `job_done`. All carry
`v:1`, `ts`, `job_id`; file events carry `file_id`; stage events carry
`stage`. Schema lives in `scripts/transcribe/lib.ts`.

## Diarization details

Default `--diarize auto`. In auto mode, Phase 1 leaves diarization OFF
unless explicitly requested — agent-level classification decides whether
to re-run with `--diarize on`. Heuristics: short recordings and
single-speaker inputs skip it; multi-speaker meetings opt in.

Forced via `--diarize on|off`. When diarization is requested but pyannote
or MPS is unavailable, the pipeline logs a warning and writes a
non-diarized transcript — it does not fail the job.

Model: `pyannote/speaker-diarization-community-1` (ungated, no HF token
needed). Already cached in `~/.cache/huggingface/hub/`. Override with
`PYANNOTE_MODEL=<repo>` (set `HF_TOKEN` too if gated).

## What the skill does NOT do

- **Summarize.** Content shape drives summary shape. Agent decides.
- **Auto-copy to extract staging.** Thread-routed recordings stay in
  the thread dir; `/extract <path>` is the explicit bridge.
- **Install mlx-whisper or pyannote.** Check, report, don't install.
- **Start whisper-server.** Surface the start command and exit rather
  than spawning background processes.
