#!/usr/bin/env bun
/**
 * graph-queries.ts
 *
 * Query library for domain graphs and learner state.
 * Functions operate on both structures — the scripts that skills invoke.
 *
 * Key terms:
 * - Outer fringe: (concept, next-score-level) pairs where all prerequisites
 *   are met. What's ready to learn next. From Knowledge Space Theory.
 * - Dynamic surmise relation: learner-specific prerequisite graph combining
 *   Q_hard + Q_bridge + Q_altitude constraints.
 * - Interaction matrix (2x3): {early, consolidated} x {conceptual,
 *   procedural, recall} -> practice mode recommendation.
 *
 * Usage:
 *   bun run scripts/lib/graph-queries.ts --graph <path> --state <path> \
 *     --query <fringe|priority|practice|coverage> [--concept <id>] [--top <N>]
 */

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import type {
  DomainGraph,
  ConceptNode,
  PrerequisiteEdge,
} from "../types/domain-graph";
import type { LearnerState, ConceptObservation } from "../types/learner-state";

// --- Load and validate ---

export function loadDomainGraph(path: string): DomainGraph {
  const raw = readFileSync(path, "utf-8");
  const graph: DomainGraph = JSON.parse(raw);

  // Basic validation
  if (!graph.meta?.id) throw new Error("Domain graph missing meta.id");
  if (!graph.concepts) throw new Error("Domain graph missing concepts");
  if (!graph.relations) throw new Error("Domain graph missing relations");

  // Validate all edge targets exist
  for (const edge of graph.relations) {
    if (!graph.concepts[edge.from]) {
      throw new Error(`Edge references unknown concept: ${edge.from}`);
    }
    if (!graph.concepts[edge.to]) {
      throw new Error(`Edge references unknown concept: ${edge.to}`);
    }
  }

  // Validate composition bidirectionality
  for (const [id, node] of Object.entries(graph.concepts)) {
    for (const childId of node.composedOf ?? []) {
      const child = graph.concepts[childId];
      if (!child) throw new Error(`composedOf references unknown: ${childId}`);
      if (!child.composesInto.includes(id)) {
        throw new Error(
          `Bidirectional composition broken: ${id}.composedOf includes ${childId} but ${childId}.composesInto missing ${id}`
        );
      }
    }
  }

  return graph;
}

export function loadLearnerState(path: string): LearnerState {
  const raw = readFileSync(path, "utf-8");
  const state: LearnerState = JSON.parse(raw);

  if (!state.meta?.domainGraphId)
    throw new Error("Learner state missing meta.domainGraphId");
  if (!state.observations) throw new Error("Learner state missing observations");

  return state;
}

// --- Helper: get score for a concept ---

function getScore(state: LearnerState, conceptId: string): number {
  return state.observations[conceptId]?.score ?? 0;
}

function getChunkingState(
  state: LearnerState,
  conceptId: string
): "early" | "consolidated" {
  return state.observations[conceptId]?.chunkingState ?? "early";
}

// --- Prerequisite check ---

function prerequisitesMet(
  graph: DomainGraph,
  state: LearnerState,
  conceptId: string
): boolean {
  const edges = graph.relations.filter((e) => e.from === conceptId);
  if (edges.length === 0) return true;

  // Group edges
  const ungrouped = edges.filter((e) => !e.group);
  const grouped = new Map<string, PrerequisiteEdge[]>();

  for (const e of edges) {
    if (e.group) {
      const list = grouped.get(e.group) ?? [];
      list.push(e);
      grouped.set(e.group, list);
    }
  }

  // Ungrouped edges are implicitly AND
  for (const e of ungrouped) {
    if (getScore(state, e.to) < e.minLevel) return false;
  }

  // Grouped edges: check logic
  for (const [, groupEdges] of grouped) {
    const logic = groupEdges[0].logic; // all edges in group share logic

    if (logic === "and") {
      for (const e of groupEdges) {
        if (getScore(state, e.to) < e.minLevel) return false;
      }
    } else {
      // OR: at least one must be met
      const anyMet = groupEdges.some(
        (e) => getScore(state, e.to) >= e.minLevel
      );
      if (!anyMet) return false;
    }
  }

  return true;
}

// --- Outer fringe ---

export interface FringeItem {
  conceptId: string;
  currentScore: number;
  nextLevel: number;
  maxLevel: number;
  arc: string;
}

export function getOuterFringe(
  graph: DomainGraph,
  state: LearnerState
): FringeItem[] {
  const fringe: FringeItem[] = [];

  for (const [id, node] of Object.entries(graph.concepts)) {
    if (node.type === "horizon") continue;

    const score = getScore(state, id);
    const maxScore = node.complexityRange?.max ?? 5;

    // Already at max
    if (score >= maxScore) continue;

    // Check prerequisites
    if (!prerequisitesMet(graph, state, id)) continue;

    // Check threshold gate: if any prerequisite is a threshold concept,
    // it must be consolidated (not just scored)
    const thresholdGate = graph.relations
      .filter((e) => e.from === id)
      .some((e) => {
        const prereq = graph.concepts[e.to];
        return prereq?.isThreshold && getChunkingState(state, e.to) !== "consolidated";
      });

    if (thresholdGate) continue;

    fringe.push({
      conceptId: id,
      currentScore: score,
      nextLevel: score + 1,
      maxLevel: maxScore,
      arc: node.arc,
    });
  }

  return fringe;
}

// --- Goal-weighted priority ---

export interface PriorityItem extends FringeItem {
  goalWeight: number;
  goalNames: string[];
}

export function getGoalWeightedPriority(
  graph: DomainGraph,
  state: LearnerState,
  topN: number = 10
): PriorityItem[] {
  const fringe = getOuterFringe(graph, state);

  // Build reverse dependency map: concept -> what it enables
  const enables = new Map<string, Set<string>>();
  for (const edge of graph.relations) {
    const set = enables.get(edge.to) ?? new Set();
    set.add(edge.from);
    enables.set(edge.to, set);
  }

  // Compute goal relevance per concept via arc -> goal mapping
  // Goals reference arcs implicitly through concept observations
  const goalWeights = new Map<string, { weight: number; names: string[] }>();

  for (const goal of state.goals) {
    if (goal.status !== "active") continue;
    // Weight is inverse of priority: priority 1 = weight 1.0, priority 2 = 0.5, etc.
    const weight = 1.0 / goal.priority;

    // Find concepts related to this goal through arc membership
    for (const item of fringe) {
      const existing = goalWeights.get(item.conceptId) ?? {
        weight: 0,
        names: [],
      };
      // Simple heuristic: all fringe items get base goal weight
      // Concepts that enable more downstream concepts get bonus
      const downstreamCount = enables.get(item.conceptId)?.size ?? 0;
      const upstreamBonus = Math.log2(downstreamCount + 1) * 0.25;

      existing.weight += weight + upstreamBonus;
      if (!existing.names.includes(goal.name)) {
        existing.names.push(goal.name);
      }
      goalWeights.set(item.conceptId, existing);
    }
  }

  // Merge weights onto fringe items
  const weighted: PriorityItem[] = fringe.map((item) => {
    const gw = goalWeights.get(item.conceptId) ?? { weight: 0, names: [] };
    return {
      ...item,
      goalWeight: gw.weight,
      goalNames: gw.names,
    };
  });

  // Sort by weight descending
  weighted.sort((a, b) => b.goalWeight - a.goalWeight);

  return weighted.slice(0, topN);
}

// --- Practice mode (2x3 interaction matrix) ---

export type PracticeMode =
  | "bridge-building"
  | "guided-practice"
  | "spaced-retrieval"
  | "reframing"
  | "deliberate-practice"
  | "interleaved-review"
  | "no-gap";

const INTERACTION_MATRIX: Record<
  string,
  Record<string, PracticeMode>
> = {
  early: {
    conceptual: "bridge-building",
    procedural: "guided-practice",
    recall: "spaced-retrieval",
  },
  consolidated: {
    conceptual: "reframing",
    procedural: "deliberate-practice",
    recall: "interleaved-review",
  },
};

export function getPracticeMode(
  graph: DomainGraph,
  state: LearnerState,
  conceptId: string
): PracticeMode {
  const obs = state.observations[conceptId];
  if (!obs || !obs.gap) return "no-gap";

  const chunking = obs.chunkingState ?? "early";
  return INTERACTION_MATRIX[chunking]?.[obs.gap] ?? "no-gap";
}

// --- Dynamic surmise relation ---

export interface SurmiseEdge {
  from: string;
  to: string;
  type: "hard" | "bridge" | "altitude";
  minLevel: number;
}

export function getDynamicSurmise(
  graph: DomainGraph,
  state: LearnerState
): SurmiseEdge[] {
  const edges: SurmiseEdge[] = [];

  // Q_hard: from domain graph
  for (const e of graph.relations) {
    edges.push({
      from: e.from,
      to: e.to,
      type: "hard",
      minLevel: e.minLevel,
    });
  }

  // Q_bridge: from confirmed bridges in learner state
  for (const bridge of state.bridges) {
    if (bridge.status !== "confirmed") continue;
    if (graph.concepts[bridge.to]) {
      edges.push({
        from: bridge.to,
        to: bridge.from,
        type: "bridge",
        minLevel: bridge.complexityFloor ?? 1,
      });
    }
  }

  // Q_altitude: threshold concepts gate downstream by chunking state
  for (const [id, node] of Object.entries(graph.concepts)) {
    if (!node.isThreshold) continue;
    // Find concepts that depend on this threshold
    const downstream = graph.relations.filter((e) => e.to === id);
    for (const e of downstream) {
      edges.push({
        from: e.from,
        to: id,
        type: "altitude",
        minLevel: e.minLevel,
      });
    }
  }

  return edges;
}

// --- Coverage ---

export interface CoverageResult {
  totalConcepts: number;
  assessedConcepts: number;
  coverage: number;
  byArc: Record<string, { total: number; assessed: number; coverage: number }>;
}

export function getCoverage(
  graph: DomainGraph,
  state: LearnerState
): CoverageResult {
  const byArc: Record<
    string,
    { total: number; assessed: number; coverage: number }
  > = {};

  let totalConcepts = 0;
  let assessedConcepts = 0;

  for (const [id, node] of Object.entries(graph.concepts)) {
    if (node.type === "horizon") continue;

    totalConcepts++;
    const isAssessed =
      state.observations[id] !== undefined &&
      state.observations[id].score !== null;

    if (isAssessed) assessedConcepts++;

    const arc = node.arc;
    if (!byArc[arc]) byArc[arc] = { total: 0, assessed: 0, coverage: 0 };
    byArc[arc].total++;
    if (isAssessed) byArc[arc].assessed++;
  }

  // Compute coverage ratios
  for (const arc of Object.values(byArc)) {
    arc.coverage = arc.total > 0 ? arc.assessed / arc.total : 0;
  }

  return {
    totalConcepts,
    assessedConcepts,
    coverage: totalConcepts > 0 ? assessedConcepts / totalConcepts : 0,
    byArc,
  };
}

// --- CLI ---

const { values: cliArgs } = parseArgs({
  options: {
    graph: { type: "string" },
    state: { type: "string" },
    query: { type: "string" },
    concept: { type: "string" },
    top: { type: "string" },
  },
  strict: true,
});

if (cliArgs.graph && cliArgs.state && cliArgs.query) {
  const graph = loadDomainGraph(cliArgs.graph);
  const state = loadLearnerState(cliArgs.state);

  switch (cliArgs.query) {
    case "fringe":
      console.log(JSON.stringify(getOuterFringe(graph, state), null, 2));
      break;
    case "priority":
      console.log(
        JSON.stringify(
          getGoalWeightedPriority(graph, state, parseInt(cliArgs.top ?? "10")),
          null,
          2
        )
      );
      break;
    case "practice":
      if (!cliArgs.concept) {
        console.error("--concept required for practice query");
        process.exit(1);
      }
      console.log(
        JSON.stringify(
          { conceptId: cliArgs.concept, mode: getPracticeMode(graph, state, cliArgs.concept) },
          null,
          2
        )
      );
      break;
    case "coverage":
      console.log(JSON.stringify(getCoverage(graph, state), null, 2));
      break;
    case "surmise":
      console.log(JSON.stringify(getDynamicSurmise(graph, state), null, 2));
      break;
    default:
      console.error(`Unknown query: ${cliArgs.query}`);
      console.error("Available: fringe, priority, practice, coverage, surmise");
      process.exit(1);
  }
}
