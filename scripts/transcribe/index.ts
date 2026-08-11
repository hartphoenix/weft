#!/usr/bin/env bun
/**
 * /transcribe — unified transcription pipeline.
 *
 * Emits line-delimited JSON events (v:1) to stdout (with --emit jsonl/both)
 * and a sidecar ledger at ~/.config/weft/transcribe/jobs/<job_id>.jsonl.
 *
 * Usage:
 *   transcribe [paths...] [--dir <dir>] [--superwhisper [N]]
 *              [--thread <name>]
 *              [--diarize auto|on|off]
 *              [--backend auto|mlx-whisper|whisper-server]
 *              [--model <name>]
 *              [--emit human|jsonl|both]
 *              [--force]
 */

import { $ } from "bun";
import { existsSync, readdirSync } from "fs";
import { basename, extname, join, resolve } from "path";
import {
  Emitter,
  generateFileId,
  getCreationTimestamp,
  newJobId,
  recordingDate,
  resolveThreadsRoot,
  resolveVoiceMemoRoot,
  type FileDescriptor,
  type Mode,
  type OutputRef,
} from "./lib";
import {
  extractAudio,
  fileSize,
  isMedia,
  isVideo,
  probeDuration,
  splitAudio,
} from "./ffmpeg";
import {
  chooseBackend,
  concatChunks,
  type BackendChoice,
  type WhisperResult,
} from "./whisper";
import {
  assignSpeakers,
  autoDecideDiarization,
  diarizeAudio,
  probeDiarize,
  type DiarizeChoice,
} from "./diarize";
import { listRecent, toWhisperResult, type SuperwhisperRecording } from "./superwhisper";
import {
  readThreadParticipants,
  writeMeetingArtifacts,
  writeVoiceMemoArtifacts,
} from "./writers";
import { humanSink } from "./adapters/human";
import { jsonlSink } from "./adapters/jsonl";

// --- CLI parse ---

interface Args {
  paths: string[];
  dir?: string;
  superwhisper?: number;   // N recent
  thread?: string;
  diarize: DiarizeChoice;
  diarizeOnly: boolean;    // skip transcribe, load existing .json, add speaker labels
  backend: BackendChoice;
  model?: string;
  emit: "human" | "jsonl" | "both";
  force: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    paths: [],
    diarize: "auto",
    diarizeOnly: false,
    backend: "auto",
    emit: "human",
    force: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const peek = argv[i + 1];
    switch (a) {
      case "--dir":
        args.dir = peek; i++; break;
      case "--superwhisper":
        if (peek && /^\d+$/.test(peek)) { args.superwhisper = parseInt(peek, 10); i++; }
        else args.superwhisper = 1;
        break;
      case "--thread":
        args.thread = peek; i++; break;
      case "--diarize":
        args.diarize = (peek as DiarizeChoice) ?? "auto"; i++; break;
      case "--diarize-only":
        args.diarizeOnly = true;
        if (args.diarize === "auto") args.diarize = "on";
        break;
      case "--backend":
        args.backend = (peek as BackendChoice) ?? "auto"; i++; break;
      case "--model":
        args.model = peek; i++; break;
      case "--emit":
        args.emit = (peek as Args["emit"]) ?? "human"; i++; break;
      case "--force":
        args.force = true; break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
      default:
        if (a.startsWith("--")) {
          console.error(`unknown flag: ${a}`);
          process.exit(2);
        }
        args.paths.push(a);
    }
  }
  return args;
}

function printHelp() {
  console.log(
    `transcribe [paths...] [--dir <path>] [--superwhisper [N]]
           [--thread <name>]
           [--diarize auto|on|off] [--diarize-only]
           [--backend auto|mlx-whisper|whisper-server]
           [--model <name>]
           [--emit human|jsonl|both]
           [--force]`
  );
}

// --- Input resolution ---

function defaultScanDir(): string {
  return join(process.env.HOME ?? "", "Desktop/Transcribe");
}

function scanMedia(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => !f.startsWith("."))
    .map((f) => join(dir, f))
    .filter(isMedia);
}

interface InputItem {
  kind: "file" | "superwhisper";
  path: string;                      // audio or video path; for superwhisper, the output.wav
  superwhisper?: SuperwhisperRecording;
}

function resolveInputs(args: Args): { items: InputItem[]; mode: Mode } {
  if (args.superwhisper !== undefined) {
    const recs = listRecent(args.superwhisper);
    return {
      items: recs.map((r) => ({ kind: "superwhisper", path: r.audioPath, superwhisper: r })),
      mode: args.thread ? "meeting" : "superwhisper",
    };
  }
  let paths: string[];
  if (args.paths.length > 0) {
    paths = args.paths.map((p) => resolve(p));
  } else if (args.dir) {
    paths = scanMedia(resolve(args.dir));
  } else {
    paths = scanMedia(defaultScanDir());
  }
  const mode: Mode = args.thread ? "meeting" : "voice-memo";
  return { items: paths.map((p) => ({ kind: "file", path: p })), mode };
}

// --- Per-file orchestration ---

const CHUNK_THRESHOLD_SEC = 30 * 60;   // split files longer than 30 min
const CHUNK_SIZE_SEC = 20 * 60;        // 20-min chunks

async function processFile(opts: {
  item: InputItem;
  mode: Mode;
  fileId: string;
  descriptor: FileDescriptor;
  emitter: Emitter;
  args: Args;
  backend: import("./whisper").WhisperBackend;
  threadDir?: string;
  tmpDir: string;
}): Promise<{ outputs: OutputRef[]; elapsed: number }> {
  const started = Date.now();
  const { item, mode, fileId, emitter, args, tmpDir } = opts;
  emitter.emit({ type: "file_start", file_id: fileId });

  // ---- 1. Prepare audio path ----
  let audioPath = item.path;
  if (item.kind === "file" && isVideo(item.path)) {
    const timer = stage("extract_audio");
    audioPath = await extractAudio(item.path, tmpDir);
    endStage(timer);
  }

  // ---- 2. Transcribe (skip for superwhisper / --diarize-only) ----
  let result: WhisperResult;
  if (item.kind === "superwhisper" && item.superwhisper) {
    emitter.emit({
      type: "log",
      file_id: fileId,
      level: "info",
      message: "using superwhisper meta.json (no re-transcribe)",
    });
    result = toWhisperResult(item.superwhisper);
  } else if (args.diarizeOnly) {
    const existing = await findExistingTranscriptJson(item.path, mode, opts.threadDir);
    if (!existing) {
      throw new Error(
        "--diarize-only requires an existing <date>-<topic>.json transcript " +
        "next to where the output would be written. Run without --diarize-only first."
      );
    }
    const timer = stage("load_transcript");
    const raw = await Bun.file(existing).json();
    result = raw as WhisperResult;
    emitter.emit({
      type: "log",
      file_id: fileId,
      level: "info",
      message: `reusing transcript at ${existing} (skip re-transcribe)`,
    });
    endStage(timer);
  } else {
    // Decide chunking.
    const duration = opts.descriptor.duration_sec;
    let chunks: string[];
    let chunkDurations: number[];
    if (duration && duration > CHUNK_THRESHOLD_SEC) {
      const timer = stage("split_chunks");
      chunks = await splitAudio(audioPath, join(tmpDir, "chunks"), CHUNK_SIZE_SEC);
      chunkDurations = new Array(chunks.length).fill(CHUNK_SIZE_SEC);
      // last chunk's real duration (remainder) — probe to correct offsets
      if (chunks.length > 0) {
        const lastProbe = await probeDuration(chunks[chunks.length - 1]);
        if (lastProbe) chunkDurations[chunks.length - 1] = lastProbe;
      }
      endStage(timer);
    } else {
      chunks = [audioPath];
      chunkDurations = [duration ?? 0];
    }

    const needWords = mode === "meeting" && args.diarize !== "off";
    const backend = opts.backend;
    const chunkResults: WhisperResult[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const cr = await backend.transcribe(
        {
          audioPath: chunks[i],
          durationSec: chunkDurations[i],
          wantWords: needWords,
          model: args.model,
          chunkIndex: i,
          chunkTotal: chunks.length,
        },
        emitter,
        fileId
      );
      chunkResults.push(cr);
    }
    result = chunks.length === 1 ? chunkResults[0] : concatChunks(chunkResults, chunkDurations);
  }

  // ---- 3. Diarization ----
  if (mode === "meeting") {
    const decision = autoDecideDiarization(mode, opts.descriptor.duration_sec, args.diarize);
    emitter.emit({
      type: "log",
      file_id: fileId,
      level: "info",
      message: `diarize decision: ${decision.run ? "run" : "skip"} (${decision.reason})`,
    });
    if (decision.run) {
      const probe = await probeDiarize();
      if (probe) {
        emitter.emit({
          type: "log",
          file_id: fileId,
          level: "warn",
          message: `diarization skipped: ${probe.split("\n")[0]}`,
        });
      } else {
        try {
          const turns = await diarizeAudio(audioPath, emitter, fileId);
          result = assignSpeakers(result, turns);
        } catch (e: any) {
          emitter.emit({
            type: "log",
            file_id: fileId,
            level: "warn",
            message: `diarization failed, continuing without speaker labels: ${e.message}`,
          });
        }
      }
    }
  }

  // ---- 4. Write outputs ----
  const outputs = await writeOutputs({
    item,
    mode,
    fileId,
    result,
    descriptor: opts.descriptor,
    threadDir: opts.threadDir,
  });

  const elapsed = (Date.now() - started) / 1000;
  emitter.emit({
    type: "file_done",
    file_id: fileId,
    elapsed_sec: elapsed,
    outputs,
  });
  return { outputs, elapsed };

  // --- local helpers (closures over emitter + fileId) ---
  function stage(name: Parameters<typeof emitter.emit>[0] extends { stage: infer S } ? S : never) {
    const t = Date.now();
    emitter.emit({ type: "stage_start", file_id: fileId, stage: name as any });
    return { name, t };
  }
  function endStage(s: { name: any; t: number }) {
    emitter.emit({
      type: "stage_done",
      file_id: fileId,
      stage: s.name,
      elapsed_sec: (Date.now() - s.t) / 1000,
    });
  }
}

async function writeOutputs(opts: {
  item: InputItem;
  mode: Mode;
  fileId: string;
  result: WhisperResult;
  descriptor: FileDescriptor;
  threadDir?: string;
}): Promise<OutputRef[]> {
  const { item, mode, fileId, result, descriptor } = opts;

  if (mode === "meeting") {
    if (!opts.threadDir) throw new Error("meeting mode requires --thread");
    const date = await recordingDate(item.path);
    const topic = topicFromPath(item.path);
    const participants = readThreadParticipants(opts.threadDir);
    const diarized = result.segments.some((s) => (s as any).speaker);
    // Skill produces transcripts only. Summary shape (meeting notes,
    // monologue writeup, extract chunks, none at all) is a downstream
    // agent decision that depends on what the transcript actually is.
    return await writeMeetingArtifacts({
      threadDir: opts.threadDir,
      date,
      topic,
      originalPath: item.path,
      result,
      diarized,
      durationSec: descriptor.duration_sec,
      participants,
    });
  }

  // voice-memo or superwhisper
  const voiceMemoRoot = resolveVoiceMemoRoot();
  const inboxDir = join(voiceMemoRoot, "inbox");
  const archiveDir = join(voiceMemoRoot, "archive/audio");
  const creationTs =
    item.kind === "superwhisper" && item.superwhisper
      ? item.superwhisper.recordedAt.toISOString().replace(/\.\d{3}Z$/, "")
      : await getCreationTimestamp(item.path);
  return await writeVoiceMemoArtifacts({
    inboxDir,
    archiveDir,
    fileId,
    originalPath: item.path,
    creationTimestamp: creationTs,
    transcript: result.text,
    source: item.kind === "superwhisper" ? "superwhisper" : "whisper",
    audioPathOverride:
      item.kind === "superwhisper" && item.superwhisper
        ? item.superwhisper.folder
        : undefined,
    moveAudio: item.kind === "file",
  });
}

/**
 * For --diarize-only: locate the existing transcript .json that would have
 * been written by a prior run. Only supported in meeting mode with
 * --thread set — voice-memo outputs don't include speaker labels, so the
 * cheap-post-diarize path doesn't apply there.
 */
async function findExistingTranscriptJson(
  audioPath: string,
  mode: Mode,
  threadDir: string | undefined
): Promise<string | null> {
  if (mode !== "meeting" || !threadDir) return null;
  const date = await recordingDate(audioPath);
  const topic = topicFromPath(audioPath);
  const candidate = join(threadDir, `${date}-${topic}.json`);
  return existsSync(candidate) ? candidate : null;
}

function topicFromPath(path: string): string {
  let stem = basename(path, extname(path));
  // Strip a leading `YYYY-MM-DD-<hash4>-` prefix if the input is already
  // an archived voice-memo file — avoids `meeting-2026-04-10-2026-04-08-…`.
  stem = stem.replace(/^\d{4}-\d{2}-\d{2}-[0-9a-f]{4}-/, "");
  return stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

// --- Main ---

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { items, mode } = resolveInputs(args);

  if (items.length === 0) {
    console.error("no input files found");
    process.exit(1);
  }

  if (args.diarizeOnly && !args.thread) {
    console.error(
      "--diarize-only requires --thread <name> — the transcript to re-label lives in a thread directory"
    );
    process.exit(2);
  }

  const jobId = newJobId();
  const emitter = new Emitter(jobId);

  // Adapters
  if (args.emit === "human" || args.emit === "both") {
    emitter.addSink(humanSink(args.emit === "both" ? process.stderr : process.stdout));
  }
  if (args.emit === "jsonl" || args.emit === "both") {
    emitter.addSink(jsonlSink(process.stdout));
  }

  // Thread routing
  const threadDir = args.thread
    ? join(resolveThreadsRoot(), args.thread)
    : undefined;

  // Build FileDescriptors (for the initial job_start event)
  const tmpDir = join(
    process.env.TMPDIR ?? "/tmp",
    `transcribe-${jobId}`
  );
  const descriptors: FileDescriptor[] = [];
  for (const item of items) {
    const size = await fileSize(item.path);
    let duration: number | null = null;
    if (item.kind === "superwhisper" && item.superwhisper) {
      duration = item.superwhisper.durationSec;
    } else {
      duration = await probeDuration(item.path);
    }
    const date =
      item.kind === "superwhisper" && item.superwhisper
        ? item.superwhisper.recordedAt.toISOString().slice(0, 10)
        : await recordingDate(item.path);
    const fileId = generateFileId(date, basename(item.path));
    descriptors.push({
      file_id: fileId,
      path: item.path,
      size_bytes: size,
      duration_sec: duration,
    });
  }

  emitter.emit({ type: "job_start", mode, files: descriptors });

  // Pick backend once, share across files. superwhisper path skips transcription
  // entirely but we still resolve a backend so the log is consistent.
  let backend: import("./whisper").WhisperBackend;
  try {
    const picked = await chooseBackend(args.backend, { model: args.model });
    backend = picked.backend;
    if (picked.warning)
      emitter.emit({ type: "log", file_id: null, level: "warn", message: picked.warning });
    emitter.emit({
      type: "log",
      file_id: null,
      level: "info",
      message: `backend: ${backend.name}`,
    });
  } catch (e: any) {
    emitter.emit({ type: "log", file_id: null, level: "error", message: e.message });
    emitter.emit({
      type: "job_done",
      summary: { files_total: items.length, files_ok: 0, files_failed: items.length, elapsed_sec: 0 },
    });
    await emitter.close();
    process.exit(1);
  }

  let ok = 0;
  let failed = 0;
  const jobStarted = Date.now();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const descriptor = descriptors[i];
    try {
      await processFile({
        item,
        mode,
        fileId: descriptor.file_id,
        descriptor,
        emitter,
        args,
        backend,
        threadDir,
        tmpDir,
      });
      ok++;
    } catch (e: any) {
      failed++;
      emitter.emit({
        type: "file_error",
        file_id: descriptor.file_id,
        stage: null,
        message: e.message ?? String(e),
        recoverable: false,
      });
    }
  }

  emitter.emit({
    type: "job_done",
    summary: {
      files_total: items.length,
      files_ok: ok,
      files_failed: failed,
      elapsed_sec: (Date.now() - jobStarted) / 1000,
    },
  });
  await emitter.close();

  // Clean up tmp
  try {
    await $`rm -rf ${tmpDir}`.quiet();
  } catch {}
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
