/// <reference lib="webworker" />

import { buildBaseFootprint } from "./baseFootprint.ts";
import { assignOverhangSupportTargets, validateOverhangAssignmentLedger } from "./overhangSupportPolicy.ts";
import type {
  SurfaceSupportClassificationMessage,
  SurfaceSupportClassificationRequest,
} from "./surfaceSupportClassificationWorkerProtocol.ts";

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

self.onmessage = (event: MessageEvent<SurfaceSupportClassificationRequest>): void => {
  const request = event.data;
  const started = performance.now();
  try {
    const sourceLongest = longestExtent(request.diagnosis.basePositions);
    if (!(sourceLongest > 0) || !(request.targetLongestMm > 0)) {
      throw new Error("Fail closed: BODYの実寸Scaleを求められませんでした");
    }
    const scaleMmPerUnit = request.targetLongestMm / sourceLongest;
    const automaticResult = assignOverhangSupportTargets({
      diagnosedFaces: scaledCopy(request.diagnosis.beforeDangerPositions, scaleMmPerUnit),
      supportSurfacePositionsMm: scaledCopy(request.diagnosis.basePositions, scaleMmPerUnit),
      explicitTargets: request.explicitTargets,
      baseFootprint: buildBaseFootprint(request.host, request.hostK, scaleMmPerUnit),
    });
    validateOverhangAssignmentLedger(automaticResult);
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
  } catch (error) {
    const message: SurfaceSupportClassificationMessage = {
      type: "error",
      generation: request.generation,
      message: error instanceof Error ? error.message : String(error),
      computeMs: performance.now() - started,
    };
    self.postMessage(message);
  }
};
