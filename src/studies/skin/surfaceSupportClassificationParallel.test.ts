import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyRawOverhangTargets,
  assignOverhangSupportTargets,
  routeClassifiedSupportSites,
  toOverhangSupportRayFacts,
  type OverhangExplicitTargetMm,
} from "./overhangSupportPolicy.ts";
import { createSupportReachabilityIndex } from "./supportReachability.ts";
import {
  createSurfaceSupportClassificationProgressState,
  countSurfaceSupportClassificationFaces,
  deriveSurfaceSupportClassificationWorkerCount,
  hasMalformedSurfaceSupportClassificationFaceBuffer,
  mergeSurfaceSupportClassificationRawChunks,
  planSurfaceSupportClassification,
  shouldReportSurfaceSupportClassificationProgress,
  surfaceSupportClassificationProgressStride,
  updateSurfaceSupportClassificationProgress,
  type SurfaceSupportClassificationRawChunk,
} from "./surfaceSupportClassificationParallel.ts";

function face(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): Float32Array {
  return new Float32Array([ax, ay, az, bx, by, bz, cx, cy, cz]);
}

function shiftFace(source: Float32Array, shift: number): Float32Array {
  const result = source.slice();
  for (let offset = 0; offset < result.length; offset += 3) {
    result[offset] += shift;
    result[offset + 1] += shift;
    result[offset + 2] += shift;
  }
  return result;
}

function supportFreeSurface(): Float32Array {
  return new Float32Array([
    0, 0, 0, 10, 0, 0, 10, 10, 0,
    0, 0, 0, 10, 10, 0, 0, 10, 0,
  ]);
}

function parallelPureResult(
  diagnosedFaces: readonly (Float32Array | readonly number[])[],
  explicitTargets: readonly OverhangExplicitTargetMm[],
  supportSurfacePositionsMm: Float32Array,
): ReturnType<typeof assignOverhangSupportTargets> {
  const indexForPlan = createSupportReachabilityIndex(supportSurfacePositionsMm);
  const plan = planSurfaceSupportClassification({
    requestedWorkerCount: 4,
    dangerousFaceCount: diagnosedFaces.length,
    scaledSupportSurfaceByteLength: supportSurfacePositionsMm.byteLength,
  });
  const chunks: SurfaceSupportClassificationRawChunk[] = plan.chunks.map((chunk) => {
    // Each child receives its own copy of the same final Surface. The index
    // and classifier are otherwise the same pure code used by assign().
    const childIndex = createSupportReachabilityIndex(supportSurfacePositionsMm.slice());
    const raw = classifyRawOverhangTargets({
      rayIndex: childIndex,
      targets: diagnosedFaces.slice(chunk.startFaceIndex, chunk.endFaceIndex)
        .map((positionsMm) => ({ source: "diagnosed-face" as const, positionsMm })),
      diagnosedFaceSourceIndexOffset: chunk.startFaceIndex,
    });
    return { chunk, entries: raw.entries, diagnosedFacePositionsMm: raw.diagnosedFacePositionsMm };
  });
  const merged = mergeSurfaceSupportClassificationRawChunks(chunks, diagnosedFaces.length);
  const explicitRaw = classifyRawOverhangTargets({
    rayIndex: indexForPlan,
    targets: explicitTargets.map((target) => ({
      source: "explicit-profile" as const,
      positionMm: target,
      patchId: target.patchId,
      contactRadiusMm: target.contactRadiusMm,
      contactOverlapMm: target.contactOverlapMm,
    })),
  });
  const rayFacts = toOverhangSupportRayFacts(indexForPlan);
  return routeClassifiedSupportSites({
    sites: [...merged.entries, ...explicitRaw.entries],
    deduplicationToleranceMm: rayFacts.lowerIntersectionEpsilonMm,
    diagnosedFacePositionsMm: merged.diagnosedFacePositionsMm,
    baseFootprint: null,
    rayFacts,
    supportSurfacePositionsMm,
  });
}

test("parallel raw chunks plus one global route exactly match the single-call oracle", () => {
  const original = face(1, 1, 3, 2, 1, 3, 1, 2, 3);
  const outside = face(20, 20, 3, 21, 20, 3, 20, 21, 3);
  const mixed = face(1, 1, 3, 20, 1, 3, 1, 20, 3);
  const malformed = new Float32Array([Number.NaN, 0, 3, 1, 0, 3, 0, 1, 3]);
  const diagnosedFaces = [
    original,
    outside,
    original.slice(), // exact duplicate crosses chunk boundary with face 0
    shiftFace(original, 0.0004), // near duplicate is retained in exact map
    shiftFace(original, 0.0004).slice(), // exact copy of an omitted near site
    mixed,
    outside.slice(),
    malformed,
  ];
  const explicitTargets: OverhangExplicitTargetMm[] = [
    { xMm: 1, yMm: 1, zMm: 3 }, // exact duplicate of a diagnosed sample
    { xMm: 20, yMm: 20, zMm: 3 },
    { xMm: Number.NaN, yMm: 0, zMm: 0 }, // malformed explicit target
  ];
  const supportSurface = supportFreeSurface();
  const single = assignOverhangSupportTargets({
    diagnosedFaces,
    explicitTargets,
    supportSurfacePositionsMm: supportSurface,
  });
  const parallel = parallelPureResult(diagnosedFaces, explicitTargets, supportSurface);
  assert.deepEqual(parallel, single, "parallel output is byte/logically identical to the single-call oracle");
  assert.ok(parallel.mixedFaceIndices.includes(5), "mixed face is retained by the global route");
  assert.ok(parallel.entries.some((entry) => entry.source === "explicit-profile" && entry.sourceIndex === 2 && entry.classification === "unresolved"));
  assert.ok(parallel.entries.some((entry) => entry.duplicateOf === "diagnosed-face:000003:site:0"), "cross-chunk near duplicate keeps historical exact-map ordering");
  assert.equal(parallel.diagnosedFacePositionsMm.length, 7 * 9, "malformed face is excluded from diagnosed position evidence");
});

test("stable raw merge is independent of child completion order", () => {
  const raw = (start: number, end: number): SurfaceSupportClassificationRawChunk => ({
    chunk: { chunkIndex: start / 2, startFaceIndex: start, endFaceIndex: end, faceCount: end - start },
    entries: Array.from({ length: end - start }, (_, offset) => ({
      id: `diagnosed-face:${String(start + offset).padStart(6, "0")}:site:0`,
      source: "diagnosed-face" as const,
      sourceIndex: start + offset,
      siteIndex: 0,
      faceIndex: start + offset,
      classification: "outside" as const,
    })),
    diagnosedFacePositionsMm: new Float32Array((end - start) * 9),
  });
  const chunks = [raw(0, 2), raw(2, 4), raw(4, 6)];
  const ordered = mergeSurfaceSupportClassificationRawChunks(chunks, 6);
  const completedInReverse = mergeSurfaceSupportClassificationRawChunks(chunks.slice().reverse(), 6);
  assert.deepEqual(completedInReverse, ordered);
  assert.deepEqual(ordered.entries.map((entry) => entry.sourceIndex), [0, 1, 2, 3, 4, 5]);
});

test("large raw merge is stack-safe beyond browser argument expansion limits", () => {
  const totalFaceCount = 30_000;
  const facesPerChunk = totalFaceCount / 2;
  const chunks: SurfaceSupportClassificationRawChunk[] = [];
  for (let chunkIndex = 0; chunkIndex < 2; chunkIndex++) {
    const startFaceIndex = chunkIndex * facesPerChunk;
    const endFaceIndex = startFaceIndex + facesPerChunk;
    const positionValueCount = facesPerChunk * 9;
    const diagnosedFacePositionsMm = new Float32Array(positionValueCount);
    for (let index = 0; index < positionValueCount; index++) {
      diagnosedFacePositionsMm[index] = startFaceIndex * 9 + index + 0.25;
    }
    const entries = new Array<SurfaceSupportClassificationRawChunk["entries"][number]>(facesPerChunk);
    for (let index = 0; index < facesPerChunk; index++) {
      const sourceIndex = startFaceIndex + index;
      entries[index] = {
        id: `diagnosed-face:${String(sourceIndex).padStart(6, "0")}:site:0`,
        source: "diagnosed-face",
        sourceIndex,
        siteIndex: 0,
        faceIndex: sourceIndex,
        classification: "outside",
      };
    }
    chunks.push({
      chunk: { chunkIndex, startFaceIndex, endFaceIndex, faceCount: facesPerChunk },
      entries,
      diagnosedFacePositionsMm,
    });
  }

  const merged = mergeSurfaceSupportClassificationRawChunks(chunks.reverse(), totalFaceCount);
  assert.equal(merged.entries.length, totalFaceCount);
  assert.equal(merged.entries[0].sourceIndex, 0);
  assert.equal(merged.entries[facesPerChunk].sourceIndex, facesPerChunk);
  assert.equal(merged.entries.at(-1)?.sourceIndex, totalFaceCount - 1);
  assert.equal(merged.diagnosedFacePositionsMm.length, totalFaceCount * 9);
  assert.equal(merged.diagnosedFacePositionsMm[0], 0.25);
  assert.equal(merged.diagnosedFacePositionsMm[facesPerChunk * 9], facesPerChunk * 9 + 0.25);
  assert.equal(merged.diagnosedFacePositionsMm.at(-1), totalFaceCount * 9 - 1 + 0.25);
});

test("planner respects hardware, face, eight-worker and conservative copy-budget boundaries", () => {
  assert.equal(deriveSurfaceSupportClassificationWorkerCount(1), 1);
  assert.equal(deriveSurfaceSupportClassificationWorkerCount(4), 3);
  assert.equal(deriveSurfaceSupportClassificationWorkerCount(20), 8);

  const zero = planSurfaceSupportClassification({ requestedWorkerCount: 8, dangerousFaceCount: 0, scaledSupportSurfaceByteLength: 1 });
  assert.equal(zero.workerCount, 1);
  assert.deepEqual(zero.chunks, []);

  const small = planSurfaceSupportClassification({ requestedWorkerCount: 8, dangerousFaceCount: 3, scaledSupportSurfaceByteLength: 1 });
  assert.equal(small.workerCount, 3);
  assert.deepEqual(small.chunks.map((chunk) => [chunk.startFaceIndex, chunk.endFaceIndex]), [[0, 1], [1, 2], [2, 3]]);

  // The coordinator keeps this one-worker plan inline; a nested copy/index
  // would only add startup work and cannot improve utilization.
  const single = planSurfaceSupportClassification({ requestedWorkerCount: 8, dangerousFaceCount: 1, scaledSupportSurfaceByteLength: 1 });
  assert.equal(single.workerCount, 1);
  assert.deepEqual(single.chunks, [{ chunkIndex: 0, startFaceIndex: 0, endFaceIndex: 1, faceCount: 1 }]);

  const many = planSurfaceSupportClassification({ requestedWorkerCount: 20, dangerousFaceCount: 20, scaledSupportSurfaceByteLength: 1 });
  assert.equal(many.workerCount, 8);
  assert.deepEqual(many.chunks[0], { chunkIndex: 0, startFaceIndex: 0, endFaceIndex: 2, faceCount: 2 });
  assert.deepEqual(many.chunks.at(-1), { chunkIndex: 7, startFaceIndex: 17, endFaceIndex: 20, faceCount: 3 });
  assert.equal(many.chunks.reduce((sum, chunk) => sum + chunk.faceCount, 0), 20);
  let nextFaceIndex = 0;
  for (const chunk of many.chunks) {
    assert.equal(chunk.startFaceIndex, nextFaceIndex);
    assert.equal(chunk.endFaceIndex - chunk.startFaceIndex, chunk.faceCount);
    nextFaceIndex = chunk.endFaceIndex;
  }
  assert.equal(nextFaceIndex, 20);

  const halfBudget = planSurfaceSupportClassification({
    requestedWorkerCount: 8,
    dangerousFaceCount: 20,
    scaledSupportSurfaceByteLength: 192 * 1024 * 1024,
  });
  assert.equal(halfBudget.workerCount, 2);
  const overBudget = planSurfaceSupportClassification({
    requestedWorkerCount: 8,
    dangerousFaceCount: 20,
    scaledSupportSurfaceByteLength: 385 * 1024 * 1024,
  });
  assert.equal(overBudget.workerCount, 1, "minimum one worker is retained even when one copy exceeds the cap");
  assert.ok(overBudget.workerCount <= 8);
});

test("malformed dangerous-face buffers stay one logical face for the inline exact path", () => {
  assert.equal(hasMalformedSurfaceSupportClassificationFaceBuffer(10), true);
  assert.equal(countSurfaceSupportClassificationFaces(10), 1);
  assert.equal(hasMalformedSurfaceSupportClassificationFaceBuffer(18), false);
  assert.equal(countSurfaceSupportClassificationFaces(18), 2);
  const malformedPlan = planSurfaceSupportClassification({
    requestedWorkerCount: 8,
    dangerousFaceCount: countSurfaceSupportClassificationFaces(10),
    scaledSupportSurfaceByteLength: 1,
  });
  assert.equal(malformedPlan.workerCount, 1);
  assert.deepEqual(malformedPlan.chunks, [{
    chunkIndex: 0,
    startFaceIndex: 0,
    endFaceIndex: 1,
    faceCount: 1,
  }]);
});

test("child progress stride emits at most about one hundred updates and always emits final", () => {
  const totalFaceCount = 1_000;
  const stride = surfaceSupportClassificationProgressStride(totalFaceCount);
  const reported: number[] = [];
  for (let completed = 1; completed <= totalFaceCount; completed++) {
    if (shouldReportSurfaceSupportClassificationProgress(completed, totalFaceCount, stride)) reported.push(completed);
  }
  assert.equal(stride, 10);
  assert.equal(reported.length, 100);
  assert.equal(reported.at(-1), totalFaceCount);
  assert.equal(shouldReportSurfaceSupportClassificationProgress(0, totalFaceCount, stride), false);
  assert.equal(shouldReportSurfaceSupportClassificationProgress(7, totalFaceCount, stride), false);
});

test("progress aggregation is monotonic and counts each child's completed faces once", () => {
  let state = createSurfaceSupportClassificationProgressState(9, 3);
  const observed: number[] = [];
  const update = (chunkIndex: number, completed: number): void => {
    state = updateSurfaceSupportClassificationProgress(state, chunkIndex, completed);
    observed.push(state.completedFaceCount);
  };
  update(2, 3);
  update(0, 2);
  update(1, 4);
  update(2, 1); // late stale child progress cannot decrease the total
  update(0, 2); // duplicate completion is idempotent
  assert.deepEqual(observed, [3, 5, 9, 9, 9]);
  assert.ok(observed.every((value, index) => index === 0 || value >= observed[index - 1]));
  assert.deepEqual(state.completedByChunk, [2, 4, 3]);
});
