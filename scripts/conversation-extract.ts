#!/usr/bin/env bun
/**
 * conversation-extract.ts
 *
 * Extracts filtered, readable conversation text from claude.ai or
 * ChatGPT JSON conversation exports. Auto-detects the format.
 *
 * Usage:
 *   bun run scripts/conversation-extract.ts <path-to-json>
 *   bun run scripts/conversation-extract.ts <path-to-json> --list
 *   bun run scripts/conversation-extract.ts <path-to-json> --conversation <uuid>
 *   bun run scripts/conversation-extract.ts <path-to-json> --since 2025-01-01
 *   bun run scripts/conversation-extract.ts <path-to-json> --min-messages 5
 *   bun run scripts/conversation-extract.ts <path-to-json> --max-assistant-chars 300
 *   bun run scripts/conversation-extract.ts <path-to-json> --json
 *
 * Output: Filtered conversation text to stdout. Diagnostics to stderr.
 */

import { parseArgs } from "node:util";

// --- Shared types ---

interface ExtractedTurn {
  role: "human" | "assistant";
  turnNumber: number;
  timestamp: string; // ISO 8601
  text: string;
  truncated?: boolean;
  tools?: { name: string; summary: string }[];
  errors?: { tool: string; content: string }[];
  files?: string[];
}

interface NormalizedConversation {
  uuid: string;
  name: string;
  created_at: string; // ISO 8601
  messageCount: number;
}

interface ExtractedConversation extends NormalizedConversation {
  turns: ExtractedTurn[];
}

// --- Claude.ai types ---

interface ClaudeContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, any>;
  content?: string | ClaudeContentBlock[];
  is_error?: boolean;
}

interface ClaudeChatMessage {
  uuid: string;
  text: string;
  sender: "human" | "assistant";
  created_at: string;
  content: ClaudeContentBlock[];
  files?: { file_name: string; file_type: string }[];
  attachments?: { file_name?: string; file_type?: string }[];
}

interface ClaudeConversation {
  uuid: string;
  name: string;
  created_at: string;
  updated_at: string;
  chat_messages: ClaudeChatMessage[];
}

// --- ChatGPT types ---

interface GPTMappingNode {
  message: {
    id: string;
    author: { role: string; name?: string };
    create_time: number | null;
    content: {
      content_type: string;
      parts?: any[];
    };
    status?: string;
    metadata?: Record<string, any>;
    recipient?: string;
  } | null;
  parent: string | null;
  children: string[];
}

interface GPTConversation {
  id: string;
  title: string;
  create_time: number;
  update_time: number;
  current_node: string;
  mapping: Record<string, GPTMappingNode>;
}

// --- Arg parsing ---

const { values: args, positionals } = parseArgs({
  options: {
    list: { type: "boolean", default: false },
    conversation: { type: "string" },
    since: { type: "string" },
    "min-messages": { type: "string" },
    "max-assistant-chars": { type: "string", default: "500" },
    json: { type: "boolean", default: false },
  },
  allowPositionals: true,
  strict: true,
});

const filePath = positionals[0];
const listMode = args.list ?? false;
const conversationId = args.conversation;
const sinceDate = args.since;
const minMessages = parseInt(args["min-messages"] ?? "0", 10);
const maxAssistantChars = parseInt(args["max-assistant-chars"] ?? "500", 10);
const jsonOutput = args.json ?? false;

if (!filePath) {
  console.error(
    "Usage: bun run conversation-extract.ts <path-to-json> [options]"
  );
  console.error("Options:");
  console.error("  --list                     List conversations (manifest)");
  console.error("  --conversation <uuid>      Extract a single conversation");
  console.error("  --since <date>             Filter by created_at >= date");
  console.error("  --min-messages N           Filter by minimum message count");
  console.error(
    "  --max-assistant-chars N    Truncation limit (default: 500)"
  );
  console.error("  --json                     Output structured JSON");
  process.exit(1);
}

// --- Format detection ---

type Format = "claude" | "chatgpt";

function detectFormat(data: any[]): Format | null {
  const sample = data[0];
  if (!sample || typeof sample !== "object") return null;
  if (Array.isArray(sample.chat_messages)) return "claude";
  if (sample.mapping && typeof sample.mapping === "object") return "chatgpt";
  return null;
}

// --- Timestamp helpers ---

function epochToISO(epoch: number | null): string {
  if (!epoch) return "";
  return new Date(epoch * 1000).toISOString();
}

// --- Tool summary (shared) ---

function summarizeTool(name: string, input: Record<string, any>): string {
  if (!input || typeof input !== "object") return name;
  const hint =
    input.command?.slice(0, 80) ||
    input.query?.slice(0, 60) ||
    input.url?.slice(0, 60) ||
    "";
  return hint ? `${name}: ${hint}` : name;
}

// --- Claude extraction ---

function extractClaudeConversation(
  conv: ClaudeConversation
): ExtractedConversation {
  const turns: ExtractedTurn[] = [];
  let humanCount = 0;
  let assistantCount = 0;

  for (const msg of conv.chat_messages) {
    if (msg.sender === "human") {
      humanCount++;
      const text = (msg.text ?? "").trim();
      if (!text) continue;

      const files: string[] = [];
      for (const f of msg.files ?? []) {
        if (f.file_name)
          files.push(`${f.file_name} (${f.file_type ?? "file"})`);
      }
      for (const a of msg.attachments ?? []) {
        if (a.file_name)
          files.push(`${a.file_name} (${a.file_type ?? "file"})`);
      }

      turns.push({
        role: "human",
        turnNumber: humanCount,
        timestamp: msg.created_at ?? "",
        text,
        files: files.length > 0 ? files : undefined,
      });
    } else if (msg.sender === "assistant") {
      assistantCount++;
      const texts: string[] = [];
      const tools: { name: string; summary: string }[] = [];
      const errors: { tool: string; content: string }[] = [];
      let truncated = false;

      const hasTools = msg.content?.some(
        (b) => b.type === "tool_use" || b.type === "tool_result"
      );

      if (!hasTools && msg.text) {
        const text = msg.text.trim();
        if (text.length > maxAssistantChars) {
          texts.push(text.slice(0, maxAssistantChars));
          truncated = true;
        } else {
          texts.push(text);
        }
      } else if (msg.content) {
        for (const block of msg.content) {
          if (block.type === "text" && block.text) {
            const text = block.text.trim();
            if (!text) continue;
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
          } else if (block.type === "tool_result" && block.is_error) {
            const content =
              typeof block.content === "string"
                ? block.content
                : JSON.stringify(block.content);
            errors.push({
              tool: "tool",
              content: (content ?? "").slice(0, 200),
            });
          }
        }
      }

      if (texts.length > 0 || tools.length > 0) {
        turns.push({
          role: "assistant",
          turnNumber: assistantCount,
          timestamp: msg.created_at ?? "",
          text: texts.join("\n"),
          truncated: truncated || undefined,
          tools: tools.length > 0 ? tools : undefined,
          errors: errors.length > 0 ? errors : undefined,
        });
      }
    }
  }

  return {
    uuid: conv.uuid,
    name: conv.name,
    created_at: conv.created_at,
    messageCount: conv.chat_messages.length,
    turns,
  };
}

function normalizeClaude(conv: ClaudeConversation): NormalizedConversation {
  return {
    uuid: conv.uuid,
    name: conv.name,
    created_at: conv.created_at,
    messageCount: conv.chat_messages.length,
  };
}

// --- ChatGPT extraction ---

/** Walk the mapping tree backward from current_node to reconstruct the active thread. */
function walkGPTThread(conv: GPTConversation): GPTMappingNode["message"][] {
  const messages: GPTMappingNode["message"][] = [];
  let nodeId: string | null = conv.current_node;

  while (nodeId) {
    const node = conv.mapping[nodeId];
    if (!node) break;
    if (node.message) messages.push(node.message);
    nodeId = node.parent;
  }

  messages.reverse();
  return messages;
}

function extractGPTTextFromParts(parts: any[]): string {
  const texts: string[] = [];
  for (const part of parts) {
    if (typeof part === "string") {
      texts.push(part);
    } else if (part && typeof part === "object") {
      // Image/asset pointers — emit a marker
      if (part.asset_pointer) {
        texts.push(`[image]`);
      } else if (part.content_type === "image_asset_pointer") {
        texts.push(`[image]`);
      }
    }
  }
  return texts.join("\n").trim();
}

function countGPTMessages(conv: GPTConversation): number {
  let count = 0;
  for (const node of Object.values(conv.mapping)) {
    if (
      node.message &&
      (node.message.author.role === "user" ||
        node.message.author.role === "assistant")
    ) {
      count++;
    }
  }
  return count;
}

function extractGPTConversation(
  conv: GPTConversation
): ExtractedConversation {
  const thread = walkGPTThread(conv);
  const turns: ExtractedTurn[] = [];
  let humanCount = 0;
  let assistantCount = 0;

  for (const msg of thread) {
    if (!msg) continue;
    const role = msg.author.role;
    const timestamp = epochToISO(msg.create_time);
    const parts = msg.content?.parts ?? [];
    const contentType = msg.content?.content_type ?? "text";

    if (role === "user") {
      const text = extractGPTTextFromParts(parts);
      if (!text) continue;
      humanCount++;
      turns.push({
        role: "human",
        turnNumber: humanCount,
        timestamp,
        text,
      });
    } else if (role === "assistant") {
      // Tool-role messages from the assistant (e.g., DALL-E, browsing)
      // are separate messages with author.name set — summarize them
      if (msg.author.name) {
        const toolName = msg.author.name;
        const text = extractGPTTextFromParts(parts);
        // Attach as a tool annotation on the previous assistant turn
        const lastAssistant = turns.findLast((t) => t.role === "assistant");
        if (lastAssistant) {
          if (!lastAssistant.tools) lastAssistant.tools = [];
          lastAssistant.tools.push({
            name: toolName,
            summary: text
              ? `${toolName}: ${text.slice(0, 80)}`
              : toolName,
          });
        }
        continue;
      }

      const rawText = extractGPTTextFromParts(parts);
      if (!rawText) continue;
      assistantCount++;

      let text = rawText;
      let truncated = false;
      if (text.length > maxAssistantChars) {
        text = text.slice(0, maxAssistantChars);
        truncated = true;
      }

      turns.push({
        role: "assistant",
        turnNumber: assistantCount,
        timestamp,
        text,
        truncated: truncated || undefined,
      });
    } else if (role === "tool") {
      // Tool results — attach errors to the previous assistant turn
      const text = extractGPTTextFromParts(parts);
      const toolName = msg.author.name ?? "tool";
      if (msg.status && msg.status !== "finished_successfully" && text) {
        const lastAssistant = turns.findLast((t) => t.role === "assistant");
        if (lastAssistant) {
          if (!lastAssistant.errors) lastAssistant.errors = [];
          lastAssistant.errors.push({
            tool: toolName,
            content: text.slice(0, 200),
          });
        }
      }
      // Skip system messages and other roles
    }
  }

  return {
    uuid: conv.id,
    name: conv.title ?? "(untitled)",
    created_at: epochToISO(conv.create_time),
    messageCount: countGPTMessages(conv),
    turns,
  };
}

function normalizeGPT(conv: GPTConversation): NormalizedConversation {
  return {
    uuid: conv.id,
    name: conv.title ?? "(untitled)",
    created_at: epochToISO(conv.create_time),
    messageCount: countGPTMessages(conv),
  };
}

// --- Output formatting ---

function formatManifestLine(conv: NormalizedConversation): string {
  const prefix = conv.uuid.slice(0, 8);
  const date = conv.created_at.slice(0, 10);
  const count = conv.messageCount;
  const msgs = `${String(count).padStart(3)} msgs`;
  return `${prefix}  ${date}  ${msgs}  "${conv.name}"`;
}

function formatConversation(extracted: ExtractedConversation): string {
  const lines: string[] = [];
  const date = extracted.created_at.slice(0, 10);
  lines.push(
    `=== Conversation: "${extracted.name}" (${date}, ${extracted.messageCount} messages) ===`
  );
  lines.push("");

  for (const turn of extracted.turns) {
    const timeStr = (turn.timestamp ?? "").slice(11, 16);
    const tag =
      turn.role === "human"
        ? `[H${turn.turnNumber} ${timeStr}]`
        : `[C${turn.turnNumber} ${timeStr}]`;

    if (turn.text) {
      const textDisplay = turn.truncated
        ? turn.text + " [...truncated]"
        : turn.text;
      lines.push(`${tag} ${textDisplay}`);
    }

    if (turn.files) {
      for (const f of turn.files) {
        lines.push(`  [file: ${f}]`);
      }
    }

    if (turn.tools) {
      for (const tool of turn.tools) {
        lines.push(`  -> ${tool.summary}`);
      }
    }

    if (turn.errors) {
      for (const err of turn.errors) {
        lines.push(`  x ${err.tool} failed: ${err.content}`);
      }
    }
  }

  return lines.join("\n");
}

// --- Main ---

async function main() {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    console.error(`[conversation-extract] File not found: ${filePath}`);
    process.exit(1);
  }

  let data: unknown;
  try {
    data = await file.json();
  } catch (e: any) {
    console.error(`[conversation-extract] JSON parse error: ${e.message}`);
    process.exit(1);
  }

  if (!Array.isArray(data)) {
    console.error("Not a conversation archive.");
    process.exit(1);
  }

  if (data.length === 0) {
    console.error("[conversation-extract] 0 conversations");
    process.exit(0);
  }

  const format = detectFormat(data);
  if (!format) {
    console.error("Not a conversation archive.");
    process.exit(1);
  }

  console.error(`[conversation-extract] Detected format: ${format}`);

  // Normalize to common shape for filtering
  let normalized: NormalizedConversation[];
  if (format === "claude") {
    normalized = (data as ClaudeConversation[]).map(normalizeClaude);
  } else {
    normalized = (data as GPTConversation[]).map(normalizeGPT);
  }

  // Build index for extraction later
  const dataByUuid = new Map<string, any>();
  for (let i = 0; i < data.length; i++) {
    dataByUuid.set(normalized[i].uuid, data[i]);
  }

  // Apply filters
  let filtered = normalized;

  if (sinceDate) {
    filtered = filtered.filter((c) => c.created_at >= sinceDate);
  }
  if (minMessages > 0) {
    filtered = filtered.filter((c) => c.messageCount >= minMessages);
  }
  if (conversationId) {
    filtered = filtered.filter(
      (c) =>
        c.uuid === conversationId || c.uuid.startsWith(conversationId)
    );
  }

  filtered.sort((a, b) => a.created_at.localeCompare(b.created_at));

  console.error(
    `[conversation-extract] ${filtered.length} conversations${
      sinceDate ? ` since ${sinceDate}` : ""
    }${minMessages > 0 ? ` with >= ${minMessages} messages` : ""}`
  );

  if (filtered.length === 0) {
    process.exit(0);
  }

  // List mode
  if (listMode) {
    if (jsonOutput) {
      const manifest = filtered.map((c) => ({
        uuid: c.uuid,
        name: c.name,
        created_at: c.created_at.slice(0, 10),
        messages: c.messageCount,
      }));
      console.log(JSON.stringify(manifest, null, 2));
    } else {
      for (const conv of filtered) {
        console.log(formatManifestLine(conv));
      }
    }
    return;
  }

  // Extraction mode
  const extractFn =
    format === "claude" ? extractClaudeConversation : extractGPTConversation;

  const extracted = filtered.map((c) => extractFn(dataByUuid.get(c.uuid)));

  if (jsonOutput) {
    console.log(JSON.stringify(extracted, null, 2));
  } else {
    const output = extracted.map(formatConversation).join("\n\n");
    console.log(output);
  }
}

main().catch((e) => {
  console.error(`[conversation-extract] Fatal: ${e.message}`);
  process.exit(1);
});
