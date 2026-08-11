/**
 * Diarization: pyannote.audio via the ensemble venv, with speaker assignment
 * onto whisper segments/words.
 *
 * mlx-whisper already produces word timestamps, so the whisperx.align stage
 * is skipped. We just run pyannote to get speaker turns and match them to
 * whisper's word/segment spans.
 *
 * MPS (Metal GPU) is blocked by Seatbelt when run from Claude Code. When
 * available, pyannote uses MPS automatically. When not, it falls back to
 * CPU — we log the fallback rather than failing.
 *
 * Model: pyannote/speaker-diarization-community-1 — the community-licensed
 * successor to 3.1. Ungated (no HF token required) and already cached
 * locally under ~/.cache/huggingface/hub/. Override with PYANNOTE_MODEL.
 */

const PYANNOTE_MODEL =
  process.env.PYANNOTE_MODEL ?? "pyannote/speaker-diarization-community-1";

import { $ } from "bun";
import { existsSync } from "fs";
import { join } from "path";
import { Emitter, StageTimer, type Mode } from "./lib";
import type { WhisperResult, WhisperSegment } from "./whisper";

const ENSEMBLE_VENV_PYTHON = join(
  process.env.HOME ?? "",
  "Documents/GitHub/ensemble/.venv/bin/python"
);

export type DiarizeChoice = "auto" | "on" | "off";

export interface DiarizeDecision {
  run: boolean;
  reason: string;
}

/**
 * Heuristic for auto-detect. Override with --diarize on|off.
 * - voice-memo / superwhisper: single-speaker by design, off.
 * - meeting < 5 min: too short to justify the cost, off.
 * - meeting >= 5 min: on.
 */
export function autoDecideDiarization(
  mode: Mode,
  durationSec: number | null,
  choice: DiarizeChoice
): DiarizeDecision {
  if (choice === "on") return { run: true, reason: "forced on" };
  if (choice === "off") return { run: false, reason: "forced off" };
  if (mode !== "meeting")
    return { run: false, reason: `mode=${mode} (single-speaker)` };
  if (durationSec !== null && durationSec < 300)
    return { run: false, reason: `duration ${durationSec.toFixed(0)}s < 300s` };
  return { run: true, reason: "meeting ≥ 5 min" };
}

export interface SpeakerTurn {
  start: number;
  end: number;
  speaker: string;
}

/**
 * Check whether diarization dependencies are reachable.
 * Returns null on ready, error string otherwise.
 */
export async function probeDiarize(): Promise<string | null> {
  if (!existsSync(ENSEMBLE_VENV_PYTHON)) {
    return `ensemble venv missing at ${ENSEMBLE_VENV_PYTHON}`;
  }
  try {
    await $`${ENSEMBLE_VENV_PYTHON} -c "from pyannote.audio import Pipeline"`.quiet();
  } catch {
    return "pyannote.audio not importable in ensemble venv";
  }
  // community-1 is ungated — no token required. If a user overrides with a
  // gated model via PYANNOTE_MODEL, missing auth will surface at runtime
  // rather than in this probe.
  return null;
}

/**
 * Run pyannote on the given audio. Returns speaker turns sorted by start.
 */
export async function diarizeAudio(
  audioPath: string,
  emitter: Emitter,
  fileId: string
): Promise<SpeakerTurn[]> {
  const timer = new StageTimer(emitter, fileId, "diarize");
  timer.progress({ note: "loading pipeline" });

  const token = process.env.HF_TOKEN ?? process.env.HUGGINGFACE_TOKEN ?? "";
  const script = makeDiarizeScript(audioPath, PYANNOTE_MODEL);

  const proc = Bun.spawn(
    [ENSEMBLE_VENV_PYTHON, "-c", script],
    {
      stdout: "pipe",
      stderr: "pipe",
      // Pass token through when set; community-1 doesn't need one but
      // respecting the env makes custom gated models work without fuss.
      env: { ...process.env, HF_TOKEN: token, HUGGINGFACE_TOKEN: token },
    }
  );
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    throw new Error(`pyannote exit ${code}: ${err.slice(0, 500)}`);
  }
  const turns: SpeakerTurn[] = JSON.parse(out).turns;
  timer.progress({ fraction: 1, note: `${turns.length} turns` });
  timer.done();
  return turns.sort((a, b) => a.start - b.start);
}

function makeDiarizeScript(audioPath: string, model: string): string {
  const audio = audioPath.replace(/'/g, "\\'");
  const mdl = model.replace(/'/g, "\\'");
  return [
    "import os, json, sys",
    "import torch",
    "from pyannote.audio import Pipeline",
    "token = os.environ.get('HF_TOKEN') or os.environ.get('HUGGINGFACE_TOKEN') or None",
    `pipeline = Pipeline.from_pretrained('${mdl}', use_auth_token=token)`,
    "if torch.backends.mps.is_available():",
    "    pipeline.to(torch.device('mps'))",
    `diar = pipeline('${audio}')`,
    "turns = [{'start': float(t.start), 'end': float(t.end), 'speaker': str(s)} ",
    "         for t, _, s in diar.itertracks(yield_label=True)]",
    "sys.stdout.write(json.dumps({'turns': turns}))",
  ].join("\n");
}

/**
 * Assign a speaker label to each segment (and each word, if present) by
 * finding the turn with maximum temporal overlap.
 */
export function assignSpeakers(
  result: WhisperResult,
  turns: SpeakerTurn[]
): WhisperResult {
  if (turns.length === 0) return result;
  const segments: WhisperSegment[] = result.segments.map((seg) => {
    const speaker = dominantSpeaker(seg.start, seg.end, turns);
    const words = seg.words?.map((w) => ({
      ...w,
      // @ts-expect-error — extended field
      speaker: dominantSpeaker(w.start, w.end, turns),
    }));
    return {
      ...seg,
      words,
      // @ts-expect-error — extended field
      speaker,
    };
  });
  return { ...result, segments };
}

function dominantSpeaker(
  start: number,
  end: number,
  turns: SpeakerTurn[]
): string {
  let best = "";
  let bestOverlap = 0;
  for (const t of turns) {
    const overlap = Math.max(0, Math.min(end, t.end) - Math.max(start, t.start));
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = t.speaker;
    }
  }
  return best;
}
