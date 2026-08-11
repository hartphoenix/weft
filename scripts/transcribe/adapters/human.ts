/**
 * Human-readable adapter.
 *
 * Always overwrites the current line with `\r\x1b[K` on progress events so
 * one file renders as a single live-updating line. The explicit `--emit
 * human` choice means "watch this live" — we do not bifurcate on
 * `stream.isTTY`, which can detect wrong through bash → bun chains and
 * degrade the experience. Adapters that need plain lines consume jsonl.
 *
 * Output columns: `fileId  path  size duration elapsed ETA  stage note`.
 */

import { basename } from "path";
import type { AdapterSink, FileDescriptor, TranscribeEvent } from "../lib";

interface FileState {
  fileId: string;
  path: string;
  size_bytes: number;
  duration_sec: number | null;
  startedAt: number;
  currentStage: string;
  currentFraction?: number;
  currentEta?: number;
  currentNote?: string;
  lastPrintAt: number;
  done: boolean;
  error?: string;
  outputKinds: string[];
}

export function humanSink(
  stream: NodeJS.WriteStream = process.stderr
): AdapterSink {
  const state = new Map<string, FileState>();
  let lineOpen = false;   // true when the current line has an unterminated write

  /** In-place rewrite (no newline). Use for progress ticks that supersede. */
  function rewriteLine(s: string) {
    stream.write("\r\x1b[K" + s);
    lineOpen = true;
  }

  /** Commit the current line (newline) and start a new append line. */
  function commitLine(s: string) {
    if (lineOpen) stream.write("\n");
    stream.write(s + "\n");
    lineOpen = false;
  }

  /** Close any pending in-place line before the next distinct message. */
  function closeLine() {
    if (lineOpen) {
      stream.write("\n");
      lineOpen = false;
    }
  }

  function renderProgressLine(f: FileState): string {
    const size = formatBytes(f.size_bytes);
    const dur = f.duration_sec !== null ? formatDuration(f.duration_sec) : "?";
    const elapsed = formatDuration((Date.now() - f.startedAt) / 1000);
    const eta = f.currentEta !== undefined ? formatDuration(f.currentEta) : "?";
    const pct = f.currentFraction !== undefined
      ? `${Math.round(f.currentFraction * 100)}%`
      : "—";
    const note = f.currentNote ? ` · ${f.currentNote}` : "";
    return `[${f.fileId}] ${basename(f.path)}  ${size} · ${dur}  ${pct}  elapsed ${elapsed} · ETA ${eta}  ${f.currentStage}${note}`;
  }

  function handleEvent(ev: TranscribeEvent) {
    switch (ev.type) {
      case "job_start": {
        const n = ev.files.length;
        const totalDur = ev.files.reduce(
          (s, f) => s + (f.duration_sec ?? 0),
          0
        );
        commitLine(
          `job ${ev.job_id}  mode=${ev.mode}  ${n} file${n === 1 ? "" : "s"}  total ${formatDuration(totalDur)}`
        );
        for (const fd of ev.files) initFile(state, fd);
        return;
      }
      case "file_start": {
        const f = state.get(ev.file_id);
        if (!f) return;
        f.startedAt = Date.now();
        f.currentStage = "start";
        rewriteLine(renderProgressLine(f));
        return;
      }
      case "stage_start": {
        const f = state.get(ev.file_id);
        if (!f) return;
        f.currentStage = ev.stage;
        f.currentFraction = undefined;
        f.currentEta = undefined;
        f.currentNote = undefined;
        rewriteLine(renderProgressLine(f));
        return;
      }
      case "stage_progress": {
        const f = state.get(ev.file_id);
        if (!f) return;
        f.currentFraction = ev.fraction;
        f.currentEta = ev.eta_sec;
        f.currentNote = ev.note;
        rewriteLine(renderProgressLine(f));
        return;
      }
      case "stage_done": {
        const f = state.get(ev.file_id);
        if (!f) return;
        f.currentStage = `${ev.stage} ✓`;
        f.currentFraction = 1;
        f.currentEta = 0;
        f.currentNote = `${ev.elapsed_sec.toFixed(1)}s`;
        rewriteLine(renderProgressLine(f));
        return;
      }
      case "file_done": {
        const f = state.get(ev.file_id);
        if (!f) return;
        f.done = true;
        f.outputKinds = ev.outputs.map((o) => o.kind);
        const elapsed = formatDuration(ev.elapsed_sec);
        commitLine(
          `[${f.fileId}] ${basename(f.path)} ✓ done in ${elapsed} · ${f.outputKinds.join(" ")}`
        );
        return;
      }
      case "file_error": {
        const f = state.get(ev.file_id);
        if (f) f.error = ev.message;
        closeLine();
        commitLine(`[${ev.file_id}] ✗ ${ev.stage ?? ""}: ${ev.message}`);
        return;
      }
      case "log": {
        const prefix = ev.file_id ? `[${ev.file_id}] ` : "";
        const level = ev.level === "warn" || ev.level === "error" ? `(${ev.level}) ` : "";
        closeLine();
        commitLine(`${prefix}${level}${ev.message}`);
        return;
      }
      case "job_done": {
        const s = ev.summary;
        closeLine();
        commitLine(
          `job done  ${s.files_ok}/${s.files_total} ok` +
            (s.files_failed ? `, ${s.files_failed} failed` : "") +
            `  ${formatDuration(s.elapsed_sec)}`
        );
        return;
      }
    }
  }

  return { onEvent: handleEvent };
}

function initFile(state: Map<string, FileState>, fd: FileDescriptor) {
  state.set(fd.file_id, {
    fileId: fd.file_id,
    path: fd.path,
    size_bytes: fd.size_bytes,
    duration_sec: fd.duration_sec,
    startedAt: Date.now(),
    currentStage: "queued",
    lastPrintAt: 0,
    done: false,
    outputKinds: [],
  });
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)}MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec)) return "?";
  sec = Math.max(0, sec);
  if (sec < 60) return `${sec.toFixed(0)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  if (m < 60) return `${m}m${s.toString().padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h${mm.toString().padStart(2, "0")}m`;
}
