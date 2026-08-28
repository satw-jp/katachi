import type { OverhangAssignmentEntry } from "./overhangSupportPolicy.ts";

export const SURFACE_SUPPORT_CLASSIFICATION_MAX_WORKERS = 8;
export const SURFACE_SUPPORT_CLASSIFICATION_COPY_BUDGET_BYTES = 384 * 1024 * 1024;

export interface SurfaceSupportClassificationChunkPlan {
  chunkIndex: number;
  startFaceIndex: number;
  endFaceIndex: number;
  faceCount: number;
}

export interface SurfaceSupportClassificationPlan {
  requestedWorkerCount: number;
  workerCount: number;
  dangerousFaceCount: number;
  scaledSupportSurfaceByteLength: number;
  chunks: SurfaceSupportClassificationChunkPlan[];
}

export interface SurfaceSupportClassificationRawChunk {
  chunk: SurfaceSupportClassificationChunkPlan;
  entries: OverhangAssignmentEntry[];
  diagnosedFacePositionsMm: Float32Array;
}

export interface MergedSurfaceSupportClassificationRaw {
  entries: OverhangAssignmentEntry[];
  diagnosedFacePositionsMm: Float32Array;
}

export interface SurfaceSupportClassificationProgressState {
  totalFaceCount: number;
  workerCount: number;
  completedByChunk: number[];
  completedFaceCount: number;
}

/** The Surface diagnosis delivers a triangle soup (nine numbers per face).
 * A malformed remainder is one logical malformed target in the legacy policy;
 * it must never be sliced into a normal child face and silently truncated. */
export function hasMalformedSurfaceSupportClassificationFaceBuffer(valueCount: number): boolean {
  return !Number.isInteger(valueCount) || valueCount < 0 || valueCount % 9 !== 0;
}

export function countSurfaceSupportClassificationFaces(valueCount: number): number {
  if (!Number.isInteger(valueCount) || valueCount < 0) return 1;
  if (valueCount === 0) return 0;
  return hasMalformedSurfaceSupportClassificationFaceBuffer(valueCount) ? 1 : valueCount / 9;
}

/** Number of completed-face callbacks between progress messages. Keeping the
 * stride pure makes the child protocol's bounded message rate testable. */
export function surfaceSupportClassificationProgressStride(
  totalFaceCount: number,
  maximumUpdates = 100,
): number {
  const total = Math.max(0, Math.floor(Number.isFinite(totalFaceCount) ? totalFaceCount : 0));
  const updates = Math.max(1, Math.floor(Number.isFinite(maximumUpdates) ? maximumUpdates : 1));
  return Math.max(1, Math.ceil(total / updates));
}

export function shouldReportSurfaceSupportClassificationProgress(
  completedFaceCount: number,
  totalFaceCount: number,
  stride: number,
): boolean {
  const completed = Math.max(0, Math.floor(Number.isFinite(completedFaceCount) ? completedFaceCount : 0));
  const total = Math.max(0, Math.floor(Number.isFinite(totalFaceCount) ? totalFaceCount : 0));
  const boundedStride = Math.max(1, Math.floor(Number.isFinite(stride) ? stride : 1));
  return total > 0 && completed > 0 && (completed >= total || completed % boundedStride === 0);
}

function boundedInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

/** The requested count is hardware-derived; this function is intentionally
 * pure so the browser and planner tests use the same conservative rule. */
export function deriveSurfaceSupportClassificationWorkerCount(
  hardwareConcurrency: number | null | undefined,
): number {
  const hardware = hardwareConcurrency !== null
    && hardwareConcurrency !== undefined
    && Number.isFinite(hardwareConcurrency)
    && hardwareConcurrency > 0
    ? Math.floor(hardwareConcurrency)
    : 1;
  return Math.min(
    SURFACE_SUPPORT_CLASSIFICATION_MAX_WORKERS,
    Math.max(1, hardware - 1),
  );
}

/**
 * Bound worker fan-out by face count and by copies of the unchanged support
 * Surface. A zero-face diagnosis still has one logical worker so explicit
 * profile targets and the inline fallback retain a well-defined owner.
 */
export function planSurfaceSupportClassification(input: {
  requestedWorkerCount: number;
  dangerousFaceCount: number;
  scaledSupportSurfaceByteLength: number;
}): SurfaceSupportClassificationPlan {
  const requestedWorkerCount = Math.min(
    SURFACE_SUPPORT_CLASSIFICATION_MAX_WORKERS,
    boundedInteger(input.requestedWorkerCount, 1),
  );
  const dangerousFaceCount = Math.max(0, Math.floor(input.dangerousFaceCount));
  const surfaceBytes = Number.isFinite(input.scaledSupportSurfaceByteLength)
    ? Math.max(0, input.scaledSupportSurfaceByteLength)
    : 0;
  const memoryWorkerLimit = surfaceBytes > 0
    ? Math.max(1, Math.floor(SURFACE_SUPPORT_CLASSIFICATION_COPY_BUDGET_BYTES / surfaceBytes))
    : SURFACE_SUPPORT_CLASSIFICATION_MAX_WORKERS;
  const faceWorkerLimit = dangerousFaceCount > 0 ? dangerousFaceCount : 1;
  const workerCount = Math.max(1, Math.min(
    SURFACE_SUPPORT_CLASSIFICATION_MAX_WORKERS,
    requestedWorkerCount,
    faceWorkerLimit,
    memoryWorkerLimit,
  ));
  const chunks: SurfaceSupportClassificationChunkPlan[] = [];
  if (dangerousFaceCount > 0) {
    for (let chunkIndex = 0; chunkIndex < workerCount; chunkIndex++) {
      const startFaceIndex = Math.floor(chunkIndex * dangerousFaceCount / workerCount);
      const endFaceIndex = Math.floor((chunkIndex + 1) * dangerousFaceCount / workerCount);
      chunks.push({
        chunkIndex,
        startFaceIndex,
        endFaceIndex,
        faceCount: endFaceIndex - startFaceIndex,
      });
    }
  }
  return {
    requestedWorkerCount,
    workerCount,
    dangerousFaceCount,
    scaledSupportSurfaceByteLength: surfaceBytes,
    chunks,
  };
}

export function createSurfaceSupportClassificationProgressState(
  totalFaceCount: number,
  workerCount: number,
): SurfaceSupportClassificationProgressState {
  const boundedTotal = Math.max(0, Math.floor(totalFaceCount));
  const boundedWorkers = Math.max(1, Math.floor(workerCount));
  return {
    totalFaceCount: boundedTotal,
    workerCount: boundedWorkers,
    completedByChunk: new Array(boundedWorkers).fill(0),
    completedFaceCount: 0,
  };
}

/**
 * Update one child monotonically. The returned total is the sum of each
 * child's greatest observed completion, so child message arrival order cannot
 * make displayed progress move backwards or double-count a face.
 */
export function updateSurfaceSupportClassificationProgress(
  state: SurfaceSupportClassificationProgressState,
  chunkIndex: number,
  completedFaceCount: number,
): SurfaceSupportClassificationProgressState {
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= state.completedByChunk.length) return state;
  const completed = Math.max(0, Math.floor(Number.isFinite(completedFaceCount) ? completedFaceCount : 0));
  const completedByChunk = state.completedByChunk.slice();
  completedByChunk[chunkIndex] = Math.max(completedByChunk[chunkIndex], completed);
  const completedTotal = Math.min(
    state.totalFaceCount,
    completedByChunk.reduce((sum, value) => sum + value, 0),
  );
  return { ...state, completedByChunk, completedFaceCount: completedTotal };
}

/** Merge raw chunks, never routed/deduplicated chunks. Original face order is
 * represented by the contiguous ranges, not by child completion order. */
export function mergeSurfaceSupportClassificationRawChunks(
  chunks: readonly SurfaceSupportClassificationRawChunk[],
  dangerousFaceCount: number,
): MergedSurfaceSupportClassificationRaw {
  const expectedFaceCount = Math.max(0, Math.floor(dangerousFaceCount));
  const ordered = Array.from(chunks).sort((a, b) => a.chunk.startFaceIndex - b.chunk.startFaceIndex);
  let nextFaceIndex = 0;
  let totalEntryCount = 0;
  let totalPositionValueCount = 0;
  for (const result of ordered) {
    const { chunk } = result;
    if (chunk.startFaceIndex !== nextFaceIndex || chunk.endFaceIndex < chunk.startFaceIndex) {
      throw new Error("Fail closed: support classification chunks are not contiguous");
    }
    if (chunk.faceCount !== chunk.endFaceIndex - chunk.startFaceIndex) {
      throw new Error("Fail closed: support classification chunk face count is inconsistent");
    }
    totalEntryCount += result.entries.length;
    totalPositionValueCount += result.diagnosedFacePositionsMm.length;
    if (!Number.isSafeInteger(totalEntryCount) || !Number.isSafeInteger(totalPositionValueCount)) {
      throw new Error("Fail closed: support classification merged result is too large");
    }
    nextFaceIndex = chunk.endFaceIndex;
  }
  if (nextFaceIndex !== expectedFaceCount) {
    throw new Error("Fail closed: support classification chunks do not cover every dangerous face");
  }
  // Never expand a large Worker result as function arguments. Windows Chrome
  // can exceed the argument/stack limit on push-spread even though the data
  // itself fits comfortably in memory.
  const entries = new Array<OverhangAssignmentEntry>(totalEntryCount);
  const diagnosedFacePositionsMm = new Float32Array(totalPositionValueCount);
  let entryOffset = 0;
  let positionOffset = 0;
  for (const result of ordered) {
    for (const entry of result.entries) entries[entryOffset++] = entry;
    diagnosedFacePositionsMm.set(result.diagnosedFacePositionsMm, positionOffset);
    positionOffset += result.diagnosedFacePositionsMm.length;
  }
  return { entries, diagnosedFacePositionsMm };
}
