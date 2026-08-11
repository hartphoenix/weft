/**
 * /transcribe event contract (v1).
 *
 * Every stage in the pipeline emits line-delimited JSON events through a
 * single Emitter. Adapters (human, jsonl) consume the same stream. The
 * sidecar JSONL at ~/.config/weft/transcribe/jobs/<job_id>.jsonl is the
 * canonical ledger and the hook for future UIs (React, Slack, etc.).
 *
 * Schema v:1 — adapters must ignore events with unknown v.
 */

import { $ } from "bun";
import { createHash, randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { basename, extname, join } from "path";

// --- Config ---

export interface WeftConfig {
  learningRoot?: string;
  voiceMemoRoot?: string;
}

export function loadConfig(): WeftConfig {
  const configPath = join(process.env.HOME ?? "", ".config/weft/config.json");
  try {
    return JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    return {};
  }
}

export function resolveLearningRoot(config: WeftConfig = loadConfig()): string {
  return config.learningRoot ?? join(process.env.HOME ?? "", "Documents/GitHub/roger");
}

export function resolveVoiceMemoRoot(config: WeftConfig = loadConfig()): string {
  if (config.voiceMemoRoot) return config.voiceMemoRoot;
  return join(resolveLearningRoot(config), "resources/voice-memos");
}

export function resolveThreadsRoot(config: WeftConfig = loadConfig()): string {
  return join(resolveLearningRoot(config), "threads");
}

export function transcribeStateDir(): string {
  const dir = join(process.env.HOME ?? "", ".config/weft/transcribe/jobs");
  mkdirSync(dir, { recursive: true });
  return dir;
}

// --- IDs ---

export function newJobId(): string {
  return `tx-${randomUUID().slice(0, 8)}`;
}

/**
 * memo_id-compatible file_id: <YYYY-MM-DD>-<hash4>-<slug>.
 * Matches the existing scheme in scripts/transcribe.ts so ensemble
 * stays wire-compatible.
 */
export function generateFileId(creationDate: string, filename: string): string {
  const ext = extname(filename);
  const stem = basename(filename, ext);
  const hash = createHash("sha256").update(filename).digest("hex").slice(0, 4);
  const slug = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${creationDate}-${hash}-${slug}`;
}

export async function getCreationDate(filePath: string): Promise<string> {
  const r = await $`stat -f "%SB" -t "%Y-%m-%d" ${filePath}`.text();
  return r.trim();
}

export async function getCreationTimestamp(filePath: string): Promise<string> {
  const r = await $`stat -f "%SB" -t "%Y-%m-%dT%H:%M:%S" ${filePath}`.text();
  return r.trim();
}

/**
 * Best-effort recording date: prefer a leading `YYYY-MM-DD-<hash4>-` from
 * the filename (our memo_id convention — authoritative when present), else
 * fall back to filesystem creation date.
 *
 * Rationale: once a file is moved to archive/, its filesystem birth time
 * becomes the archive time, losing the original recording date. The
 * memo_id-stamped filename preserves it.
 */
export async function recordingDate(filePath: string): Promise<string> {
  const stem = basename(filePath, extname(filePath));
  const m = /^(\d{4}-\d{2}-\d{2})-[0-9a-f]{4}-/.exec(stem);
  if (m) return m[1];
  return await getCreationDate(filePath);
}

// --- Event types (v:1) ---

export type Mode = "voice-memo" | "meeting" | "superwhisper";

export type Stage =
  | "extract_audio"
  | "split_chunks"
  | "transcribe"
  | "load_transcript"
  | "diarize"
  | "align"
  | "summarize"
  | "write"
  | "archive";

export type OutputKind =
  | "transcript_txt"
  | "transcript_srt"
  | "transcript_json"
  | "summary_md"
  | "audio_archive"
  | "inbox_markdown";

export interface OutputRef {
  kind: OutputKind;
  path: string;
}

export interface FileDescriptor {
  file_id: string;
  path: string;
  size_bytes: number;
  duration_sec: number | null;
}

interface BaseEvent {
  v: 1;
  ts: string;
  job_id: string;
}

export type TranscribeEvent =
  | (BaseEvent & { type: "job_start"; mode: Mode; files: FileDescriptor[] })
  | (BaseEvent & { type: "file_start"; file_id: string })
  | (BaseEvent & { type: "stage_start"; file_id: string; stage: Stage })
  | (BaseEvent & {
      type: "stage_progress";
      file_id: string;
      stage: Stage;
      fraction?: number;
      eta_sec?: number;
      note?: string;
    })
  | (BaseEvent & {
      type: "stage_done";
      file_id: string;
      stage: Stage;
      elapsed_sec: number;
    })
  | (BaseEvent & {
      type: "file_done";
      file_id: string;
      elapsed_sec: number;
      outputs: OutputRef[];
    })
  | (BaseEvent & {
      type: "file_error";
      file_id: string;
      stage: Stage | null;
      message: string;
      recoverable: boolean;
    })
  | (BaseEvent & {
      type: "log";
      file_id: string | null;
      level: "info" | "warn" | "error";
      message: string;
    })
  | (BaseEvent & {
      type: "job_done";
      summary: {
        files_total: number;
        files_ok: number;
        files_failed: number;
        elapsed_sec: number;
      };
    });

// --- Emitter ---

export type EmitMode = "human" | "jsonl" | "both";

export interface AdapterSink {
  onEvent(ev: TranscribeEvent): void;
  onClose?(): void;
}

export class Emitter {
  readonly jobId: string;
  private sidecarPath: string;
  private sidecarFile: Bun.FileSink;
  private sinks: AdapterSink[] = [];

  constructor(jobId: string) {
    this.jobId = jobId;
    this.sidecarPath = join(transcribeStateDir(), `${jobId}.jsonl`);
    this.sidecarFile = Bun.file(this.sidecarPath).writer();
  }

  addSink(sink: AdapterSink) {
    this.sinks.push(sink);
  }

  sidecar(): string {
    return this.sidecarPath;
  }

  emit(ev: Omit<TranscribeEvent, "v" | "ts" | "job_id"> & { v?: 1 }) {
    const full = {
      v: 1 as const,
      ts: new Date().toISOString(),
      job_id: this.jobId,
      ...ev,
    } as TranscribeEvent;
    this.sidecarFile.write(JSON.stringify(full) + "\n");
    for (const sink of this.sinks) {
      try {
        sink.onEvent(full);
      } catch {
        // adapter failures must not break the pipeline
      }
    }
  }

  async close() {
    await this.sidecarFile.end();
    for (const sink of this.sinks) sink.onClose?.();
  }
}

// --- Stage timing helper ---

export class StageTimer {
  private started = Date.now();
  constructor(
    private emitter: Emitter,
    private fileId: string,
    private stage: Stage
  ) {
    this.emitter.emit({ type: "stage_start", file_id: fileId, stage });
  }

  progress(opts: { fraction?: number; eta_sec?: number; note?: string }) {
    this.emitter.emit({
      type: "stage_progress",
      file_id: this.fileId,
      stage: this.stage,
      ...opts,
    });
  }

  done() {
    const elapsed = (Date.now() - this.started) / 1000;
    this.emitter.emit({
      type: "stage_done",
      file_id: this.fileId,
      stage: this.stage,
      elapsed_sec: elapsed,
    });
    return elapsed;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function exists(path: string): boolean {
  return existsSync(path);
}
