/**
 * Whisper backend interface + implementations.
 *
 * Default backend: mlx-whisper. One pass on Metal, word timestamps
 * inline, no separate alignment stage.
 *
 * Fallback backend: whisper-server (whisper.cpp HTTP). Returns segments
 * without word timestamps; the caller runs whisperx.align separately if
 * word timestamps are needed (meeting + diarize path).
 */

import { $ } from "bun";
import { basename, join } from "path";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { Emitter, StageTimer } from "./lib";

// --- Types ---

export interface WhisperWord {
  word: string;
  start: number;
  end: number;
  probability?: number;
}

export interface WhisperSegment {
  id?: number;
  start: number;
  end: number;
  text: string;
  words?: WhisperWord[];
}

export interface WhisperResult {
  text: string;
  segments: WhisperSegment[];
  language?: string;
  // Backend identity, for provenance.
  backend: "mlx-whisper" | "whisper-server";
  model: string;
}

export interface TranscribeOptions {
  audioPath: string;
  /** For progress fraction + ETA. */
  durationSec: number | null;
  /** Whether we need word timestamps. */
  wantWords: boolean;
  model?: string;
  /** Absolute chunk index (for note strings) when caller pre-split. */
  chunkIndex?: number;
  chunkTotal?: number;
}

export interface WhisperBackend {
  readonly name: "mlx-whisper" | "whisper-server";
  /**
   * Quick readiness probe. Returns null on OK, string with reason on not-ready.
   */
  probe(): Promise<string | null>;
  transcribe(
    opts: TranscribeOptions,
    emitter: Emitter,
    fileId: string
  ): Promise<WhisperResult>;
}

// --- Realtime factors for ETA (rough, per model) ---

const REALTIME_FACTOR: Record<string, number> = {
  // mlx-whisper on M2 Pro, ballparks — calibrate later.
  "mlx-community/whisper-tiny.en": 30,
  "mlx-community/whisper-base.en": 20,
  "mlx-community/whisper-small.en": 12,
  "mlx-community/whisper-medium.en": 7,
  "mlx-community/whisper-large-v3-turbo": 6,
  "mlx-community/whisper-large-v3": 3,
  // whisper-server
  "ggml-medium.en": 7,
  "ggml-large-v3-turbo": 5,
};

export function realtimeFactor(model: string): number {
  return REALTIME_FACTOR[model] ?? 5;
}

/**
 * Run `tick` on an exponential-backoff schedule (2s, 4s, 8s, 15s, then 30s)
 * until `done()` returns true. Used to sample wall-clock progress without
 * flooding the event stream.
 */
function backoffProgress(tick: () => void, done: () => boolean): Promise<void> {
  const delaysMs = [2000, 4000, 8000, 15000];
  const steadyMs = 30000;
  return (async () => {
    let i = 0;
    while (!done()) {
      const d = i < delaysMs.length ? delaysMs[i] : steadyMs;
      await new Promise((r) => setTimeout(r, d));
      if (done()) break;
      tick();
      i++;
    }
  })();
}

// --- mlx-whisper backend ---

const ENSEMBLE_VENV_PYTHON = join(
  process.env.HOME ?? "",
  "Documents/GitHub/ensemble/.venv/bin/python"
);

export class MlxWhisperBackend implements WhisperBackend {
  readonly name = "mlx-whisper" as const;
  constructor(private defaultModel = "mlx-community/whisper-large-v3-turbo") {}

  async probe(): Promise<string | null> {
    if (!existsSync(ENSEMBLE_VENV_PYTHON)) {
      return `ensemble venv not found at ${ENSEMBLE_VENV_PYTHON}`;
    }
    // Don't `import mlx_whisper` — its module init touches Metal, which
    // pops a macOS crash reporter dialog inside sandboxed processes. Use
    // importlib.util.find_spec to check presence without loading.
    try {
      await $`${ENSEMBLE_VENV_PYTHON} -c "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('mlx_whisper') else 1)"`.quiet();
      return null;
    } catch {
      return (
        `mlx-whisper not installed in ensemble venv — install: uv pip install --python ${ENSEMBLE_VENV_PYTHON} mlx-whisper`
      );
    }
  }

  async transcribe(
    opts: TranscribeOptions,
    emitter: Emitter,
    fileId: string
  ): Promise<WhisperResult> {
    const model = opts.model ?? this.defaultModel;
    const timer = new StageTimer(emitter, fileId, "transcribe");

    const note = opts.chunkTotal
      ? `chunk ${(opts.chunkIndex ?? 0) + 1}/${opts.chunkTotal} · mlx · ${model}`
      : `mlx · ${model}`;
    timer.progress({ fraction: 0, note });

    // Wall-clock ETA based on duration * realtime factor.
    // Tick cadence ramps: 2s, 4s, 8s, 15s, 30s — quiet for long jobs.
    let stopWatcher = false;
    const started = Date.now();
    const expected = opts.durationSec
      ? opts.durationSec / realtimeFactor(model)
      : null;
    const watcher = backoffProgress(
      () => {
        if (stopWatcher) return;
        const elapsed = (Date.now() - started) / 1000;
        if (expected && expected > 0) {
          const frac = Math.min(0.99, elapsed / expected);
          const eta = Math.max(0, expected - elapsed);
          timer.progress({ fraction: frac, eta_sec: eta, note });
        } else {
          timer.progress({ note: `${note} · ${elapsed.toFixed(0)}s` });
        }
      },
      () => stopWatcher
    );

    const script = makeMlxScript(opts.audioPath, model, opts.wantWords);
    let result: WhisperResult;
    try {
      const proc = Bun.spawn(
        [ENSEMBLE_VENV_PYTHON, "-c", script],
        { stdout: "pipe", stderr: "pipe" }
      );
      const [out, err, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      if (code !== 0) {
        throw new Error(`mlx-whisper exit ${code}: ${err.slice(0, 500)}`);
      }
      const parsed = JSON.parse(out);
      result = {
        text: parsed.text ?? "",
        segments: parsed.segments ?? [],
        language: parsed.language,
        backend: this.name,
        model,
      };
    } finally {
      stopWatcher = true;
      await watcher;
    }
    timer.done();
    return result;
  }
}

function makeMlxScript(audioPath: string, model: string, wantWords: boolean): string {
  const audio = audioPath.replace(/'/g, "\\'");
  const mdl = model.replace(/'/g, "\\'");
  // mlx-whisper returns NaN for word probabilities on some segments,
  // which is invalid JSON — normalize those to null before dumping.
  return [
    "import json, sys, math",
    "import mlx_whisper",
    `r = mlx_whisper.transcribe('${audio}', path_or_hf_repo='${mdl}', word_timestamps=${wantWords ? "True" : "False"})`,
    "def clean(o):",
    "    if isinstance(o, float): return None if (math.isnan(o) or math.isinf(o)) else o",
    "    if isinstance(o, list): return [clean(x) for x in o]",
    "    if isinstance(o, dict): return {k: clean(v) for k, v in o.items()}",
    "    return o",
    "out = {'text': r.get('text',''), 'language': r.get('language'), 'segments': r.get('segments', [])}",
    "sys.stdout.write(json.dumps(clean(out)))",
  ].join("\n");
}

// --- whisper-server backend (fallback) ---

const WHISPER_SERVER_URL = "http://127.0.0.1:8080";

export class WhisperServerBackend implements WhisperBackend {
  readonly name = "whisper-server" as const;
  constructor(
    private defaultModel = "ggml-medium.en",
    private url = WHISPER_SERVER_URL
  ) {}

  async probe(): Promise<string | null> {
    try {
      const res = await fetch(`${this.url}/`, { method: "GET" });
      return res.ok ? null : `whisper-server status ${res.status}`;
    } catch {
      return (
        `whisper-server not reachable at ${this.url}. Start it with:\n` +
        `  whisper-server -m ~/Applications/whisper.cpp/models/ggml-medium.en.bin --convert --port 8080`
      );
    }
  }

  async transcribe(
    opts: TranscribeOptions,
    emitter: Emitter,
    fileId: string
  ): Promise<WhisperResult> {
    const model = opts.model ?? this.defaultModel;
    const timer = new StageTimer(emitter, fileId, "transcribe");
    const note = opts.chunkTotal
      ? `chunk ${(opts.chunkIndex ?? 0) + 1}/${opts.chunkTotal} · whisper-server · ${model}`
      : `whisper-server · ${model}`;
    timer.progress({ fraction: 0, note });

    // whisper-server doesn't stream progress; estimate via wall-clock.
    let stopWatcher = false;
    const started = Date.now();
    const expected = opts.durationSec
      ? opts.durationSec / realtimeFactor(model)
      : null;
    const watcher = backoffProgress(
      () => {
        if (stopWatcher) return;
        const elapsed = (Date.now() - started) / 1000;
        if (expected && expected > 0) {
          const frac = Math.min(0.99, elapsed / expected);
          const eta = Math.max(0, expected - elapsed);
          timer.progress({ fraction: frac, eta_sec: eta, note });
        }
      },
      () => stopWatcher
    );

    let result: WhisperResult;
    try {
      const file = Bun.file(opts.audioPath);
      const form = new FormData();
      form.append("file", file, basename(opts.audioPath));
      form.append("response_format", "verbose_json");
      const res = await fetch(`${this.url}/inference`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        throw new Error(`whisper-server ${res.status}: ${await res.text()}`);
      }
      const parsed: any = await res.json();
      result = {
        text: parsed.text ?? "",
        segments: (parsed.segments ?? []).map((s: any) => ({
          id: s.id,
          start: s.start,
          end: s.end,
          text: s.text,
        })),
        language: parsed.language,
        backend: this.name,
        model,
      };
    } finally {
      stopWatcher = true;
      await watcher;
    }
    timer.done();
    return result;
  }
}

// --- Selection ---

export type BackendChoice = "mlx-whisper" | "whisper-server" | "auto";

/**
 * Pick a backend. `auto` tries mlx-whisper first, falls back to whisper-server.
 * The caller receives a chosen backend plus any warning string to log.
 */
export async function chooseBackend(
  choice: BackendChoice,
  opts: { model?: string } = {}
): Promise<{ backend: WhisperBackend; warning: string | null }> {
  if (choice === "mlx-whisper") {
    const b = new MlxWhisperBackend(opts.model);
    const reason = await b.probe();
    if (reason) throw new Error(reason);
    return { backend: b, warning: null };
  }
  if (choice === "whisper-server") {
    const b = new WhisperServerBackend(opts.model);
    const reason = await b.probe();
    if (reason) throw new Error(reason);
    return { backend: b, warning: null };
  }
  // auto
  const mlx = new MlxWhisperBackend(opts.model);
  const mlxReason = await mlx.probe();
  if (!mlxReason) return { backend: mlx, warning: null };
  const srv = new WhisperServerBackend();
  const srvReason = await srv.probe();
  if (!srvReason)
    return {
      backend: srv,
      warning: `mlx-whisper unavailable → using whisper-server fallback. ${mlxReason}`,
    };
  throw new Error(
    `No whisper backend available.\nmlx-whisper: ${mlxReason}\nwhisper-server: ${srvReason}`
  );
}

/**
 * Combine chunk results into one WhisperResult with timestamps shifted.
 */
export function concatChunks(
  chunks: WhisperResult[],
  chunkDurations: number[]
): WhisperResult {
  if (chunks.length === 0) {
    return { text: "", segments: [], backend: "mlx-whisper", model: "" };
  }
  let offset = 0;
  const segments: WhisperSegment[] = [];
  const texts: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    for (const s of c.segments) {
      const shifted: WhisperSegment = {
        ...s,
        start: s.start + offset,
        end: s.end + offset,
        words: s.words?.map((w) => ({
          ...w,
          start: w.start + offset,
          end: w.end + offset,
        })),
      };
      segments.push(shifted);
    }
    if (c.text) texts.push(c.text.trim());
    offset += chunkDurations[i] ?? 0;
  }
  return {
    text: texts.join(" "),
    segments,
    language: chunks[0].language,
    backend: chunks[0].backend,
    model: chunks[0].model,
  };
}
