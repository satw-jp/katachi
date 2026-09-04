import {
  createArtifactRegistry,
  createGraphArtifact,
  createRegisteredArtifact,
  type ArtifactRegistry,
  type ArtifactStatus,
  type GraphArtifact,
  type GraphSummary,
  type RegisteredArtifact,
} from "./contracts.ts";
import { SKIN_REBUILD_GOLDEN_EXPECTED } from "../rebuild/goldenOffsetBendRegression.ts";

export const GOLDEN_SOURCE_BRANCH = "agent/skin-authoring-restoration-v0";
export const GOLDEN_SOURCE_HEAD = "c93a031569219c95f69d5ee0570e2b6845a0368a";
export const GOLDEN_SOURCE = "golden-luna:production-runtime";
export const GOLDEN_ALGORITHM_VERSION = "skin-rebuild-first-print-v1";

export type GoldenArtifactId =
  | "beads"
  | "field"
  | "surface-graph"
  | "internal-graph"
  | "reinforcement"
  | "dryweb"
  | "mesh"
  | "diagnostics"
  | "body"
  | "removable-support"
  | "export";

export interface BoundsSummary {
  readonly min: { readonly x: number; readonly y: number; readonly z: number };
  readonly max: { readonly x: number; readonly y: number; readonly z: number };
}

export interface ArtifactSummaryData {
  readonly summary: string;
  readonly counts?: Readonly<Record<string, number>>;
  readonly bounds?: BoundsSummary;
  readonly graph?: GraphSummary;
}

export interface GoldenRuntimeArtifactSpec {
  readonly status: ArtifactStatus;
  readonly role: string;
  readonly data: ArtifactSummaryData | null;
  readonly source?: string;
  readonly upstream?: readonly string[];
}

export interface GoldenRuntimeData {
  readonly source: string;
  readonly sourceFingerprint: string;
  readonly algorithmVersion: string;
  readonly artifacts: Readonly<Record<GoldenArtifactId, GoldenRuntimeArtifactSpec>>;
}

const goldenBodyBounds: BoundsSummary = {
  min: { x: -0.9298405647277832, y: -0.9306714534759521, z: -2.266134023666382 },
  max: { x: 0.919206440448761, y: 0.9021838307380676, z: 2.2655112743377686 },
};

const surfaceGraph: GraphSummary = { nodeCount: 38, edgeCount: 0 };
const internalGraph: GraphSummary = { nodeCount: 251, edgeCount: 270 };
const supportGraph: GraphSummary = {
  nodeCount: SKIN_REBUILD_GOLDEN_EXPECTED.supportGraph.nodeCount,
  edgeCount: SKIN_REBUILD_GOLDEN_EXPECTED.supportGraph.edgeCount,
};

export const DEFAULT_GOLDEN_RUNTIME_DATA: GoldenRuntimeData = {
  source: GOLDEN_SOURCE,
  sourceFingerprint: SKIN_REBUILD_GOLDEN_EXPECTED.supportGraph.fingerprint,
  algorithmVersion: GOLDEN_ALGORITHM_VERSION,
  artifacts: {
    beads: {
      status: "current",
      role: "authoring.base-beads",
      data: { summary: "12 editable host balls observed", counts: { hostBalls: 12 } },
    },
    field: {
      status: "current",
      role: "derived.field",
      data: { summary: "production field evaluator observed", counts: { evaluators: 1 } },
    },
    "surface-graph": {
      status: "current",
      role: "derived.surface-graph",
      data: { summary: "38 authored patches", counts: { patches: 38 }, graph: surfaceGraph },
    },
    "internal-graph": {
      status: "current",
      role: "derived.internal-graph",
      data: { summary: "251 nodes / 270 edges", graph: internalGraph },
    },
    reinforcement: {
      status: "unavailable",
      role: "derived.reinforcement-graph",
      data: null,
      source: "rebuild:not-migrated",
    },
    dryweb: {
      status: "unavailable",
      role: "derived.dryweb-graph",
      data: null,
      source: "rebuild:not-migrated",
    },
    mesh: {
      status: "current",
      role: "derived.mesh",
      data: {
        summary: `${SKIN_REBUILD_GOLDEN_EXPECTED.body.faceCount.toLocaleString()} BODY faces`,
        counts: { triangles: SKIN_REBUILD_GOLDEN_EXPECTED.body.faceCount, connectedComponents: 1 },
        bounds: goldenBodyBounds,
      },
    },
    diagnostics: {
      status: "current",
      role: "diagnostics.print-contract",
      data: {
        summary: "166 critical · 156 supported · 10 unsupported",
        counts: {
          criticalTargets: 166,
          supportedTargets: 156,
          unsupportedTargets: 10,
          acceptedBodyCollisions: 0,
          insideDerived: 0,
        },
      },
    },
    body: {
      status: "current",
      role: "fabrication.body",
      data: {
        summary: `${SKIN_REBUILD_GOLDEN_EXPECTED.body.faceCount.toLocaleString()} triangles · 1 component`,
        counts: { triangles: SKIN_REBUILD_GOLDEN_EXPECTED.body.faceCount, connectedComponents: 1 },
        bounds: goldenBodyBounds,
      },
    },
    "removable-support": {
      status: "current",
      role: "fabrication.removable-support",
      data: {
        summary: "546 nodes / 390 edges · vertical 78 · bent 78",
        counts: {
          supportedTargets: 156,
          unsupportedTargets: 10,
          verticalRoutes: 78,
          offsetBendRoutes: 78,
        },
        graph: supportGraph,
      },
      source: "current-stage8:sparseResult.graph",
    },
    export: {
      status: "current",
      role: "export.adapter",
      data: {
        summary: "3MF / STL / report parity PASS",
        counts: { threeMf: 1, stl: 1, report: 1 },
      },
    },
  },
};

export type GoldenAdapterArtifact =
  | RegisteredArtifact<ArtifactSummaryData>
  | GraphArtifact<ArtifactSummaryData, GraphSummary>;

export const GOLDEN_ARTIFACT_IDS: readonly GoldenArtifactId[] = [
  "beads",
  "field",
  "surface-graph",
  "internal-graph",
  "reinforcement",
  "dryweb",
  "mesh",
  "diagnostics",
  "body",
  "removable-support",
  "export",
];

function isGraphArtifact(id: GoldenArtifactId): boolean {
  return id === "surface-graph"
    || id === "internal-graph"
    || id === "reinforcement"
    || id === "dryweb"
    || id === "removable-support";
}

function artifactSource(spec: GoldenRuntimeArtifactSpec, source: GoldenRuntimeData): string {
  return spec.source ?? source.source;
}

export function createGoldenAdapterRegistry(
  source: GoldenRuntimeData = DEFAULT_GOLDEN_RUNTIME_DATA,
): ArtifactRegistry<GoldenAdapterArtifact> {
  const artifacts = GOLDEN_ARTIFACT_IDS.map((id): GoldenAdapterArtifact => {
    const spec = source.artifacts[id];
    const provenance = {
      source: artifactSource(spec, source),
      sourceFingerprint: source.sourceFingerprint,
      upstream: spec.upstream,
      algorithmVersion: source.algorithmVersion,
    };
    if (isGraphArtifact(id)) {
      return createGraphArtifact({
        id,
        data: spec.data,
        graph: spec.data?.graph ?? null,
        status: spec.status,
        role: spec.role,
        provenance,
      });
    }
    return createRegisteredArtifact({
      id,
      data: spec.data,
      status: spec.status,
      role: spec.role,
      provenance,
    });
  });
  return createArtifactRegistry(artifacts);
}

/** Phase 0 keeps the future producer boundary explicit: the shadow registry
 * observes the same immutable Golden source until a migrated producer exists. */
export function createRebuildObservationRegistry(
  source: GoldenRuntimeData = DEFAULT_GOLDEN_RUNTIME_DATA,
): ArtifactRegistry<GoldenAdapterArtifact> {
  return createGoldenAdapterRegistry(source);
}
