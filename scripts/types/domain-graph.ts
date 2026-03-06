// Domain Graph — topology of a learning domain
// Shared across learners, versioned independently
// Lives at: <harness-root>/domains/<domain-slug>.domain.json

export interface DomainGraph {
  meta: DomainMeta;
  concepts: Record<string, ConceptNode>;
  relations: PrerequisiteEdge[];
  arcs: Record<string, Arc>;
}

export interface DomainMeta {
  id: string;                    // stable slug, e.g. "web-development"
  version: string;               // semver: minor = additive, major = breaking
  name: string;
  description: string;
  created: string;               // ISO date
  lastModified: string;
  fluxRate: "stable" | "moderate" | "rapid";
  validationCadence: number;     // days between re-validation
  lastValidated?: string;        // ISO date — when the graph was last cross-checked against sources
  sources: SourceRef[];
}

export interface SourceRef {
  name: string;
  role: "primary" | "cross-reference";
  date?: string;
  url?: string;
  note?: string;
}

export interface ConceptNode {
  name: string;
  type: "concept" | "horizon";    // horizon = known but unmapped
  description?: string;
  arc: string;
  complexityRange?: {
    min: number;                   // score at which concept becomes functional
    max: number;                   // score at which concept is generative
  };
  knowingProfile?: {               // Vervaeke's 4P — which types the domain demands
    propositional: "primary" | "necessary" | "minor" | "negligible";
    procedural:    "primary" | "necessary" | "minor" | "negligible";
    perspectival:  "primary" | "necessary" | "minor" | "negligible";
    participatory: "primary" | "necessary" | "minor" | "negligible";
  };
  isThreshold?: boolean;           // domain topology: qualitative shift node
  transitionBarrier?: number;      // score where functional->generative boundary sits
  coverageDepth: "detailed" | "sketched" | "stub";
  composedOf: string[];            // conceptIds this decomposes into
  composesInto: string[];          // conceptIds this is a component of
  tags?: string[];
}

export interface PrerequisiteEdge {
  from: string;                    // dependent concept (needs the prerequisite)
  to: string;                      // prerequisite concept
  minLevel: number;                // minimum score on 'to' (0-5)
  knowingType?: "propositional" | "procedural" | "perspectival" | "participatory";
  logic: "and" | "or";            // how this edge combines with others in same group
  group?: string;                  // groups edges into AND/OR sets on same 'from'
  confidence: "confirmed" | "inferred" | "hypothesized";
  note?: string;
}

export interface Arc {
  name: string;
  description: string;
  outcomes: string[];              // domain-level capabilities this arc develops
  dependencies?: ArcDependency[];
}

export interface ArcDependency {
  arcId: string;
  type: "hard" | "bridge";
}
