#!/usr/bin/env bun
/**
 * session-archive.ts
 *
 * Daily cron job:
 * 1. rsync session logs from ~/.claude/projects/ to ~/.config/weft/session-archive/
 * 2. Find unstamped .md files in configured project dirs and retro-stamp them
 *
 * Stamps in-process (no subprocess per file) with a pre-built session index
 * to avoid re-scanning JSONL files for every stamp.
 *
 * Usage:
 *   bun session-archive.ts              # run both archive + stamp
 *   bun session-archive.ts --dry-run    # show what would be done
 */

import { readdir, readFile, stat, writeFile, appendFile } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import { parseArgs } from "node:util";
import { $ } from "bun";

const { values: args } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
  },
  strict: true,
});

const dryRun = args["dry-run"] ?? false;
const home = process.env.HOME ?? "~";
const claudeDir = process.env.CLAUDE_CONFIG_DIR ?? join(home, ".claude");
const archiveDir = join(home, ".config/weft/session-archive");
const stampProjectsFile = join(home, ".config/weft/stamp-projects");

// --- Session index ---

interface SessionWindow {
  path: string;
  start: number;
  end: number;
}

/** Read first and last timestamps from a JSONL file. */
async function getSessionTimeWindow(filePath: string): Promise<SessionWindow | null> {
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
    return {
      path: filePath,
      start: new Date(startTs).getTime(),
      end: new Date(endTs).getTime(),
    };
  } catch {
    return null;
  }
}

/** Build an index of all session time windows for a project directory. */
async function buildSessionIndex(projectEncoded: string): Promise<SessionWindow[]> {
  const index: SessionWindow[] = [];
  const dirs = [
    join(claudeDir, "projects", projectEncoded),
    join(archiveDir, projectEncoded),
  ];

  const seen = new Set<string>(); // Deduplicate by filename

  for (const dir of dirs) {
    let entries: string[];
    try {
      entries = (await readdir(dir)).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }

    for (const f of entries) {
      if (seen.has(f)) continue;
      seen.add(f);
      const window = await getSessionTimeWindow(join(dir, f));
      if (window) index.push(window);
    }
  }

  return index;
}

/** Find the session that was active when a file was created. */
async function findSessionByBirthtime(index: SessionWindow[], birthtimeMs: number): Promise<string | null> {
  const grace = 5 * 60 * 1000;
  let best: { path: string; distance: number } | null = null;

  for (const session of index) {
    if (birthtimeMs >= session.start - grace && birthtimeMs <= session.end + grace) {
      const distance = Math.abs(birthtimeMs - session.end);
      if (!best || distance < best.distance) {
        best = { path: session.path, distance };
      }
    }
  }

  // Prefer archive path over live path
  if (best && !best.path.includes(archiveDir)) {
    const archivePath = best.path.replace(join(claudeDir, "projects"), archiveDir);
    const archiveFile = Bun.file(archivePath);
    if (await archiveFile.exists()) {
      return archivePath;
    }
    return best.path;
  }

  return best?.path ?? null;
}

// --- 1. Archive session logs ---

async function archiveSessions() {
  console.log("[session-archive] Archiving session logs...");
  const src = join(claudeDir, "projects") + "/";
  const dst = archiveDir + "/";

  if (dryRun) {
    console.log(`[session-archive] Would rsync ${src} → ${dst}`);
    return;
  }

  try {
    const result = await $`rsync -a --include='*/' --include='*.jsonl' --exclude='*' ${src} ${dst}`.quiet();
    console.log(`[session-archive] Archived to ${dst}`);
  } catch (e: any) {
    console.error(`[session-archive] rsync failed: ${e.message}`);
  }
}

// --- 2. Find and retro-stamp unstamped files ---

const AUTO_READ_NAMES = new Set(["SKILL.md", "CLAUDE.md", "MEMORY.md"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next", ".claude"]);

async function isStamped(filePath: string): Promise<boolean> {
  try {
    const content = await readFile(filePath, "utf-8");
    if (/^---\n[\s\S]*?session:/.test(content)) return true;
    if (content.includes("<!-- session:")) return true;
    return false;
  } catch {
    return true;
  }
}

async function findUnstampedMd(dir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(current: string, depth: number) {
    if (depth > 6) return;
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(join(current, entry.name), depth + 1);
      } else if (entry.isFile() && extname(entry.name) === ".md") {
        const fullPath = join(current, entry.name);
        if (!(await isStamped(fullPath))) {
          results.push(fullPath);
        }
      }
    }
  }

  await walk(dir, 0);
  return results;
}

/** Stamp a file with frontmatter or back comment, in-process. */
async function stampFile(
  filePath: string,
  sessionPath: string,
  timestamp: string,
  useBack: boolean
): Promise<void> {
  if (useBack) {
    const stamp = `\n<!-- session: ${sessionPath} | ${timestamp} -->\n`;
    await appendFile(filePath, stamp);
  } else {
    let content: string;
    try {
      content = await readFile(filePath, "utf-8");
    } catch {
      content = "";
    }

    const frontmatterRe = /^---\n([\s\S]*?)\n---\n/;
    const match = content.match(frontmatterRe);

    if (match) {
      let fm = match[1];
      fm = fm.replace(/^session:.*\n?/m, "");
      fm = fm.replace(/^stamped:.*\n?/m, "");
      fm = fm.trimEnd();
      fm += `\nsession: ${sessionPath}\nstamped: ${timestamp}\n`;
      const rest = content.slice(match[0].length);
      await writeFile(filePath, `---\n${fm}---\n${rest}`);
    } else {
      const fm = `---\nsession: ${sessionPath}\nstamped: ${timestamp}\n---\n`;
      await writeFile(filePath, fm + content);
    }
  }
}

async function stampUnstampedFiles() {
  let projects: string[];
  try {
    const content = await readFile(stampProjectsFile, "utf-8");
    projects = content.split("\n").map((l) => l.trim()).filter(Boolean);
  } catch {
    console.error("[session-archive] No stamp-projects config found; skipping stamping");
    return;
  }

  console.log(`[session-archive] Scanning ${projects.length} project(s) for unstamped .md files...`);

  for (const project of projects) {
    const unstamped = await findUnstampedMd(project);
    if (unstamped.length === 0) continue;
    console.log(`[session-archive] ${project}: ${unstamped.length} unstamped file(s)`);

    // Build session index once per project
    const projectEncoded = project.replace(/\//g, "-");
    console.log(`[session-archive] Building session index for ${projectEncoded}...`);
    const index = await buildSessionIndex(projectEncoded);
    console.log(`[session-archive] Indexed ${index.length} session(s)`);

    for (const file of unstamped) {
      const name = basename(file);
      const useBack = AUTO_READ_NAMES.has(name) || file.includes("/memory/");

      if (dryRun) {
        console.log(`[session-archive] Would stamp: ${file}${useBack ? " (back)" : ""}`);
        continue;
      }

      let birthtime: Date;
      try {
        const s = await stat(file);
        birthtime = s.birthtime;
      } catch {
        console.error(`[session-archive] Cannot stat ${file}; skipping`);
        continue;
      }

      const sessionPath = await findSessionByBirthtime(index, birthtime.getTime());
      const ts = birthtime.toISOString();
      const resolvedSession = sessionPath ?? "(no matching session found)";

      await stampFile(file, resolvedSession, ts, useBack);
      console.log(`[session-archive] Stamped: ${file}${useBack ? " (back)" : ""}`);
    }
  }
}

// --- Main ---

await archiveSessions();
await stampUnstampedFiles();
console.log("[session-archive] Done.");
