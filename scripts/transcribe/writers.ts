/**
 * Output artifact writers.
 *
 * Voice-memo inbox markdowns preserve the existing frontmatter schema so
 * /extract continues to work unchanged (id, audio, recorded, transcribed,
 * status).
 *
 * Meeting outputs go to threads/<thread>/ as:
 *   meeting-YYYY-MM-DD-<topic>.srt
 *   meeting-YYYY-MM-DD-<topic>.txt
 *   meeting-YYYY-MM-DD-<topic>.md   (summary — filled in by the orchestrator)
 *
 * A transcript_json is always emitted for meetings (word-level timestamps
 * are ensemble's input).
 */

import { $ } from "bun";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { basename, join } from "path";
import type { OutputRef, Mode } from "./lib";
import type { WhisperResult, WhisperSegment } from "./whisper";

// --- Voice memo inbox ---

export interface VoiceMemoWrite {
  inboxDir: string;
  archiveDir: string;
  fileId: string;
  originalPath: string;
  creationTimestamp: string;
  transcript: string;
  source?: "whisper" | "superwhisper";
  /** If provided, write audioPath into frontmatter rather than deriving from fileId. */
  audioPathOverride?: string;
  moveAudio: boolean;
}

export async function writeVoiceMemoArtifacts(
  w: VoiceMemoWrite
): Promise<OutputRef[]> {
  mkdirSync(w.inboxDir, { recursive: true });
  mkdirSync(w.archiveDir, { recursive: true });

  const ext = extnameOr(w.originalPath, ".m4a");
  const archivePath = join(w.archiveDir, `${w.fileId}${ext}`);
  const audioFrontmatter =
    w.audioPathOverride ?? `archive/audio/${w.fileId}${ext}`;

  const rawText = w.transcript.trim();
  const wordCount = rawText ? rawText.split(/\s+/).length : 0;
  const status = wordCount < 20 ? "minimal" : "raw";
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "");

  const frontmatter = [
    "---",
    `id: ${w.fileId}`,
    `audio: ${audioFrontmatter}`,
    `recorded: ${w.creationTimestamp}`,
    `transcribed: ${now}`,
    `status: ${status}`,
    ...(w.source === "superwhisper" ? ["source: superwhisper"] : []),
    "---",
    "",
  ].join("\n");

  const inboxPath = join(w.inboxDir, `${w.fileId}.md`);
  await Bun.write(inboxPath, frontmatter + rawText + "\n");

  const outputs: OutputRef[] = [{ kind: "inbox_markdown", path: inboxPath }];
  if (w.moveAudio && existsSync(w.originalPath)) {
    try {
      await $`mv ${w.originalPath} ${archivePath}`;
      outputs.push({ kind: "audio_archive", path: archivePath });
    } catch {
      // non-fatal — transcript already written
    }
  }
  return outputs;
}

// --- Meeting outputs ---

export interface MeetingWrite {
  threadDir: string;
  date: string;             // YYYY-MM-DD
  topic: string;            // slug
  originalPath: string;
  result: WhisperResult;    // speaker labels already attached if diarized
  diarized: boolean;
  durationSec: number | null;
  participants: string[];
}

export async function writeMeetingArtifacts(
  m: MeetingWrite
): Promise<OutputRef[]> {
  mkdirSync(m.threadDir, { recursive: true });
  // Filename: <date>-<topic>. Extension signals the artifact type
  // (srt/txt/json). No "meeting-" prefix — the skill doesn't know if
  // the recording is meeting-like; that's an agent-level classification.
  const stem = `${m.date}-${m.topic}`;
  const srtPath = join(m.threadDir, `${stem}.srt`);
  const txtPath = join(m.threadDir, `${stem}.txt`);
  const jsonPath = join(m.threadDir, `${stem}.json`);

  await Bun.write(srtPath, toSrt(m.result.segments));
  await Bun.write(txtPath, toPlainText(m.result.segments, m.diarized));
  await Bun.write(jsonPath, JSON.stringify(m.result, null, 2));

  return [
    { kind: "transcript_srt", path: srtPath },
    { kind: "transcript_txt", path: txtPath },
    { kind: "transcript_json", path: jsonPath },
  ];
}

// --- SRT / plain text ---

export function toSrt(segments: WhisperSegment[]): string {
  const parts: string[] = [];
  segments.forEach((s, i) => {
    parts.push(String(i + 1));
    parts.push(`${srtTime(s.start)} --> ${srtTime(s.end)}`);
    const speaker = (s as any).speaker as string | undefined;
    parts.push(speaker ? `[${speaker}] ${s.text.trim()}` : s.text.trim());
    parts.push("");
  });
  return parts.join("\n");
}

function srtTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const hh = Math.floor(ms / 3_600_000);
  const mm = Math.floor((ms % 3_600_000) / 60_000);
  const ss = Math.floor((ms % 60_000) / 1000);
  const mmm = ms % 1000;
  return `${pad(hh, 2)}:${pad(mm, 2)}:${pad(ss, 2)},${pad(mmm, 3)}`;
}

function pad(n: number, w: number): string {
  return n.toString().padStart(w, "0");
}

export function toPlainText(segments: WhisperSegment[], diarized: boolean): string {
  const lines: string[] = [];
  let currentSpeaker: string | null = null;
  for (const s of segments) {
    const speaker = (s as any).speaker as string | undefined;
    if (diarized && speaker && speaker !== currentSpeaker) {
      if (lines.length) lines.push("");
      lines.push(`[${speaker}]`);
      currentSpeaker = speaker;
    }
    lines.push(s.text.trim());
  }
  return lines.join("\n") + "\n";
}

// --- Meeting summary template ---

export interface MeetingSummaryInput {
  date: string;
  topic: string;
  participants: string[];
  durationSec: number | null;
  sourcePath: string;
  transcriptPath: string;
  summaryMarkdownBody: string;
}

/**
 * Render a meeting summary .md. `summaryMarkdownBody` is the body (key topics,
 * decisions, action items, open questions) — produced by the orchestrator or
 * by a later Claude pass. This writer just wraps it in the canonical header.
 */
export function renderMeetingSummary(s: MeetingSummaryInput): string {
  const mins = s.durationSec ? Math.round(s.durationSec / 60) : null;
  return [
    `# ${titleFromTopic(s.topic)} — ${s.date}`,
    "",
    `**Date:** ${s.date}`,
    `**Participants:** ${s.participants.length ? s.participants.join(", ") : "(unknown)"}`,
    mins !== null ? `**Duration:** ${mins} minutes` : "",
    `**Recording:** \`${s.sourcePath}\``,
    `**Transcript:** \`${s.transcriptPath}\``,
    "",
    s.summaryMarkdownBody.trim(),
    "",
  ]
    .filter((l) => l !== "")
    .concat([""])
    .join("\n");
}

function titleFromTopic(topic: string): string {
  return topic
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// --- Helpers ---

function extnameOr(path: string, fallback: string): string {
  const m = /\.[a-zA-Z0-9]+$/.exec(path);
  return m ? m[0] : fallback;
}

/**
 * Extract participant names from a thread's _thread.md. Looks for a
 * "Participants:" line or a first-level bullet list under a participants
 * heading. Returns [] if nothing obvious is found.
 */
export function readThreadParticipants(threadDir: string): string[] {
  const p = join(threadDir, "_thread.md");
  if (!existsSync(p)) return [];
  const text = readFileSync(p, "utf8");
  const m = /\bParticipants?:\s*([^\n]+)/i.exec(text);
  if (m) {
    return m[1]
      .split(/[,/]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}
