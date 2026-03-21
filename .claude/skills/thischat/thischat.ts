#!/usr/bin/env bun
/**
 * thischat.ts
 *
 * Returns the JSONL log file path for the current Claude Code session.
 *
 * Strategy: encode CWD into the project directory name, sort session files
 * by mtime, then discriminate using the first user prompt (passed by the
 * calling agent). Falls back to most-recently-modified if no prompt given.
 *
 * Usage:
 *   bun thischat.ts --prompt "first 80 chars of user's first message"
 *   bun thischat.ts --prompt "..." --stamp <file>          # YAML frontmatter (default)
 *   bun thischat.ts --prompt "..." --stamp <file> --back   # HTML comment at end
 *   bun thischat.ts --retro --stamp <file>                # stamp using file birthtime + matching session
 */

import { readdir, stat, readFile, writeFile, appendFile, mkdir, copyFile } from "node:fs/promises";
import { join, basename, dirname } from "node:path";
import { parseArgs } from "node:util";

// --- Args ---

const { values: args } = parseArgs({
  options: {
    prompt: { type: "string" },
    stamp: { type: "string" },
    back: { type: "boolean", default: false },
    retro: { type: "boolean", default: false },
  },
  strict: true,
});

// --- Config ---

const cwd = process.cwd();
const claudeDir = process.env.CLAUDE_CONFIG_DIR ?? join(process.env.HOME ?? "~", ".claude");
const projectsDir = join(claudeDir, "projects");

// Encode CWD the way Claude Code does: replace / with -
const encoded = cwd.replace(/\//g, "-");
const projectDir = join(projectsDir, encoded);

// --- Helpers ---

/** Extract the first real user prompt from a JSONL session file (first 50 lines). */
async function extractFirstPrompt(filePath: string): Promise<string | null> {
  const noisePatterns = [
    /^<ide_opened_file>/,
    /^<system-reminder>/,
    /^<command-message>/,
    /^<command-name>/,
    /^<local-command/,
  ];

  try {
    const file = Bun.file(filePath);
    const stream = file.stream();
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let linesRead = 0;

    while (linesRead < 50) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);
        linesRead++;

        if (!line.trim()) continue;
        let msg: any;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.type !== "user") continue;

        const content = msg.message?.content;
        if (!content) continue;
        const blocks = typeof content === "string" ? [content] : content;

        for (const block of blocks) {
          const text = typeof block === "string" ? block : block?.text;
          if (!text || typeof text !== "string") continue;
          const trimmed = text.trim();
          if (!trimmed) continue;
          if (noisePatterns.some((p) => p.test(trimmed))) continue;
          reader.cancel();
          return trimmed.slice(0, 120);
        }
      }
    }
    reader.cancel();
    return null;
  } catch {
    return null;
  }
}

// --- Retro: find session by file birthtime ---

/** Get start/end timestamps from a JSONL session file (first and last lines). */
async function getSessionTimeWindow(filePath: string): Promise<{ start: number; end: number } | null> {
  try {
    const file = Bun.file(filePath);
    const size = file.size;
    if (size === 0) return null;

    // First line → start time
    const stream = file.stream();
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let startTs: string | null = null;

    while (!startTs) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const idx = buffer.indexOf("\n");
      if (idx !== -1) {
        try {
          const obj = JSON.parse(buffer.slice(0, idx));
          startTs = obj.timestamp ?? null;
        } catch {}
        break;
      }
    }
    reader.cancel();

    // Last line → end time
    const readSize = Math.min(size, 32768);
    const blob = file.slice(size - readSize, size);
    const tail = await blob.text();
    const lines = tail.trimEnd().split("\n");
    let endTs: string | null = null;
    try {
      const obj = JSON.parse(lines[lines.length - 1]);
      endTs = obj.timestamp ?? null;
    } catch {}

    if (!startTs || !endTs) return null;
    return { start: new Date(startTs).getTime(), end: new Date(endTs).getTime() };
  } catch {
    return null;
  }
}

// Archive directory for session logs that survived past 30-day cleanup
const archiveDir = join(process.env.HOME ?? "~", ".config/weft/session-archive");

/** Scan a directory for JSONL files matching a birthtime window. */
async function searchDirForSession(
  dir: string,
  birthtimeMs: number
): Promise<{ path: string; distance: number } | null> {
  let entries: string[];
  try {
    entries = (await readdir(dir)).filter((f) => f.endsWith(".jsonl"));
  } catch {
    return null;
  }

  let best: { path: string; distance: number } | null = null;

  for (const f of entries) {
    const p = join(dir, f);
    const window = await getSessionTimeWindow(p);
    if (!window) continue;

    const grace = 5 * 60 * 1000;
    if (birthtimeMs >= window.start - grace && birthtimeMs <= window.end + grace) {
      const distance = Math.abs(birthtimeMs - window.end);
      if (!best || distance < best.distance) {
        best = { path: p, distance };
      }
    }
  }

  return best;
}

/** Find the session that was active when a file was created. Searches live dir, then archive. */
async function findSessionByBirthtime(birthtimeMs: number): Promise<string | null> {
  // Search live session logs first
  const live = await searchDirForSession(projectDir, birthtimeMs);
  if (live) return live.path;

  // Fall back to archive
  const archiveProjectDir = join(archiveDir, encoded);
  const archived = await searchDirForSession(archiveProjectDir, birthtimeMs);
  if (archived) {
    console.error("[thischat] Matched from archive");
    return archived.path;
  }

  return null;
}

// --- Early archive ---

/** Copy a session JSONL to the archive and return the archive path. */
async function archiveSession(livePath: string): Promise<string> {
  // Determine which project directory this session belongs to
  // livePath: ~/.claude/projects/<encoded>/uuid.jsonl
  // archivePath: ~/.config/weft/session-archive/<encoded>/uuid.jsonl
  const projectEncoded = basename(dirname(livePath));
  const fileName = basename(livePath);
  const archiveDest = join(archiveDir, projectEncoded);

  try {
    await mkdir(archiveDest, { recursive: true });
    const destPath = join(archiveDest, fileName);
    await copyFile(livePath, destPath);
    return destPath;
  } catch (e: any) {
    console.error(`[thischat] Archive copy failed: ${e.message}`);
    // Fall back to live path if archive fails
    return livePath;
  }
}

// --- Stamping ---

/** Prepend or merge session info into YAML frontmatter. */
async function stampFrontmatter(filePath: string, sessionPath: string, timestamp?: string): Promise<void> {
  const now = timestamp ?? new Date().toISOString();
  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch {
    content = "";
  }

  const frontmatterRe = /^---\n([\s\S]*?)\n---\n/;
  const match = content.match(frontmatterRe);

  if (match) {
    // Merge into existing frontmatter
    let fm = match[1];
    // Remove old session/stamped fields if present
    fm = fm.replace(/^session:.*\n?/m, "");
    fm = fm.replace(/^stamped:.*\n?/m, "");
    fm = fm.trimEnd();
    fm += `\nsession: ${sessionPath}\nstamped: ${now}\n`;
    const rest = content.slice(match[0].length);
    await writeFile(filePath, `---\n${fm}---\n${rest}`);
  } else {
    // Prepend new frontmatter
    const fm = `---\nsession: ${sessionPath}\nstamped: ${now}\n---\n`;
    await writeFile(filePath, fm + content);
  }
}

/** Append an HTML comment at the end of the file. */
async function stampBack(filePath: string, sessionPath: string, timestamp?: string): Promise<void> {
  const now = timestamp ?? new Date().toISOString();
  const stamp = `\n<!-- session: ${sessionPath} | ${now} -->\n`;
  await appendFile(filePath, stamp);
}

// --- Find session ---

async function findCurrentSession(): Promise<string | null> {
  let entries: string[];
  try {
    entries = (await readdir(projectDir)).filter((f) => f.endsWith(".jsonl"));
  } catch {
    console.error(`[thischat] Project directory not found: ${projectDir}`);
    return null;
  }

  if (entries.length === 0) {
    console.error("[thischat] No session files found");
    return null;
  }

  // Sort by mtime descending
  const withStats = await Promise.all(
    entries.map(async (f) => {
      const p = join(projectDir, f);
      const s = await stat(p);
      return { path: p, mtime: s.mtimeMs };
    })
  );
  withStats.sort((a, b) => b.mtime - a.mtime);

  // If we have a prompt to match, use it as the primary discriminator
  if (args.prompt) {
    const trimmed = args.prompt.trim().toLowerCase();
    // Use first 40 chars or the full prompt, whichever is longer
    const needle = trimmed.length <= 40 ? trimmed : trimmed.slice(0, 40);

    // Check top 10 candidates by mtime
    for (const candidate of withStats.slice(0, 10)) {
      const firstPrompt = await extractFirstPrompt(candidate.path);
      if (firstPrompt && firstPrompt.toLowerCase().includes(needle)) {
        return candidate.path;
      }
    }

    console.error("[thischat] No prompt match found; falling back to most recent");
  }

  // Fallback: most recently modified
  return withStats[0].path;
}

// --- Main ---

if (args.retro) {
  // Retroactive stamping: use file birthtime to find the originating session
  if (!args.stamp) {
    console.error("[thischat] --retro requires --stamp <file>");
    process.exit(1);
  }

  let birthtime: Date;
  try {
    const s = await stat(args.stamp);
    birthtime = s.birthtime;
  } catch {
    console.error(`[thischat] Cannot stat ${args.stamp}`);
    process.exit(1);
  }

  const sessionPath = await findSessionByBirthtime(birthtime.getTime());
  const ts = birthtime.toISOString();

  // Archive the session file early so the stamp path is durable
  let stampPath: string;
  if (sessionPath) {
    stampPath = sessionPath.includes(archiveDir) ? sessionPath : await archiveSession(sessionPath);
  } else {
    stampPath = "(no matching session found)";
  }

  if (args.back) {
    await stampBack(args.stamp, stampPath, ts);
  } else {
    await stampFrontmatter(args.stamp, stampPath, ts);
  }
  console.log(`Retro-stamped ${args.stamp} (created ${ts})`);
  console.log(`Session: ${stampPath}`);
} else {
  const sessionPath = await findCurrentSession();

  if (!sessionPath) {
    console.error("[thischat] Could not determine current session");
    process.exit(1);
  }

  if (args.stamp) {
    // Archive the session file early so the stamp path is durable
    const stampPath = await archiveSession(sessionPath);

    if (args.back) {
      await stampBack(args.stamp, stampPath);
    } else {
      await stampFrontmatter(args.stamp, stampPath);
    }
    console.log(`Stamped ${args.stamp}${args.back ? " (back)" : " (frontmatter)"}`);
    console.log(`Session: ${stampPath}`);
  } else {
    // No stamp — just print the live path (caller may not need archive)
    console.log(sessionPath);
  }
}
