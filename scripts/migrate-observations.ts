#!/usr/bin/env bun
/**
 * migrate-observations.ts
 *
 * Maps a learner's existing observations (scores, gap types, assessment
 * history) from current-state.md YAML onto curriculum-derived concept IDs
 * in a domain graph.
 *
 * Usage:
 *   bun run scripts/migrate-observations.ts \
 *     --learning-dir /path/to/learner/learning \
 *     --domain-graph /path/to/domains/web-development.domain.json \
 *     --out /path/to/learner/learning/state/web-development.state.json
 *
 *   bun run scripts/migrate-observations.ts \
 *     --learning-dir /path/to/learner/learning \
 *     --domain-graph /path/to/domains/web-development.domain.json \
 *     --dry-run
 *
 * Output: Writes learner state JSON to --out path. Reports to stdout.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { parseArgs } from "node:util";

import type { DomainGraph } from "./types/domain-graph";
import type {
  LearnerState,
  ConceptObservation,
  Assessment,
  BridgeHypothesis,
  Goal,
} from "./types/learner-state";

// --- Arg parsing ---

const { values: args } = parseArgs({
  options: {
    "learning-dir": { type: "string" },
    "domain-graph": { type: "string" },
    out: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
  strict: true,
});

const learningDir = args["learning-dir"];
const domainGraphPath = args["domain-graph"];
const dryRun = args["dry-run"] ?? false;

if (!learningDir || !domainGraphPath) {
  console.error("Usage: bun run scripts/migrate-observations.ts \\");
  console.error("  --learning-dir <path> --domain-graph <path> [--out <path>] [--dry-run]");
  process.exit(1);
}

// --- YAML-ish parser for current-state.md ---
// current-state.md uses a subset of YAML embedded in markdown.
// We parse it pragmatically rather than pulling in a YAML library.

interface LegacyConcept {
  name: string;
  arc: string;
  score: number | null;
  gap: string | null;
  fluencyTarget: string | null;
  source: string | null;
  lastQuizzed: string | null;
  timesQuizzed: number;
  note: string | null;
  history: Array<{
    date: string;
    score: number | null;
    source?: string;
    note?: string;
  }>;
}

interface LegacyArc {
  name: string;
  description: string;
  status: string;
}

function parseCurrentState(filePath: string): {
  arcs: LegacyArc[];
  concepts: LegacyConcept[];
} {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  const arcs: LegacyArc[] = [];
  const concepts: LegacyConcept[] = [];

  let section: "none" | "arcs" | "concepts" = "none";
  let currentItem: Record<string, any> | null = null;
  let inHistory = false;
  let historyItems: any[] = [];

  for (const line of lines) {
    // Section detection
    if (line.match(/^arcs:\s*$/)) {
      section = "arcs";
      continue;
    }
    if (line.match(/^concepts:\s*$/)) {
      // Flush last arc
      if (section === "arcs" && currentItem) {
        arcs.push(currentItem as any);
      }
      section = "concepts";
      currentItem = null;
      inHistory = false;
      continue;
    }

    // Skip comments and empty lines outside items
    if (line.match(/^\s*#/) || line.match(/^\s*$/)) continue;

    if (section === "arcs") {
      const nameMatch = line.match(/^\s+-\s+name:\s+(.+)/);
      if (nameMatch) {
        if (currentItem) arcs.push(currentItem as any);
        currentItem = { name: nameMatch[1].trim(), description: "", status: "active" };
        continue;
      }
      if (currentItem) {
        const descMatch = line.match(/^\s+description:\s+(.+)/);
        if (descMatch) currentItem.description = descMatch[1].trim();
        const statusMatch = line.match(/^\s+status:\s+(.+)/);
        if (statusMatch) currentItem.status = statusMatch[1].trim();
        const noteMatch = line.match(/^\s+note:\s+(.+)/);
        if (noteMatch) currentItem.note = noteMatch[1].trim();
      }
    }

    if (section === "concepts") {
      const nameMatch = line.match(/^\s+-\s+name:\s+(.+)/);
      if (nameMatch) {
        // Flush previous concept
        if (currentItem) {
          if (inHistory) currentItem.history = historyItems;
          concepts.push(currentItem as any);
        }
        currentItem = {
          name: nameMatch[1].trim(),
          arc: "",
          score: null,
          gap: null,
          fluencyTarget: null,
          source: null,
          lastQuizzed: null,
          timesQuizzed: 0,
          note: null,
          history: [],
        };
        inHistory = false;
        historyItems = [];
        continue;
      }

      if (!currentItem) continue;

      // History items
      const historyStart = line.match(/^\s+history:\s*$/);
      if (historyStart) {
        inHistory = true;
        historyItems = [];
        continue;
      }

      if (inHistory) {
        // Parse inline history objects: - { date: ..., score: ..., note: ... }
        const histMatch = line.match(/^\s+-\s+\{(.+)\}\s*$/);
        if (histMatch) {
          const entry: any = {};
          const raw = histMatch[1];

          const dateM = raw.match(/date:\s+([\d-]+)/);
          if (dateM) entry.date = dateM[1];

          const scoreM = raw.match(/score:\s+(\d+|null)/);
          if (scoreM) entry.score = scoreM[1] === "null" ? null : parseInt(scoreM[1]);

          const sourceM = raw.match(/source:\s+([\w:.-]+)/);
          if (sourceM) entry.source = sourceM[1];

          const noteM = raw.match(/note:\s+(.+?)(?:,\s+(?:date|score|source):|$)/);
          if (noteM) {
            // Clean up the note — it may have trailing content
            let noteText = noteM[1].trim();
            // Remove trailing } or comma
            noteText = noteText.replace(/[,}]\s*$/, "").trim();
            entry.note = noteText;
          }

          historyItems.push(entry);
          continue;
        }
        // If line doesn't match history pattern, we're past history
        if (!line.match(/^\s+\s+/)) {
          inHistory = false;
          currentItem.history = historyItems;
        }
      }

      // Scalar fields
      const arcMatch = line.match(/^\s+arc:\s+(.+)/);
      if (arcMatch) { currentItem.arc = arcMatch[1].trim(); continue; }

      const scoreMatch = line.match(/^\s+score:\s+(\d+|null)/);
      if (scoreMatch) {
        currentItem.score = scoreMatch[1] === "null" ? null : parseInt(scoreMatch[1]);
        continue;
      }

      const gapMatch = line.match(/^\s+gap:\s+(.+)/);
      if (gapMatch) { currentItem.gap = gapMatch[1].trim(); continue; }

      const fluencyMatch = line.match(/^\s+fluency-target:\s+(.+)/);
      if (fluencyMatch) { currentItem.fluencyTarget = fluencyMatch[1].trim(); continue; }

      const sourceMatch = line.match(/^\s+source:\s+(.+)/);
      if (sourceMatch) { currentItem.source = sourceMatch[1].trim(); continue; }

      const lastQuizzedMatch = line.match(/^\s+last-quizzed:\s+(.+)/);
      if (lastQuizzedMatch) { currentItem.lastQuizzed = lastQuizzedMatch[1].trim(); continue; }

      const timesMatch = line.match(/^\s+times-quizzed:\s+(\d+)/);
      if (timesMatch) { currentItem.timesQuizzed = parseInt(timesMatch[1]); continue; }

      const noteMatch = line.match(/^\s+note:\s+(.+)/);
      if (noteMatch && !inHistory) { currentItem.note = noteMatch[1].trim(); continue; }
    }
  }

  // Flush last item
  if (section === "arcs" && currentItem) arcs.push(currentItem as any);
  if (section === "concepts" && currentItem) {
    if (inHistory) currentItem.history = historyItems;
    concepts.push(currentItem as any);
  }

  return { arcs, concepts };
}

// --- Slug generation ---

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// --- Bridge extraction from arcs.md ---

function extractBridges(arcsPath: string): BridgeHypothesis[] {
  if (!existsSync(arcsPath)) return [];

  const content = readFileSync(arcsPath, "utf-8");
  const bridges: BridgeHypothesis[] = [];

  // Look for bridge language patterns
  const bridgePatterns = [
    /(?:maps? to|transfers? from|similar to|bridges? (?:to|from)|analogous to)\s+["']?([^"'\n.]+)/gi,
  ];

  const lines = content.split("\n");
  for (const line of lines) {
    for (const pattern of bridgePatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line)) !== null) {
        bridges.push({
          from: match[1].trim(),
          to: "", // will need manual resolution
          status: "hypothesized",
          evidence: line.trim(),
          date: new Date().toISOString().slice(0, 10),
        });
      }
    }
  }

  return bridges;
}

// --- Goal extraction from goals.md ---

function extractGoals(goalsPath: string): Goal[] {
  if (!existsSync(goalsPath)) return [];

  const content = readFileSync(goalsPath, "utf-8");
  const goals: Goal[] = [];
  let priority = 1;

  // Parse ## headings as goals
  const sections = content.split(/^## /m).slice(1);
  for (const section of sections) {
    const lines = section.split("\n");
    const name = lines[0].trim();
    if (!name) continue;

    // Grab description from first non-empty line after heading
    const descLines = lines.slice(1).filter((l) => l.trim() && !l.startsWith("**"));
    const description = descLines[0]?.trim() ?? undefined;

    goals.push({
      id: toSlug(name),
      name,
      description,
      priority: priority++,
      status: "active",
    });
  }

  return goals;
}

// --- Concept matching ---

interface MatchResult {
  matched: Array<{ legacyName: string; conceptId: string; confidence: "exact" | "alias" }>;
  orphans: Array<{ legacyName: string; arc: string; score: number | null }>;
}

function matchConcepts(
  legacyConcepts: LegacyConcept[],
  graphConcepts: Record<string, { name: string }>
): MatchResult {
  const result: MatchResult = { matched: [], orphans: [] };

  // Build lookup maps
  const slugMap = new Map<string, string>(); // slug -> conceptId
  const nameMap = new Map<string, string>(); // lowercase name -> conceptId

  for (const [id, node] of Object.entries(graphConcepts)) {
    slugMap.set(id, id);
    nameMap.set(node.name.toLowerCase(), id);
  }

  for (const legacy of legacyConcepts) {
    const slug = toSlug(legacy.name);

    // Exact slug match
    if (slugMap.has(slug)) {
      result.matched.push({
        legacyName: legacy.name,
        conceptId: slug,
        confidence: "exact",
      });
      continue;
    }

    // Name match
    const byName = nameMap.get(legacy.name.toLowerCase());
    if (byName) {
      result.matched.push({
        legacyName: legacy.name,
        conceptId: byName,
        confidence: "alias",
      });
      continue;
    }

    // No match
    result.orphans.push({
      legacyName: legacy.name,
      arc: legacy.arc,
      score: legacy.score,
    });
  }

  return result;
}

// --- Build observation from legacy concept ---

function buildObservation(legacy: LegacyConcept): ConceptObservation {
  const assessments: Assessment[] = (legacy.history || []).map((h) => ({
    date: h.date,
    score: h.score ?? null,
    source: h.source ?? legacy.source ?? "import",
    gap: undefined,
    note: h.note,
    evidence: undefined,
    instrument: undefined,
  }));

  // Determine chunking state
  const isConsolidated = legacy.score !== null && legacy.score >= 4 && legacy.gap === null;

  return {
    score: legacy.score,
    gap: (legacy.gap as ConceptObservation["gap"]) ?? null,
    fluencyTarget: (legacy.fluencyTarget as "production" | "evaluation") ?? "production",
    chunkingState: isConsolidated ? "consolidated" : "early",
    chunkingSelfReport: undefined,
    lastAssessed: legacy.lastQuizzed,
    timesAssessed: legacy.timesQuizzed || assessments.length,
    assessments,
  };
}

// --- Main ---

function main() {
  const currentStatePath = join(learningDir!, "current-state.md");
  const arcsPath = join(learningDir!, "arcs.md");
  const goalsPath = join(learningDir!, "goals.md");

  // Load and parse
  if (!existsSync(currentStatePath)) {
    console.error(`[migrate] current-state.md not found at: ${currentStatePath}`);
    process.exit(1);
  }

  const graphJson = readFileSync(domainGraphPath!, "utf-8");
  const graph: DomainGraph = JSON.parse(graphJson);

  const { arcs, concepts: legacyConcepts } = parseCurrentState(currentStatePath);

  console.log(`[migrate] Parsed ${legacyConcepts.length} concepts from current-state.md`);
  console.log(`[migrate] Domain graph "${graph.meta.name}" has ${Object.keys(graph.concepts).length} concepts`);

  // Match concepts
  const { matched, orphans } = matchConcepts(legacyConcepts, graph.concepts);

  console.log(`\n--- Match Results ---`);
  console.log(`Matched: ${matched.length}`);
  for (const m of matched) {
    console.log(`  ${m.confidence === "exact" ? "=" : "~"} ${m.legacyName} -> ${m.conceptId}`);
  }

  console.log(`\nOrphans: ${orphans.length}`);
  for (const o of orphans) {
    console.log(`  ? ${o.legacyName} (arc: ${o.arc}, score: ${o.score})`);
  }

  // Build observations
  const observations: Record<string, ConceptObservation> = {};
  const legacyByName = new Map(legacyConcepts.map((c) => [c.name, c]));

  for (const m of matched) {
    const legacy = legacyByName.get(m.legacyName);
    if (legacy) {
      observations[m.conceptId] = buildObservation(legacy);
    }
  }

  // Extract bridges and goals
  const bridges = extractBridges(arcsPath);
  const goals = extractGoals(goalsPath);

  console.log(`\nBridges found: ${bridges.length}`);
  console.log(`Goals found: ${goals.length}`);

  // Build learner state
  const today = new Date().toISOString().slice(0, 10);
  const state: LearnerState = {
    meta: {
      learnerId: "hart",
      domainGraphId: graph.meta.id,
      domainGraphVersion: graph.meta.version,
      created: today,
      lastModified: today,
    },
    observations,
    bridges,
    goals,
  };

  if (dryRun) {
    console.log("\n--- Dry Run (no files written) ---");
    console.log(`Would write ${Object.keys(observations).length} observations`);
    console.log(`Would write ${bridges.length} bridges`);
    console.log(`Would write ${goals.length} goals`);
    console.log("\nOrphans need manual resolution:");
    for (const o of orphans) {
      console.log(`  ${o.legacyName} -> [unmapped]`);
    }
    return;
  }

  // Determine output path
  const domainSlug = graph.meta.id;
  const outPath =
    args.out ?? join(learningDir!, "state", `${domainSlug}.state.json`);

  // Ensure directory exists
  const outDir = dirname(outPath);
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  writeFileSync(outPath, JSON.stringify(state, null, 2));
  console.log(`\n[migrate] Wrote learner state to: ${outPath}`);
  console.log(`[migrate] ${Object.keys(observations).length} observations, ${bridges.length} bridges, ${goals.length} goals`);

  if (orphans.length > 0) {
    console.log(`\n[migrate] ${orphans.length} orphan(s) need manual resolution.`);
    console.log(`[migrate] These concepts exist in current-state.md but not in the domain graph.`);
    console.log(`[migrate] They can become horizon nodes or be dropped if tracking noise.`);
  }
}

main();
