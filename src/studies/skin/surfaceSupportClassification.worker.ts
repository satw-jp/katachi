/// <reference lib="webworker" />

import { buildBaseFootprint } from "./baseFootprint.ts";
import {
  classifyRawOverhangTargets,
  routeClassifiedSupportSites,
  toOverhangSupportRayFacts,
  validateOverhangAssignmentLedger,
  type OverhangAssignmentEntry,
  type OverhangSupportRayFacts,
  type OverhangTargetInput,
  type OverhangSupportPolicyResult,
} from "./overhangSupportPolicy.ts";
import { createSupportReachabilityIndex } from "./supportReachability.ts";
import {
  countSurfaceSupportClassificationFaces,
  createSurfaceSupportClassificationProgressState,
  hasMalformedSurfaceSupportClassificationFaceBuffer,
  mergeSurfaceSupportClassificationRawChunks,
  planSurfaceSupportClassification,
  shouldReportSurfaceSupportClassificationProgress,
  surfaceSupportClassificationProgressStride,
  updateSurfaceSupportClassificationProgress,
  type SurfaceSupportClassificationPlan,
  type SurfaceSupportClassificationProgressState,
  type SurfaceSupportClassificationRawChunk,
} from "./surfaceSupportClassificationParallel.ts";
import type {
  SurfaceSupportClassificationChildMessage,
  SurfaceSupportClassificationChildRequest,
  SurfaceSupportClassificationMessage,
  SurfaceSupportClassificationRequest,
  SurfaceSupportClassificationWorkerRequest,
} from "./surfaceSupportClassificationWorkerProtocol.ts";

class NestedWorkerUnavailableError extends Error {}

function longestExtent(positions: Float32Array): number {
  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (let offset = 0; offset < positions.length; offset += 3) {
    const x = positions[offset]; const y = positions[offset + 1]; const z = positions[offset + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return 0;
    minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
  }
  return Math.max(maxX - minX, maxY - minY, maxZ - minZ);
}

function scaledCopy(source: Float32Array, scale: number): Float32Array {
  const result = new Float32Array(source.length);
  for (let index = 0; index < source.length; index++) result[index] = source[index] * scale;
  return result;
}

function faceTargets(faces: Float32Array): OverhangTargetInput[] {
  if (faces.length % 9 !== 0) return [{ source: "diagnosed-face", positionsMm: faces }];
  const targets: OverhangTargetInput[] = [];
  for (let offset = 0; offset < faces.length; offset += 9) {
    targets.push({ source: "diagnosed-face", positionsMm: faces.subarray(offset, offset + 9) });
  }
  return targets;
}

function explicitTargetInputs(
  targets: SurfaceSupportClassificationRequest["explicitTargets"],
): OverhangTargetInput[] {
  return targets.map((target) => ({
    source: "explicit-profile",
    positionMm: target,
    patchId: target.patchId,
    contactRadiusMm: target.contactRadiusMm,
    contactOverlapMm: target.contactOverlapMm,
  }));
}

function dangerousFaceCount(positions: Float32Array): number {
  return countSurfaceSupportClassificationFaces(positions.length);
}

function classifyChildChunk(
  request: SurfaceSupportClassificationChildRequest,
): void {
  try {
    const rayIndex = createSupportReachabilityIndex(request.supportSurfacePositionsMm);
    const targets = faceTargets(request.faces);
    const progressStride = surfaceSupportClassificationProgressStride(targets.length);
    let lastReportedFaceCount = 0;
    const raw = classifyRawOverhangTargets({
      rayIndex,
      targets,
      diagnosedFaceSourceIndexOffset: request.startFaceIndex,
      onDiagnosedFaceComplete: (completedFaceCount, totalFaceCount) => {
        if (!shouldReportSurfaceSupportClassificationProgress(completedFaceCount, totalFaceCount, progressStride)
          || completedFaceCount <= lastReportedFaceCount) return;
        lastReportedFaceCount = completedFaceCount;
        const progress: SurfaceSupportClassificationChildMessage = {
          type: "progress",
          generation: request.generation,
          chunkIndex: request.chunkIndex,
          completedFaceCount,
          totalFaceCount,
        };
        self.postMessage(progress);
      },
    });
    const explicitRaw = classifyRawOverhangTargets({
      rayIndex,
      targets: explicitTargetInputs(request.explicitTargets),
    });
    const message: SurfaceSupportClassificationChildMessage = {
      type: "result",
      generation: request.generation,
      chunkIndex: request.chunkIndex,
      startFaceIndex: request.startFaceIndex,
      endFaceIndex: request.endFaceIndex,
      entries: raw.entries,
      explicitEntries: explicitRaw.entries,
      diagnosedFacePositionsMm: raw.diagnosedFacePositionsMm,
      rayFacts: toOverhangSupportRayFacts(rayIndex),
    };
    self.postMessage(message, { transfer: [raw.diagnosedFacePositionsMm.buffer] });
  } catch (error) {
    const message: SurfaceSupportClassificationChildMessage = {
      type: "error",
      generation: request.generation,
      chunkIndex: request.chunkIndex,
      message: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(message);
  }
}

function postCoordinatorProgress(
  generation: number,
  state: SurfaceSupportClassificationProgressState,
  elapsedMs: number,
): void {
  const message: SurfaceSupportClassificationMessage = {
    type: "progress",
    generation,
    classifiedFaceCount: state.completedFaceCount,
    totalFaceCount: state.totalFaceCount,
    workerCount: state.workerCount,
    elapsedMs,
  };
  self.postMessage(message);
}

interface NestedSurfaceSupportClassificationResult {
  chunks: SurfaceSupportClassificationRawChunk[];
  explicitEntries: OverhangAssignmentEntry[];
  rayFacts: OverhangSupportRayFacts | null;
}

function sameRayFacts(a: OverhangSupportRayFacts, b: OverhangSupportRayFacts): boolean {
  return a.method === b.method
    && a.surfaceSource === b.surfaceSource
    && a.rayDirection === b.rayDirection
    && a.meshScaleMm === b.meshScaleMm
    && a.lowerIntersectionEpsilonMm === b.lowerIntersectionEpsilonMm
    && a.gridCellSizeMm === b.gridCellSizeMm
    && a.gridCellCount === b.gridCellCount
    && a.surfaceTriangleCount === b.surfaceTriangleCount
    && a.invalidSurfaceTriangleCount === b.invalidSurfaceTriangleCount;
}

function runNestedChunks(
  request: SurfaceSupportClassificationRequest,
  dangerousFacePositionsMm: Float32Array,
  supportSurfacePositionsMm: Float32Array,
  plan: SurfaceSupportClassificationPlan,
  onProgress: (state: SurfaceSupportClassificationProgressState) => void,
): Promise<NestedSurfaceSupportClassificationResult> {
  if (typeof Worker !== "function") throw new NestedWorkerUnavailableError("nested Worker is unavailable");
  const workers: Worker[] = [];
  const results: Array<SurfaceSupportClassificationRawChunk | undefined> = new Array(plan.chunks.length);
  let explicitEntries: OverhangAssignmentEntry[] = [];
  let rayFacts: OverhangSupportRayFacts | null = null;
  let state = createSurfaceSupportClassificationProgressState(plan.dangerousFaceCount, plan.workerCount);
  let completedChunks = 0;
  let settled = false;
  const terminateAll = (): void => {
    for (const worker of workers) worker.terminate();
    workers.length = 0;
  };
  return new Promise((resolve, reject) => {
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      terminateAll();
      reject(error);
    };
    try {
      for (const chunk of plan.chunks) {
        let worker: Worker;
        try {
          worker = new Worker(new URL("./surfaceSupportClassification.worker.ts", import.meta.url), { type: "module" });
        } catch (error) {
          terminateAll();
          throw new NestedWorkerUnavailableError(error instanceof Error ? error.message : String(error));
        }
        workers.push(worker);
        worker.onerror = (event) => fail(new Error(event.message || "support classification child Worker failed"));
        worker.onmessage = (event: MessageEvent<SurfaceSupportClassificationChildMessage>) => {
          if (settled) return;
          const message = event.data;
          if (message.generation !== request.generation || message.chunkIndex !== chunk.chunkIndex) return;
          if (message.type === "progress") {
            if (!Number.isInteger(message.totalFaceCount)
              || message.totalFaceCount !== chunk.faceCount
              || !Number.isInteger(message.completedFaceCount)
              || message.completedFaceCount < 0
              || message.completedFaceCount > message.totalFaceCount) {
              fail(new Error("Fail closed: support classification child progress range changed"));
              return;
            }
            state = updateSurfaceSupportClassificationProgress(state, message.chunkIndex, message.completedFaceCount);
            onProgress(state);
            return;
          }
          if (message.type === "error") {
            fail(new Error(message.message));
            return;
          }
          if (message.startFaceIndex !== chunk.startFaceIndex || message.endFaceIndex !== chunk.endFaceIndex) {
            fail(new Error("Fail closed: support classification child range changed"));
            return;
          }
          if (!sameRayFacts(message.rayFacts, rayFacts ?? message.rayFacts)) {
            fail(new Error("Fail closed: support classification child Surface facts changed"));
            return;
          }
          if (chunk.chunkIndex === 0) explicitEntries = message.explicitEntries;
          else if (message.explicitEntries.length > 0) {
            fail(new Error("Fail closed: support classification explicit targets have multiple owners"));
            return;
          }
          rayFacts ??= message.rayFacts;
          state = updateSurfaceSupportClassificationProgress(state, message.chunkIndex, chunk.faceCount);
          onProgress(state);
          results[message.chunkIndex] = {
            chunk,
            entries: message.entries,
            diagnosedFacePositionsMm: message.diagnosedFacePositionsMm,
          };
          worker.terminate();
          completedChunks++;
          if (completedChunks !== plan.chunks.length) return;
          settled = true;
          workers.forEach((candidate) => candidate.terminate());
          resolve({ chunks: results as SurfaceSupportClassificationRawChunk[], explicitEntries, rayFacts });
        };
        const faces = dangerousFacePositionsMm.slice(chunk.startFaceIndex * 9, chunk.endFaceIndex * 9);
        const supportSurfaceCopy = supportSurfacePositionsMm.slice();
        const childRequest: SurfaceSupportClassificationChildRequest = {
          type: "classify-chunk",
          generation: request.generation,
          chunkIndex: chunk.chunkIndex,
          startFaceIndex: chunk.startFaceIndex,
          endFaceIndex: chunk.endFaceIndex,
          faces,
          supportSurfacePositionsMm: supportSurfaceCopy,
          explicitTargets: chunk.chunkIndex === 0 ? request.explicitTargets : [],
        };
        worker.postMessage(childRequest, [faces.buffer, supportSurfaceCopy.buffer]);
      }
      // Empty diagnoses have no child to emit a first event; report the
      // one-worker logical path explicitly so the UI never invents a count.
      if (plan.chunks.length === 0) {
        settled = true;
        terminateAll();
        resolve({ chunks: [], explicitEntries: [], rayFacts: null });
      } else {
        onProgress(state);
      }
    } catch (error) {
      if (error instanceof NestedWorkerUnavailableError) {
        if (!settled) { settled = true; terminateAll(); }
        reject(error);
        return;
      }
      fail(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function classifyInline(
  request: SurfaceSupportClassificationRequest,
  dangerousFacePositionsMm: Float32Array,
  rayIndex: ReturnType<typeof createSupportReachabilityIndex>,
  onProgress: (state: SurfaceSupportClassificationProgressState) => void,
): { entries: OverhangAssignmentEntry[]; diagnosedFacePositionsMm: Float32Array } {
  const totalFaceCount = dangerousFaceCount(dangerousFacePositionsMm);
  const progressStride = surfaceSupportClassificationProgressStride(totalFaceCount);
  let lastReportedFaceCount = 0;
  let state = createSurfaceSupportClassificationProgressState(
    totalFaceCount,
    1,
  );
  onProgress(state);
  const raw = classifyRawOverhangTargets({
    rayIndex,
    targets: [
      ...faceTargets(dangerousFacePositionsMm),
      ...explicitTargetInputs(request.explicitTargets),
    ],
    onDiagnosedFaceComplete: (completedFaceCount, diagnosedFaceCount) => {
      if (!shouldReportSurfaceSupportClassificationProgress(completedFaceCount, diagnosedFaceCount, progressStride)
        || completedFaceCount <= lastReportedFaceCount) return;
      lastReportedFaceCount = completedFaceCount;
      state = updateSurfaceSupportClassificationProgress(state, 0, completedFaceCount);
      onProgress(state);
    },
  });
  return raw;
}

async function runCoordinator(request: SurfaceSupportClassificationRequest): Promise<void> {
  const started = performance.now();
  const sourceLongest = longestExtent(request.diagnosis.basePositions);
  if (!(sourceLongest > 0) || !(request.targetLongestMm > 0)) {
    throw new Error("Fail closed: BODYの実寸Scaleを求められませんでした");
  }
  const scaleMmPerUnit = request.targetLongestMm / sourceLongest;
  const dangerousFacePositionsMm = scaledCopy(request.diagnosis.beforeDangerPositions, scaleMmPerUnit);
  const supportSurfacePositionsMm = scaledCopy(request.diagnosis.basePositions, scaleMmPerUnit);
  const totalFaceCount = dangerousFaceCount(request.diagnosis.beforeDangerPositions);
  const plan = planSurfaceSupportClassification({
    requestedWorkerCount: request.workerCount,
    dangerousFaceCount: totalFaceCount,
    scaledSupportSurfaceByteLength: supportSurfacePositionsMm.byteLength,
  });
  const baseFootprint = buildBaseFootprint(request.host, request.hostK, scaleMmPerUnit);
  let progressState = createSurfaceSupportClassificationProgressState(totalFaceCount, plan.workerCount);
  const sendProgress = (state: SurfaceSupportClassificationProgressState): void => {
    progressState = state;
    postCoordinatorProgress(request.generation, state, performance.now() - started);
  };

  let rawFaces: { entries: OverhangAssignmentEntry[]; diagnosedFacePositionsMm: Float32Array };
  let actualWorkerCount = plan.workerCount;
  let rayFacts: OverhangSupportRayFacts;
  const malformedDangerousFaces = hasMalformedSurfaceSupportClassificationFaceBuffer(
    request.diagnosis.beforeDangerPositions.length,
  );
  if (malformedDangerousFaces || plan.workerCount === 1 || plan.chunks.length === 0) {
    // The historical classifier treats a malformed remainder as one
    // unresolved face. It cannot be sliced into a nine-value child chunk.
    // A one-worker plan stays inline too: spawning a nested child would add
    // copy/index/startup cost without any parallel work. Empty diagnoses use
    // this same exact path for explicit profile targets.
    actualWorkerCount = 1;
    const rayIndex = createSupportReachabilityIndex(supportSurfacePositionsMm);
    rayFacts = toOverhangSupportRayFacts(rayIndex);
    progressState = createSurfaceSupportClassificationProgressState(totalFaceCount, actualWorkerCount);
    sendProgress(progressState);
    rawFaces = classifyInline(request, dangerousFacePositionsMm, rayIndex, sendProgress);
  } else {
    try {
      // Each child builds the exact same index from its transferred Surface
      // copy. Returning the facts and chunk-0's raw explicit entries avoids an
      // otherwise redundant coordinator index construction on the parallel
      // path; the final route still runs exactly once here.
      const nestedResults = await runNestedChunks(request, dangerousFacePositionsMm, supportSurfacePositionsMm, plan, sendProgress);
      const merged = mergeSurfaceSupportClassificationRawChunks(nestedResults.chunks, totalFaceCount);
      if (!nestedResults.rayFacts) throw new Error("Fail closed: child Surface facts are missing");
      rayFacts = nestedResults.rayFacts;
      rawFaces = {
        entries: [...merged.entries, ...nestedResults.explicitEntries],
        diagnosedFacePositionsMm: merged.diagnosedFacePositionsMm,
      };
    } catch (error) {
      if (!(error instanceof NestedWorkerUnavailableError)) throw error;
      // Browser engines without nested Worker construction use the exact same
      // raw classifier and global route, serially. This is an execution fallback
      // only; no alternate classification rule or hidden result substitution is
      // introduced.
      actualWorkerCount = 1;
      const rayIndex = createSupportReachabilityIndex(supportSurfacePositionsMm);
      rayFacts = toOverhangSupportRayFacts(rayIndex);
      progressState = createSurfaceSupportClassificationProgressState(totalFaceCount, actualWorkerCount);
      sendProgress(progressState);
      rawFaces = classifyInline(request, dangerousFacePositionsMm, rayIndex, sendProgress);
    }
  }

  // If the nested path was selected, its progress already counted every face;
  // this final update is idempotent and makes the 99% boundary explicit.
  if (progressState.workerCount !== actualWorkerCount) {
    progressState = createSurfaceSupportClassificationProgressState(totalFaceCount, actualWorkerCount);
    sendProgress(progressState);
  }
  const automaticResult = routeClassifiedSupportSites({
    sites: rawFaces.entries,
    deduplicationToleranceMm: rayFacts.lowerIntersectionEpsilonMm,
    diagnosedFacePositionsMm: rawFaces.diagnosedFacePositionsMm,
    baseFootprint,
    rayFacts,
    supportSurfacePositionsMm,
  });
  validateOverhangAssignmentLedger(automaticResult);
  postCoordinatorResult(request, automaticResult, started);
}

function postCoordinatorResult(
  request: SurfaceSupportClassificationRequest,
  automaticResult: OverhangSupportPolicyResult,
  started: number,
): void {
  const message: SurfaceSupportClassificationMessage = {
    type: "result",
    generation: request.generation,
    diagnosis: request.diagnosis,
    automaticResult,
    computeMs: performance.now() - started,
  };
  self.postMessage(message, {
    transfer: [
      request.diagnosis.basePositions.buffer,
      request.diagnosis.baseNormals.buffer,
      request.diagnosis.beforeDangerPositions.buffer,
      request.diagnosis.afterDangerPositions.buffer,
      request.diagnosis.mitigatedPositions.buffer,
      automaticResult.outsideFacePositionsMm.buffer,
      automaticResult.diagnosedFacePositionsMm.buffer,
    ],
  });
}

self.onmessage = (event: MessageEvent<SurfaceSupportClassificationWorkerRequest>): void => {
  const request = event.data;
  if (request.type === "classify-chunk") {
    classifyChildChunk(request);
    return;
  }
  const started = performance.now();
  void runCoordinator(request).catch((error) => {
    const message: SurfaceSupportClassificationMessage = {
      type: "error",
      generation: request.generation,
      message: error instanceof Error ? error.message : String(error),
      computeMs: performance.now() - started,
    };
    self.postMessage(message);
  });
};
