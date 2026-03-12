#!/usr/bin/env bun
/**
 * session-discovery.ts
 *
 * Discovers Claude Code conversation sessions within a date range.
 * Outputs a JSON manifest to stdout for consumption by skills/agents.
 *
 * Usage:
 *   bun run scripts/session-discovery.ts                          # today's sessions
 *   bun run scripts/session-discovery.ts --since 2026-02-27       # since a date
 *   bun run scripts/session-discovery.ts --since 2026-02-27 --until 2026-02-28
 *   bun run scripts/session-discovery.ts --project weft-dev       # filter by project name substring
 *
 * Output: JSON array of session objects to stdout. Diagnostics to stderr.
 */

import { readdir, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { parseArgs } from "node:util";

// --- Types ---

interface SessionManifest {
  sessionId: string;
  project: string;
  projectEncoded: string;
  filePath: string;
  start: string;
  end: string;
  messageCount: number;
  userMessageCount: number;
  firstPrompt: string;
  gitBranch: string | null;
  schemaVersion: string | null;
}

interface DiscoveryMeta {
  claudeDir: string;
  since: string;
  until: string;
  filesScanned: number;
  sessionsMatched: number;
  errors: string[];
}

// --- Config ---

function resolveClaudeDir(): string {
  const fromEnv = process.env.CLAUDE_CONFIG_DIR;
  if (fromEnv) {
    console.error(`[session-discovery] Using CLAUDE_CONFIG_DIR: ${fromEnv}`);
    return fromEnv;
  }
  return join(process.env.HOME ?? "~", ".claude");
}

// --- Arg parsing ---

const { values: args } = parseArgs({
  options: {
    since: { type: "string" },
    until: { type: "string" },
    project: { type: "string" },
    "min-user-messages": { type: "string" },
    "paths-only": { type: "boolean", default: false },
  },
  strict: true,
});

const today = new Date().toISOString().slice(0, 10);
const sinceDate = args.since ?? today;
const untilDate = args.until ?? today;
const projectFilter = args.project?.toLowerCase() ?? null;
const minUserMessages = parseInt(args["min-user-messages"] ?? "0", 10);
const pathsOnly = args["paths-only"] ?? false;

// Convert date boundaries to full ISO timestamps for comparison
const sinceISO = `${sinceDate}T00:00:00.000Z`;
const untilISO = `${untilDate}T23:59:59.999Z`;

// --- Path extraction from JSONL ---

// --- JSONL reading ---

async function readFirstLine(filePath: string): Promise<string | null> {
  try {
    const file = Bun.file(filePath);
    const stream = file.stream();
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const newlineIdx = buffer.indexOf("\n");
      if (newlineIdx !== -1) {
        reader.cancel();
        return buffer.slice(0, newlineIdx);
      }
      // Safety: don't buffer more than 64KB for one line
      if (buffer.length > 65536) {
        reader.cancel();
        return buffer;
      }
    }
    return buffer || null;
  } catch {
    return null;
  }
}

async function readLastLine(filePath: string): Promise<string | null> {
  try {
    const file = Bun.file(filePath);
    const size = file.size;
    if (size === 0) return null;

    // Read last 32KB — should be more than enough for one JSONL line
    const readSize = Math.min(size, 32768);
    const blob = file.slice(size - readSize, size);
    const text = await blob.text();
    const lines = text.trimEnd().split("\n");
    return lines[lines.length - 1] || null;
  } catch {
    return null;
  }
}

function parseTimestamp(jsonLine: string): string | null {
  try {
    const obj = JSON.parse(jsonLine);
    return obj.timestamp ?? null;
  } catch {
    return null;
  }
}

function parseSchemaVersion(jsonLine: string): string | null {
  try {
    const obj = JSON.parse(jsonLine);
    return obj.version ?? null;
  } catch {
    return null;
  }
}

// --- First prompt extraction ---

async function extractSessionMeta(filePath: string): Promise<{
  prompt: string;
  branch: string | null;
  cwd: string | null;
}> {
  const noisePatterns = [
    /^<ide_opened_file>/,
    /^<system-reminder>/,
    /^<command-message>/,
    /^<command-name>/,
    /^<local-command/,
  ];

  try {
    const file = Bun.file(filePath);
    const text = await file.text();
    const lines = text.split("\n");
    let branch: string | null = null;
    let cwd: string | null = null;

    for (const line of lines) {
      if (!line.trim()) continue;
      let msg: any;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }

      // Extract cwd from any line that has it
      if (!cwd && msg.cwd) cwd = msg.cwd;

      if (msg.type !== "user") continue;
      if (!branch && msg.gitBranch) branch = msg.gitBranch;

      const content = msg.message?.content;
      if (!content) continue;

      // content can be a string or array of blocks
      const blocks = typeof content === "string" ? [content] : content;

      for (const block of blocks) {
        const text = typeof block === "string" ? block : block?.text;
        if (!text || typeof text !== "string") continue;
        const trimmed = text.trim();
        if (!trimmed) continue;
        if (noisePatterns.some((p) => p.test(trimmed))) continue;
        return { prompt: trimmed.slice(0, 120), branch, cwd };
      }
    }
    return { prompt: "(no user prompt found)", branch, cwd };
  } catch {
    return { prompt: "(error reading file)", branch: null, cwd: null };
  }
}

// --- Message counting ---

async function countMessages(filePath: string): Promise<{ total: number; user: number }> {
  try {
    const file = Bun.file(filePath);
    const text = await file.text();
    const lines = text.split("\n");
    let total = 0;
    let user = 0;
    for (const line of lines) {
      if (!line.trim()) continue;
      total++;
      // Quick check without full parse
      if (line.includes('"type":"user"') || line.includes('"type": "user"')) {
        user++;
      }
    }
    return { total, user };
  } catch {
    return { total: 0, user: 0 };
  }
}

// --- Session overlap check ---

function sessionOverlapsWindow(start: string | null, end: string | null): boolean {
  // A session overlaps the window if it started before the window ended
  // AND ended after the window started (standard interval overlap)
  const s = start ?? end;
  const e = end ?? start;
  if (!s || !e) return false;
  return s <= untilISO && e >= sinceISO;
}

// --- Main ---

async function main() {
  const claudeDir = resolveClaudeDir();
  const projectsDir = join(claudeDir, "projects");
  const errors: string[] = [];
  const sessions: SessionManifest[] = [];
  let filesScanned = 0;

  // Check projects dir exists
  try {
    await stat(projectsDir);
  } catch {
    console.error(`[session-discovery] Projects directory not found: ${projectsDir}`);
    process.exit(1);
  }

  // List project directories
  let projectDirs: string[];
  try {
    const entries = await readdir(projectsDir, { withFileTypes: true });
    projectDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (e: any) {
    console.error(`[session-discovery] Cannot read projects directory: ${e.message}`);
    process.exit(1);
  }

  console.error(
    `[session-discovery] Scanning ${projectDirs.length} project(s) for sessions between ${sinceDate} and ${untilDate}`
  );

  for (const projDir of projectDirs) {
    const projPath = join(projectsDir, projDir);

    let files: string[];
    try {
      const entries = await readdir(projPath);
      files = entries.filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }

    for (const file of files) {
      const filePath = join(projPath, file);
      filesScanned++;

      // Check file modification time first as a fast pre-filter
      // Use a generous window: since - 2 days to catch cross-midnight sessions
      try {
        const fileStat = await stat(filePath);
        const sinceDateObj = new Date(sinceISO);
        sinceDateObj.setDate(sinceDateObj.getDate() - 2);
        if (fileStat.mtime < sinceDateObj) continue;
      } catch {
        continue;
      }

      const firstLine = await readFirstLine(filePath);
      const lastLine = await readLastLine(filePath);
      if (!firstLine) continue;

      const startTs = parseTimestamp(firstLine);
      const endTs = parseTimestamp(lastLine ?? firstLine);
      const version = parseSchemaVersion(firstLine);

      if (!sessionOverlapsWindow(startTs, endTs)) continue;

      const { prompt, branch, cwd } = await extractSessionMeta(filePath);
      const { total, user } = await countMessages(filePath);

      // Use cwd from JSONL as the real project path (directory encoding is lossy)
      const project = cwd ?? projDir;

      // Apply project filter against the real path
      if (projectFilter && !project.toLowerCase().includes(projectFilter)) continue;

      sessions.push({
        sessionId: basename(file, ".jsonl"),
        project,
        projectEncoded: projDir,
        filePath,
        start: startTs ?? "(unknown)",
        end: endTs ?? "(unknown)",
        messageCount: total,
        userMessageCount: user,
        firstPrompt: prompt,
        gitBranch: branch,
        schemaVersion: version,
      });
    }
  }

  sessions.sort((a, b) => a.start.localeCompare(b.start));

  // Apply post-collection filters
  const filtered = minUserMessages > 0
    ? sessions.filter((s) => s.userMessageCount >= minUserMessages)
    : sessions;

  if (pathsOnly) {
    for (const s of filtered) {
      console.log(s.filePath);
    }
  } else {
    const meta: DiscoveryMeta = {
      claudeDir,
      since: sinceDate,
      until: untilDate,
      filesScanned,
      sessionsMatched: filtered.length,
      errors,
    };

    const output = { meta, sessions: filtered };
    console.log(JSON.stringify(output, null, 2));
  }

  console.error(
    `[session-discovery] Done. Scanned ${filesScanned} files, found ${filtered.length} session(s)${minUserMessages > 0 ? ` (filtered from ${sessions.length}, min ${minUserMessages} user messages)` : ""}.`
  );
}

main().catch((e) => {
  console.error(`[session-discovery] Fatal: ${e.message}`);
  process.exit(1);
});
