import {
  createDryWebSupportSeparationPresentation,
  dryWebSupportSeparationOutputBlockReason,
  dryWebSupportSeparationTriangleKey,
} from "./dryWebSupportSeparationPresentation.ts";
import type { OverhangAssignmentEntry } from "./overhangSupportPolicy.ts";

const triangle = (x: number): Float32Array => new Float32Array([
  x, 0, 0,
  x, 1, 0,
  x, 0, 1,
]);
const concat = (...parts: Float32Array[]): Float32Array => {
  const result = new Float32Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
};
const entry = (faceIndex: number, classification: string, duplicateOf?: string, siteIndex = 0): OverhangAssignmentEntry => ({
  id: `diagnosed-face:${faceIndex}`,
  source: "diagnosed-face",
  sourceIndex: faceIndex,
  siteIndex,
  faceIndex,
  classification: classification as OverhangAssignmentEntry["classification"],
  ...(duplicateOf ? { duplicateOf } : {}),
});
const outsideFaceEntries = (faceIndex: number): OverhangAssignmentEntry[] =>
  [0, 1, 2, 3].map((siteIndex) => entry(faceIndex, "outside", undefined, siteIndex));

const t0 = triangle(0);
const t1 = triangle(1);
const t2 = triangle(2);
const before = concat(t0, t1, t2);
const after = concat(t0, t1);
const mitigated = t2.slice();
const beforeSnapshot = before.slice();
const afterSnapshot = after.slice();
const mitigatedSnapshot = mitigated.slice();
const current = createDryWebSupportSeparationPresentation({
  beforeDangerPositions: before,
  afterDangerPositions: after,
  mitigatedPositions: mitigated,
  entries: [...outsideFaceEntries(0), ...outsideFaceEntries(1), ...outsideFaceEntries(2).map((item) => ({ ...item, classification: "inside" as OverhangAssignmentEntry["classification"] }))],
});
if (current.state !== "current"
  || current.mitigatedFaceCount !== 1
  || current.outsideFaceCount !== 2
  || current.unresolvedFaceCount !== 0
  || current.totalFaceCount !== 3) {
  throw new Error("current separation must expose exact three-way counts");
}
if (current.outsidePositions[0] !== 0 || current.outsidePositions[9] !== 1) {
  throw new Error("all-outside-only faces must be orange candidates in after order");
}
if (JSON.stringify(current.outsideSourceFaceIndices) !== JSON.stringify([0, 1])
  || Object.isFrozen(current.outsideSourceFaceIndices) === false) {
  throw new Error("orange faces must preserve immutable exact source-face indices in order");
}
if (JSON.stringify(before) !== JSON.stringify(beforeSnapshot)
  || JSON.stringify(after) !== JSON.stringify(afterSnapshot)
  || JSON.stringify(mitigated) !== JSON.stringify(mitigatedSnapshot)) {
  throw new Error("separation must not mutate source buffers");
}
current.outsidePositions[0] = 99;
if (before[0] === 99 || after[0] === 99 || mitigated[0] === 99) {
  throw new Error("separation output buffers must be independent copies");
}

const redTriangles = [
  triangle(10), // inside
  triangle(11), // unresolved
  triangle(12), // mixed
  triangle(13), // duplicate site
  triangle(14), // missing site
  triangle(15), // unknown classification
  triangle(16), // duplicate original occurrence (index 6)
  triangle(17), // unknown classification
];
const duplicateOriginal = redTriangles[6];
const redBefore = concat(...redTriangles, duplicateOriginal);
const unmatched = triangle(99);
const redAfter = concat(...redTriangles, unmatched);
const redResult = createDryWebSupportSeparationPresentation({
  beforeDangerPositions: redBefore,
  afterDangerPositions: redAfter,
  mitigatedPositions: new Float32Array(0),
  entries: [
    entry(0, "inside"),
    entry(1, "unresolved"),
    entry(2, "outside"), entry(2, "inside"),
    entry(3, "outside", "diagnosed-face:3:site:1"),
    entry(5, "unknown"),
    entry(6, "outside"),
    entry(7, "unknown"),
  ],
});
if (redResult.state !== "current"
  || redResult.outsideFaceCount !== 0
  || redResult.unresolvedFaceCount !== redAfter.length / 9
  || redResult.totalFaceCount !== redAfter.length / 9) {
  throw new Error("inside/unresolved/mixed/duplicate/missing/unknown/ambiguous/unmatched faces must be red");
}
if (redResult.mitigatedFaceCount + redResult.outsideFaceCount + redResult.unresolvedFaceCount
  !== redResult.totalFaceCount) {
  throw new Error("three-way separation counts must partition all faces");
}

const keyA = dryWebSupportSeparationTriangleKey(t0, 0);
const keyB = dryWebSupportSeparationTriangleKey(t0.slice(), 0);
if (keyA !== keyB) throw new Error("Float32 triangle keys must be deterministic");
const signedZeroA = new Float32Array([0, 0, 0, 0, 1, 0, 0, 0, 1]);
const signedZeroB = new Float32Array([-0, 0, 0, 0, 1, 0, 0, 0, 1]);
if (dryWebSupportSeparationTriangleKey(signedZeroA, 0) === dryWebSupportSeparationTriangleKey(signedZeroB, 0)) {
  throw new Error("Float32 triangle keys must retain exact bit patterns");
}

const cleared = createDryWebSupportSeparationPresentation(null);
if (cleared.state !== "missing"
  || cleared.mitigatedFaceCount !== 0
  || cleared.outsideFaceCount !== 0
  || cleared.unresolvedFaceCount !== 0
  || cleared.outsidePositions.length !== 0) {
  throw new Error("cleared/off separation must remove counts and buffers");
}
const malformed = createDryWebSupportSeparationPresentation({
  beforeDangerPositions: new Float32Array([Number.NaN]),
  afterDangerPositions: new Float32Array(0),
  mitigatedPositions: new Float32Array(0),
  entries: [],
});
if (malformed.state !== "missing" || malformed.totalFaceCount !== 0 || malformed.outsidePositions.length !== 0) {
  throw new Error("malformed/non-finite input must fail closed with no stale display data");
}
const redReason = dryWebSupportSeparationOutputBlockReason("targetedGrid", redResult);
if (redReason !== `内部/不明の未支持面が${redResult.unresolvedFaceCount}面残っています。Dry Webを調整して再診断してください`) {
  throw new Error("red separation must block targetedGrid progression with exact reason");
}
if (dryWebSupportSeparationOutputBlockReason("targetedGrid", current) !== null
  || dryWebSupportSeparationOutputBlockReason("targetedGrid", cleared) !== "Dry Web付加後の支持分離が未確認です"
  || dryWebSupportSeparationOutputBlockReason("voronoiEdge", cleared) !== null
  || dryWebSupportSeparationOutputBlockReason("none", null) !== null) {
  throw new Error("output block must be current targetedGrid-only and fail closed");
}

const benchmarkFaceCount = 100_000;
const benchmarkBefore = new Float32Array(benchmarkFaceCount * 9);
for (let faceIndex = 0; faceIndex < benchmarkFaceCount; faceIndex++) {
  const offset = faceIndex * 9;
  benchmarkBefore[offset] = faceIndex;
  benchmarkBefore[offset + 3] = faceIndex;
  benchmarkBefore[offset + 4] = 1;
  benchmarkBefore[offset + 6] = faceIndex;
  benchmarkBefore[offset + 8] = 1;
}
const benchmarkStartedAt = Date.now();
const benchmark = createDryWebSupportSeparationPresentation({
  beforeDangerPositions: benchmarkBefore,
  afterDangerPositions: benchmarkBefore,
  mitigatedPositions: new Float32Array(0),
  entries: [],
});
const benchmarkElapsedMs = Date.now() - benchmarkStartedAt;
if (benchmark.state !== "current"
  || benchmark.unresolvedFaceCount !== benchmarkFaceCount
  || benchmark.totalFaceCount !== benchmarkFaceCount) {
  throw new Error("100,000-face deterministic benchmark must preserve all unresolved faces");
}

console.log(`dryWebSupportSeparationPresentation: three-way counts/keys/immutability/blocking passed; benchmark ${benchmarkFaceCount} faces in ${benchmarkElapsedMs}ms`);
