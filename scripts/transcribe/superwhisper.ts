/**
 * Superwhisper recordings reader.
 *
 * Storage: ~/Documents/superwhisper/recordings/<unix-ts>/{output.wav, meta.json}
 * The meta.json contains a finished whisper transcript (result + segments)
 * and duration in milliseconds. We reuse it by default — no re-transcription.
 */

import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import type { WhisperResult } from "./whisper";

const RECORDINGS_DIR = join(
  process.env.HOME ?? "",
  "Documents/superwhisper/recordings"
);

export interface SuperwhisperRecording {
  folder: string;        // absolute path to the recording folder
  audioPath: string;     // absolute path to output.wav
  metaPath: string;      // absolute path to meta.json
  recordedAt: Date;
  durationSec: number;
  transcript: string;
  segments: Array<{ start: number; end: number; text: string }>;
  modelName?: string;
  modelKey?: string;
}

export function superwhisperDirExists(): boolean {
  try {
    return statSync(RECORDINGS_DIR).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Return the N most-recent recordings, newest first.
 * Folder names are Unix timestamps; we sort numerically descending.
 */
export function listRecent(n: number): SuperwhisperRecording[] {
  if (!superwhisperDirExists()) return [];
  const entries = readdirSync(RECORDINGS_DIR)
    .filter((f) => /^\d+$/.test(f))
    .map((f) => ({ name: f, ts: parseInt(f, 10) }))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, n);
  const out: SuperwhisperRecording[] = [];
  for (const e of entries) {
    const folder = join(RECORDINGS_DIR, e.name);
    const metaPath = join(folder, "meta.json");
    const audioPath = join(folder, "output.wav");
    try {
      const raw = JSON.parse(readFileSync(metaPath, "utf8"));
      const durationSec = (raw.duration ?? 0) / 1000;
      out.push({
        folder,
        audioPath,
        metaPath,
        recordedAt: new Date(raw.datetime ?? e.ts * 1000),
        durationSec,
        transcript: raw.result ?? raw.rawResult ?? "",
        segments: (raw.segments ?? []).map((s: any) => ({
          start: s.start ?? 0,
          end: s.end ?? 0,
          text: s.text ?? "",
        })),
        modelName: raw.modelName,
        modelKey: raw.modelKey,
      });
    } catch {
      // skip malformed folders
    }
  }
  return out;
}

/**
 * Build a WhisperResult from a superwhisper recording — no whisper pass
 * needed. Returned segments lack word-level timestamps; callers that need
 * words must re-transcribe (future --retranscribe flag).
 */
export function toWhisperResult(r: SuperwhisperRecording): WhisperResult {
  return {
    text: r.transcript,
    segments: r.segments.map((s, i) => ({
      id: i,
      start: s.start,
      end: s.end,
      text: s.text,
    })),
    backend: "whisper-server",   // placeholder — the transcript predates our pipeline
    model: r.modelKey ?? r.modelName ?? "superwhisper",
  };
}
