/**
 * ffmpeg / ffprobe wrappers.
 *
 * probeDuration — seconds, via ffprobe.
 * extractAudio — video → 16kHz mono pcm_s16le wav in $TMPDIR.
 * splitAudio — break long audio into equal-ish chunks for the whisper
 *              backend. Uses segment muxer (cheap, preserves stream).
 */

import { $ } from "bun";
import { existsSync, mkdirSync, readdirSync } from "fs";
import { basename, extname, join } from "path";

const VIDEO_EXTS = new Set([".mp4", ".webm", ".mkv", ".mov", ".avi", ".m4v"]);
const AUDIO_EXTS = new Set([".m4a", ".mp3", ".wav", ".flac", ".ogg", ".opus"]);

export function isVideo(path: string): boolean {
  return VIDEO_EXTS.has(extname(path).toLowerCase());
}

export function isAudio(path: string): boolean {
  return AUDIO_EXTS.has(extname(path).toLowerCase());
}

export function isMedia(path: string): boolean {
  return isVideo(path) || isAudio(path);
}

export async function probeDuration(path: string): Promise<number | null> {
  try {
    const out = await $`ffprobe -v error -show_entries format=duration -of csv=p=0 ${path}`.text();
    const n = parseFloat(out.trim());
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Extract a mono 16kHz wav from any video/audio input. Returns the wav path.
 */
export async function extractAudio(input: string, outDir: string): Promise<string> {
  mkdirSync(outDir, { recursive: true });
  const stem = basename(input, extname(input)).replace(/[^a-zA-Z0-9._-]+/g, "_");
  const out = join(outDir, `${stem}.wav`);
  if (existsSync(out)) return out;
  await $`ffmpeg -nostdin -y -loglevel error -i ${input} -vn -acodec pcm_s16le -ar 16000 -ac 1 ${out}`;
  return out;
}

/**
 * Split audio into ~chunkSec-second pieces. Returns chunk paths in order.
 * Re-encodes to 16kHz mono pcm_s16le — matches what mlx-whisper /
 * whisper-server decode to internally, so no quality loss and chunks are
 * always valid WAV regardless of input codec. Streaming copy would break
 * the WAV container for AAC/MP3 inputs.
 */
export async function splitAudio(
  input: string,
  outDir: string,
  chunkSec: number
): Promise<string[]> {
  mkdirSync(outDir, { recursive: true });
  const stem = basename(input, extname(input)).replace(/[^a-zA-Z0-9._-]+/g, "_");
  const pattern = join(outDir, `${stem}-%03d.wav`);
  await $`ffmpeg -nostdin -y -loglevel error -i ${input} -vn -acodec pcm_s16le -ar 16000 -ac 1 -f segment -segment_time ${chunkSec} ${pattern}`;
  const prefix = `${stem}-`;
  const chunks = readdirSync(outDir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".wav"))
    .sort();
  return chunks.map((f) => join(outDir, f));
}

/**
 * File size in bytes, null on stat failure.
 */
export async function fileSize(path: string): Promise<number> {
  try {
    const f = Bun.file(path);
    return f.size;
  } catch {
    return 0;
  }
}
