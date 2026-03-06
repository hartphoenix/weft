#!/usr/bin/env bun
/**
 * session-extract.ts
 *
 * Extracts filtered, readable conversation text from a Claude Code
 * JSONL session log. Designed for consumption by session-digest and
 * other skills that need transcript content without raw JSONL parsing.
 *
 * Usage:
 *   bun run scripts/session-extract.ts <path-to-jsonl>
 *   bun run scripts/session-extract.ts <path-to-jsonl> --max-assistant-chars 800
 *   bun run scripts/session-extract.ts <path-to-jsonl> --include-tool-output
 *   bun run scripts/session-extract.ts <path-to-jsonl> --json
 *
 * Output: Filtered conversation text to stdout. Diagnostics to stderr.
 */

import { basename } from "node:path";
import { parseArgs } from "node:util";

// --- Types ---

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
  signature?: string;
  id?: string;
  name?: string;
  input?: Record<string, any>;
  tool_use_id?: string;
  content?: string | ContentBlock[];
  is_error?: boolean;
}

interface JSONLEntry {
  type: string;
  timestamp?: string;
  sessionId?: string;
  message?: {
    role: string;
    content: string | ContentBlock[];
  };
}

interface ToolSummary {
  name: string;
  summary: string;
}

interface ToolError {
  tool: string;
  content: string;
}

interface ExtractedTurn {
  role: "user" | "assistant";
  turnNumber: number;
  timestamp: string;
  text: string;
  truncated?: boolean;
  tools?: ToolSummary[];
  errors?: ToolError[];
}

// --- Config ---

const noisePatterns = [
  /^<ide_opened_file>/,
  /^<system-reminder>/,
  /^<command-message>/,
  /^<command-name>/,
  /^<local-command/,
  /^<available-deferred-tools>/,
];

// --- Arg parsing ---

const { values: args, positionals } = parseArgs({
  options: {
    "max-assistant-chars": { type: "string", default: "500" },
    "include-tool-output": { type: "boolean", default: false },
    json: { type: "boolean", default: false },
  },
  allowPositionals: true,
  strict: true,
});

const filePath = positionals[0];
const maxAssistantChars = parseInt(args["max-assistant-chars"] ?? "500", 10);
const includeToolOutput = args["include-tool-output"] ?? false;
const jsonOutput = args["json"] ?? false;

if (!filePath) {
  console.error("Usage: bun run session-extract.ts <path-to-jsonl> [options]");
  console.error("Options:");
  console.error("  --max-assistant-chars N   Truncation limit (default: 500)");
  console.error("  --include-tool-output     Include tool result content");
  console.error("  --json                    Output structured JSON");
  process.exit(1);
}

// --- Tool summary formatting ---

function summarizeTool(name: string, input: Record<string, any>): string {
  switch (name) {
    case "Bash":
      return `Bash: ${(input.command ?? "").slice(0, 80)}`;
    case "Read":
      return `Read: ${basename(input.file_path ?? "")}`;
    case "Edit":
      return `Edit: ${basename(input.file_path ?? "")}`;
    case "Write":
      return `Write: ${basename(input.file_path ?? "")}`;
    case "Glob":
      return `Glob: ${input.pattern ?? ""}${input.path ? ` in ${basename(input.path)}` : ""}`;
    case "Grep":
      return `Grep: ${input.pattern ?? ""}${input.path ? ` in ${basename(input.path)}` : ""}`;
    case "Agent":
      return `Agent: ${input.description ?? input.subagent_type ?? ""}`;
    case "Skill":
      return `Skill: ${input.skillName ?? ""}`;
    case "WebFetch":
      return `WebFetch: ${(input.url ?? "").slice(0, 60)}`;
    case "WebSearch":
      return `WebSearch: ${(input.query ?? "").slice(0, 60)}`;
    case "ToolSearch":
      return `ToolSearch: ${(input.query ?? "").slice(0, 60)}`;
    default:
      return name;
  }
}

// --- Content extraction ---

function isNoise(text: string): boolean {
  const trimmed = text.trim();
  return noisePatterns.some((p) => p.test(trimmed));
}

function extractTextFromContent(
  content: string | ContentBlock[]
): { texts: string[]; toolResults: ContentBlock[] } {
  const texts: string[] = [];
  const toolResults: ContentBlock[] = [];

  if (typeof content === "string") {
    if (!isNoise(content)) texts.push(content.trim());
    return { texts, toolResults };
  }

  for (const block of content) {
    if (block.type === "text" && block.text) {
      if (!isNoise(block.text)) texts.push(block.text.trim());
    } else if (block.type === "tool_result") {
      toolResults.push(block);
    }
  }

  return { texts, toolResults };
}

function extractAssistantContent(
  content: string | ContentBlock[]
): { texts: string[]; tools: ToolSummary[]; truncated: boolean } {
  const texts: string[] = [];
  const tools: ToolSummary[] = [];
  let truncated = false;

  if (typeof content === "string") {
    if (content.length > maxAssistantChars) {
      texts.push(content.slice(0, maxAssistantChars));
      truncated = true;
    } else {
      texts.push(content);
    }
    return { texts, tools, truncated };
  }

  for (const block of content) {
    if (block.type === "thinking" || block.type === "signature") continue;

    if (block.type === "text" && block.text) {
      if (isNoise(block.text)) continue;
      const text = block.text.trim();
      if (text.length > maxAssistantChars) {
        texts.push(text.slice(0, maxAssistantChars));
        truncated = true;
      } else {
        texts.push(text);
      }
    } else if (block.type === "tool_use" && block.name) {
      tools.push({
        name: block.name,
        summary: summarizeTool(block.name, block.input ?? {}),
      });
    }
  }

  return { texts, tools, truncated };
}

// --- Main ---

async function main() {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    console.error(`[session-extract] File not found: ${filePath}`);
    process.exit(1);
  }

  const raw = await file.text();
  const lines = raw.split("\n");

  // tool_use_id -> tool name map for error correlation
  const toolMap = new Map<string, string>();

  const turns: ExtractedTurn[] = [];
  let userCount = 0;
  let assistantCount = 0;
  let toolCallCount = 0;
  let toolErrorCount = 0;
  let sessionId = "";
  let firstTimestamp = "";
  let lastTimestamp = "";
  let malformedLines = 0;

  // Pending errors to attach to the previous assistant turn
  const pendingErrors: ToolError[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    let entry: JSONLEntry;
    try {
      entry = JSON.parse(line);
    } catch {
      malformedLines++;
      console.error(`[session-extract] Skipping malformed line ${i + 1}`);
      continue;
    }

    // Track session metadata
    if (!sessionId && entry.sessionId) sessionId = entry.sessionId;
    if (!firstTimestamp && entry.timestamp) firstTimestamp = entry.timestamp;
    if (entry.timestamp) lastTimestamp = entry.timestamp;

    // Only process user and assistant messages
    if (entry.type !== "user" && entry.type !== "assistant") continue;
    if (!entry.message) continue;

    const timestamp = entry.timestamp ?? "";
    const timeStr = timestamp.slice(11, 16); // HH:MM

    if (entry.type === "user") {
      const { texts, toolResults } = extractTextFromContent(entry.message.content);

      // Process tool result errors (attach to previous assistant turn)
      for (const tr of toolResults) {
        if (tr.is_error) {
          const errorContent =
            typeof tr.content === "string"
              ? tr.content
              : JSON.stringify(tr.content);
          const toolName = tr.tool_use_id
            ? toolMap.get(tr.tool_use_id) ?? "unknown"
            : "unknown";
          const error: ToolError = {
            tool: toolName,
            content: errorContent.slice(0, 200),
          };
          toolErrorCount++;

          // Attach to previous assistant turn if exists
          const lastAssistant = turns.findLast((t) => t.role === "assistant");
          if (lastAssistant) {
            if (!lastAssistant.errors) lastAssistant.errors = [];
            lastAssistant.errors.push(error);
          } else {
            pendingErrors.push(error);
          }
        } else if (includeToolOutput) {
          // Include non-error tool output when flag is set
          const content =
            typeof tr.content === "string"
              ? tr.content
              : JSON.stringify(tr.content);
          const toolName = tr.tool_use_id
            ? toolMap.get(tr.tool_use_id) ?? "tool"
            : "tool";
          const lastAssistant = turns.findLast((t) => t.role === "assistant");
          if (lastAssistant) {
            if (!lastAssistant.tools) lastAssistant.tools = [];
            lastAssistant.tools.push({
              name: toolName,
              summary: `${toolName} output: ${content.slice(0, 200)}`,
            });
          }
        }
      }

      // Only emit user turn if there's actual user text
      if (texts.length > 0) {
        userCount++;
        turns.push({
          role: "user",
          turnNumber: userCount,
          timestamp,
          text: texts.join("\n"),
        });
      }
    } else if (entry.type === "assistant") {
      const { texts, tools, truncated } = extractAssistantContent(
        entry.message.content
      );

      // Register tool IDs for error correlation
      if (Array.isArray(entry.message.content)) {
        for (const block of entry.message.content) {
          if (block.type === "tool_use" && block.id && block.name) {
            toolMap.set(block.id, block.name);
          }
        }
      }

      toolCallCount += tools.length;

      // Only emit assistant turn if there's text content
      if (texts.length > 0 || tools.length > 0) {
        assistantCount++;
        const turn: ExtractedTurn = {
          role: "assistant",
          turnNumber: assistantCount,
          timestamp,
          text: texts.join("\n"),
          tools: tools.length > 0 ? tools : undefined,
        };
        if (truncated) turn.truncated = true;

        // Attach any pending errors
        if (pendingErrors.length > 0) {
          turn.errors = [...pendingErrors];
          pendingErrors.length = 0;
        }

        turns.push(turn);
      }
    }
  }

  // --- Output ---

  console.error(
    `[session-extract] ${sessionId.slice(0, 8)} | ${userCount + assistantCount} turns (${userCount} user, ${assistantCount} assistant) | ${toolCallCount} tool calls | ${toolErrorCount} errors${malformedLines > 0 ? ` | ${malformedLines} malformed lines` : ""}`
  );

  if (jsonOutput) {
    const output = {
      sessionId,
      timeRange: { start: firstTimestamp, end: lastTimestamp },
      turns,
      stats: {
        userTurns: userCount,
        assistantTurns: assistantCount,
        toolCalls: toolCallCount,
        toolErrors: toolErrorCount,
      },
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    // Text output
    for (const turn of turns) {
      const timeStr = (turn.timestamp ?? "").slice(11, 16);
      const tag =
        turn.role === "user"
          ? `[U${turn.turnNumber} ${timeStr}]`
          : `[A${turn.turnNumber} ${timeStr}]`;

      if (turn.text) {
        const textDisplay = turn.truncated
          ? turn.text + " [...truncated]"
          : turn.text;
        console.log(`${tag} ${textDisplay}`);
      }

      if (turn.tools) {
        for (const tool of turn.tools) {
          console.log(`  -> ${tool.summary}`);
        }
      }

      if (turn.errors) {
        for (const err of turn.errors) {
          console.log(`  x ${err.tool} failed: ${err.content}`);
        }
      }
    }
  }
}

main().catch((e) => {
  console.error(`[session-extract] Fatal: ${e.message}`);
  process.exit(1);
});
