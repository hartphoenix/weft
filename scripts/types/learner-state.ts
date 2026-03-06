// Learner State — observation overlay on a domain graph
// Per-learner, per-domain. Joins on concept ID.
// Lives at: <harness-root>/learning/state/<domain-slug>.state.json

export interface LearnerState {
  meta: LearnerMeta;
  observations: Record<string, ConceptObservation>;
  bridges: BridgeHypothesis[];
  goals: Goal[];
}

export interface LearnerMeta {
  learnerId: string;
  domainGraphId: string;
  domainGraphVersion: string;       // pinned version for migration detection
  created: string;
  lastModified: string;
}

export interface ConceptObservation {
  score: number | null;             // 0-5, null = unassessed
  gap: "conceptual" | "procedural" | "recall" | null;
  fluencyTarget: "production" | "evaluation";
  chunkingState: "early" | "consolidated";
  chunkingSelfReport?: "exposure" | "recognition" | "fluency" | "automaticity";
  lastAssessed: string | null;
  timesAssessed: number;
  assessments: Assessment[];
}

export interface Assessment {
  date: string;
  score: number | null;
  source: string;                   // evidence tag: "session-review:quiz", etc.
  gap?: "conceptual" | "procedural" | "recall" | null;
  note?: string;
  evidence?: string;
  instrument?: "quiz" | "artifact" | "conversation" | "self-report" | "observed";
}

export interface BridgeHypothesis {
  from: string;                     // source concept or external domain skill
  to: string;                       // target conceptId in domain graph
  fromDomain?: string;              // if bridge originates outside this domain
  status: "hypothesized" | "tested" | "confirmed" | "disconfirmed";
  complexityFloor?: number;
  evidence?: string;
  date?: string;
}

export interface Goal {
  id: string;
  name: string;
  description?: string;
  priority: number;                 // lower = higher priority, 1 = primary
  status: "active" | "deferred" | "achieved";
}
