import { sha256Hex } from "../../../../lib/hash.ts";
import { computeSkinSamplingBounds } from "../../meshExport.ts";
import type { SkinRebuildProject } from "../model.ts";
import {
  createEvaluateContainmentJob,
  type EvaluateContainmentJobRequest,
} from "./contracts.ts";
import {
  evaluateContainmentShadow,
  type ShadowEvaluateContainmentOutcome,
} from "./shadowEvaluateContainment.ts";
import {
  WindowsLocalGeometryEngineClient,
  type LocalGeometryTransportTiming,
} from "./windowsLocalClient.ts";

const BOUNDARY_TOLERANCE = 1e-6;
const MAXIMUM_INTERVALS_PER_EDGE = 512;
let requestSequence = 0;

export interface SkinRebuildContainmentRequestFacts {
  targetLongestMm: number;
  hostBallCount: number;
  latticeNodeCount: number;
  latticeEdgeCount: number;
  sampleCount: number;
  minimumSamplesPerEdge: number;
  maximumSamplesPerEdge: number;
  scaleMmPerUnit: number;
  projectDigest: string;
}

export interface SkinRebuildContainmentRequest {
  request: EvaluateContainmentJobRequest;
  facts: SkinRebuildContainmentRequestFacts;
}

export interface SkinRebuildShadowObservation extends SkinRebuildContainmentRequest {
  outcome: ShadowEvaluateContainmentOutcome;
  requestGenerationMilliseconds: number;
  totalMilliseconds: number;
  transportTiming: LocalGeometryTransportTiming | null;
}

function edgeLength(
  first: { x: number; y: number; z: number },
  second: { x: number; y: number; z: number },
): number {
  return Math.hypot(second.x - first.x, second.y - first.y, second.z - first.z);
}

/**
 * Copies the current production Base and permanent lattice into the portable
 * containment contract. This is observation-only: no result from this module
 * is written back to SkinRebuildProject, BODY, support, FKEI, STL, or 3MF.
 */
export async function createSkinRebuildContainmentRequest(
  project: SkinRebuildProject,
): Promise<SkinRebuildContainmentRequest> {
  if (project.lattice.edges.length === 0) {
    throw new Error("the current SKIN project has no permanent lattice to observe");
  }
  const bounds = computeSkinSamplingBounds(
    project.base.host,
    project.base.hostK,
    project.settings.surfaceThickness,
    project.patterns,
  );
  if (!(bounds.longest > 0) || !(project.settings.targetLongestMm > 0)) {
    throw new Error("the current SKIN project has an invalid millimeter scale");
  }
  const scaleMmPerUnit = project.settings.targetLongestMm / bounds.longest;
  const samples: EvaluateContainmentJobRequest["input"]["samples"] = [];
  const samplesPerEdge: number[] = [];
  for (const edge of project.lattice.edges) {
    const start = project.lattice.nodes[edge.start]?.position;
    const end = project.lattice.nodes[edge.end]?.position;
    if (!start || !end || !(edge.radius > 0)) {
      throw new Error(`invalid permanent lattice edge ${edge.id}`);
    }
    const sampleStep = Math.max(edge.radius * 0.2, 1e-4);
    const intervals = Math.max(
      2,
      Math.min(MAXIMUM_INTERVALS_PER_EDGE, Math.ceil(edgeLength(start, end) / sampleStep)),
    );
    samplesPerEdge.push(intervals + 1);
    for (let index = 0; index <= intervals; index += 1) {
      const t = index / intervals;
      samples.push({
        sampleId: `skin-rebuild-edge-${edge.id}-sample-${index}`,
        edgeId: `skin-rebuild-edge-${edge.id}`,
        position: {
          x: start.x + (end.x - start.x) * t,
          y: start.y + (end.y - start.y) * t,
          z: start.z + (end.z - start.z) * t,
        },
        radius: edge.radius,
      });
    }
  }
  const sourceIdentity = JSON.stringify({
    algorithmVersion: project.algorithmVersion,
    settings: project.settings,
    base: project.base,
    lattice: project.lattice,
  });
  const projectDigest = await sha256Hex(sourceIdentity);
  requestSequence += 1;
  const request = createEvaluateContainmentJob({
    clientRequestId: `skin-rebuild-shadow-${Date.now().toString(36)}-${requestSequence}`,
    projectFingerprint: `sha256:${projectDigest}`,
    coordinateContract: {
      frame: "object",
      unitsPerMillimeter: 1 / scaleMmPerUnit,
      handedness: "right",
      buildAxis: "+z",
    },
    quality: {
      purpose: "production-ui-shadow-observation",
      sourceAlgorithmVersion: project.algorithmVersion,
      benchmarkIterations: 1,
    },
    input: {
      base: {
        kind: "metaball-smooth-union",
        contractVersion: 1,
        balls: project.base.host.map((ball, index) => ({
          id: Number.isInteger(ball.id) ? ball.id : index + 1,
          x: ball.x,
          y: ball.y,
          z: ball.z,
          r: ball.r,
        })),
        smoothness: project.base.hostK,
      },
      samples,
      boundaryTolerance: BOUNDARY_TOLERANCE,
    },
  });
  return {
    request,
    facts: {
      targetLongestMm: project.settings.targetLongestMm,
      hostBallCount: project.base.host.length,
      latticeNodeCount: project.lattice.nodes.length,
      latticeEdgeCount: project.lattice.edges.length,
      sampleCount: samples.length,
      minimumSamplesPerEdge: Math.min(...samplesPerEdge),
      maximumSamplesPerEdge: Math.max(...samplesPerEdge),
      scaleMmPerUnit,
      projectDigest,
    },
  };
}

export async function observeSkinRebuildContainmentShadow(
  project: SkinRebuildProject,
  options: {
    preferWindowsCuda: boolean;
    localClient?: WindowsLocalGeometryEngineClient;
  },
): Promise<SkinRebuildShadowObservation> {
  const totalStart = performance.now();
  const requestStart = performance.now();
  const generated = await createSkinRebuildContainmentRequest(project);
  const requestGenerationMilliseconds = performance.now() - requestStart;
  const localClient = options.localClient ?? new WindowsLocalGeometryEngineClient({ transport: "binary" });
  const outcome = await evaluateContainmentShadow(generated.request, {
    preferWindowsCuda: options.preferWindowsCuda,
    localClient,
    comparisonMarginTolerance: generated.request.input.boundaryTolerance,
  });
  return {
    ...generated,
    outcome,
    requestGenerationMilliseconds,
    totalMilliseconds: performance.now() - totalStart,
    transportTiming: localClient.getLastTransportTiming(),
  };
}
