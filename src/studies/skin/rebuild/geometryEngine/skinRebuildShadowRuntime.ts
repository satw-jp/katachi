import { sha256Hex } from "../../../../lib/hash.ts";
import { computeSkinSamplingBounds } from "../../meshExport.ts";
import type { SkinRebuildProject } from "../model.ts";
import {
  createEvaluateContainmentJob,
  type EvaluateContainmentJobRequest,
  type EvaluateContainmentJobResult,
} from "./contracts.ts";
import {
  type ShadowEvaluateContainmentOutcome,
} from "./shadowEvaluateContainment.ts";
import { compareContainmentResults } from "./resultComparison.ts";
import { evaluateContainmentOnWeb } from "./webGeometryEngine.ts";
import {
  WindowsLocalGeometryEngineClient,
  WindowsLocalGeometryEngineError,
  type LocalGeometryTransportTiming,
  type ShadowContainmentSession,
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
  transportMode: "web-only" | "outer-binary" | "session-upload" | "session-reuse";
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

function helperSupportsVolatileSessions(capabilities: {
  policy: { executionMode: "shadow-only"; authoritativeBackend: "web"; productionApplied: false };
}): boolean {
  const policy = capabilities.policy as typeof capabilities.policy & {
    shadowSessionCache?: { volatile?: boolean; persistedToProject?: boolean };
  };
  return policy.shadowSessionCache?.volatile === true
    && policy.shadowSessionCache.persistedToProject === false;
}

export class SkinRebuildShadowObserver {
  private readonly localClient: WindowsLocalGeometryEngineClient;
  private session: ShadowContainmentSession | null = null;

  constructor(options: { localClient?: WindowsLocalGeometryEngineClient } = {}) {
    this.localClient = options.localClient
      ?? new WindowsLocalGeometryEngineClient({ transport: "binary" });
  }

  private result(
    generated: SkinRebuildContainmentRequest,
    outcome: ShadowEvaluateContainmentOutcome,
    transportMode: SkinRebuildShadowObservation["transportMode"],
    requestGenerationMilliseconds: number,
    totalStart: number,
  ): SkinRebuildShadowObservation {
    return {
      ...generated,
      outcome,
      transportMode,
      requestGenerationMilliseconds,
      totalMilliseconds: performance.now() - totalStart,
      transportTiming: this.localClient.getLastTransportTiming(),
    };
  }

  async observe(
    project: SkinRebuildProject,
    preferWindowsCuda: boolean,
  ): Promise<SkinRebuildShadowObservation> {
    const totalStart = performance.now();
    const requestStart = performance.now();
    const generated = await createSkinRebuildContainmentRequest(project);
    const requestGenerationMilliseconds = performance.now() - requestStart;
    const authoritative = evaluateContainmentOnWeb(generated.request);
    if (!preferWindowsCuda) {
      return this.result(generated, {
        authoritative,
        candidateStatus: "not_requested",
        shadowOnly: true,
        productionApplied: false,
      }, "web-only", requestGenerationMilliseconds, totalStart);
    }

    const probe = await this.localClient.probeCapabilities();
    if (!probe.available) {
      this.session = null;
      return this.result(generated, {
        authoritative,
        candidateStatus: "helper_unavailable",
        fallback: { code: probe.code, detail: probe.detail },
        shadowOnly: true,
        productionApplied: false,
      }, "outer-binary", requestGenerationMilliseconds, totalStart);
    }
    if (!this.localClient.supportsCudaContainment(probe.capabilities)) {
      this.session = null;
      const cuda = probe.capabilities.backends.find((backend) => backend.kind === "cuda");
      return this.result(generated, {
        authoritative,
        candidateStatus: "cuda_unavailable",
        fallback: {
          code: cuda?.reasonCode ?? "cuda_containment_not_advertised",
          detail: "The helper does not advertise a compatible available CUDA containment backend.",
        },
        shadowOnly: true,
        productionApplied: false,
      }, "outer-binary", requestGenerationMilliseconds, totalStart);
    }

    let transportMode: SkinRebuildShadowObservation["transportMode"] = "outer-binary";
    try {
      let candidate: EvaluateContainmentJobResult | undefined;
      if (helperSupportsVolatileSessions(probe.capabilities)) {
        if (this.session?.projectFingerprint === generated.request.projectFingerprint) {
          try {
            candidate = (await this.localClient.evaluateContainmentShadowSession(this.session.sessionId, {
              clientRequestId: generated.request.clientRequestId,
              smoothness: generated.request.input.base.smoothness,
              boundaryTolerance: generated.request.input.boundaryTolerance,
              benchmarkIterations: 1,
            })).result;
            transportMode = "session-reuse";
          } catch (error) {
            if (!(error instanceof WindowsLocalGeometryEngineError)
              || (error.code !== "shadow_session_not_found" && error.code !== "stale_shadow_session")) throw error;
            this.session = null;
          }
        }
        if (!candidate) {
          const created = await this.localClient.createContainmentShadowSession(generated.request);
          this.session = created.session;
          candidate = created.result;
          transportMode = "session-upload";
        }
      } else {
        this.session = null;
        candidate = await this.localClient.evaluateContainment(generated.request);
      }
      const comparison = compareContainmentResults(
        generated.request,
        authoritative,
        candidate,
        generated.request.input.boundaryTolerance,
      );
      return this.result(generated, {
        authoritative,
        candidate,
        comparison,
        candidateStatus: comparison.matched ? "candidate_matched" : "candidate_mismatched",
        fallback: comparison.matched ? undefined : {
          code: "candidate_comparison_failed",
          detail: "CUDA candidate facts did not match the frozen Web reference within tolerance.",
        },
        shadowOnly: true,
        productionApplied: false,
      }, transportMode, requestGenerationMilliseconds, totalStart);
    } catch (error) {
      this.session = null;
      return this.result(generated, {
        authoritative,
        candidateStatus: "candidate_failed",
        fallback: {
          code: "local_job_failed",
          detail: error instanceof Error ? error.message : String(error),
        },
        shadowOnly: true,
        productionApplied: false,
      }, transportMode, requestGenerationMilliseconds, totalStart);
    }
  }
}

export async function observeSkinRebuildContainmentShadow(
  project: SkinRebuildProject,
  options: {
    preferWindowsCuda: boolean;
    localClient?: WindowsLocalGeometryEngineClient;
  },
): Promise<SkinRebuildShadowObservation> {
  const observer = new SkinRebuildShadowObserver({ localClient: options.localClient });
  return observer.observe(project, options.preferWindowsCuda);
}
