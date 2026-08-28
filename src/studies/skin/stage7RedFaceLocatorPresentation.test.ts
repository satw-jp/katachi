import {
  createStage7RedFaceLocatorPresentation,
  stage7RedFaceLocatorFaceCentroids,
  stage7RedFaceLocatorMarkerRadius,
  stage7RedFaceLocatorOverlayPolicy,
} from "./stage7RedFaceLocatorPresentation.ts";
import { createDryWebSupportSeparationPresentation } from "./dryWebSupportSeparationPresentation.ts";

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

const t0 = triangle(0);
const t1 = triangle(1);
const t2 = triangle(2);
const t3 = triangle(3);
const afterDangerPositions = concat(t0, t1, t2, t3);
const unresolvedPositions = concat(t1, t3);
const separation = {
  state: "current" as const,
  mitigatedPositions: new Float32Array(0),
  outsidePositions: new Float32Array(0),
  unresolvedPositions,
  mitigatedFaceCount: 0,
  outsideFaceCount: 2,
  unresolvedFaceCount: 2,
  totalFaceCount: 4,
  reason: "test",
};

const current = createStage7RedFaceLocatorPresentation({
  current: true,
  running: false,
  stale: false,
  separation,
  afterDangerPositions,
});
if (current.state !== "current"
  || !current.enabled
  || current.count !== 2
  || JSON.stringify(current.faceIds) !== JSON.stringify([1, 3])
  || current.status !== "赤 2面 / 診断face ID 1, 3") {
  throw new Error("current exact red faces must expose deterministic afterDanger ordinals");
}
if (current.redPositions === unresolvedPositions || current.redPositions[0] !== 1) {
  throw new Error("red locator positions must be an independent presentation copy");
}
const markerCentroids = stage7RedFaceLocatorFaceCentroids(current.redPositions);
const expectedCentroids = new Float32Array([
  1, 1 / 3, 1 / 3,
  3, 1 / 3, 1 / 3,
]);
if (markerCentroids.length !== expectedCentroids.length
  || markerCentroids.some((value, index) => value !== expectedCentroids[index])) {
  throw new Error("red locator must expose one centroid per triangle in exact source order");
}
const markerCentroidsRerun = stage7RedFaceLocatorFaceCentroids(current.redPositions);
if (markerCentroidsRerun.length !== markerCentroids.length
  || markerCentroidsRerun.some((value, index) => value !== markerCentroids[index])) {
  throw new Error("red locator centroids must be deterministic across reruns");
}
const markerRadius = stage7RedFaceLocatorMarkerRadius(new Float32Array([-2, -1, -3, 4, 5, 6]));
if (!(markerRadius > 0) || markerRadius !== stage7RedFaceLocatorMarkerRadius(new Float32Array([4, 5, 6, -2, -1, -3]))) {
  throw new Error("red locator marker radius must be deterministic from base bounds");
}
const invalidMarkerInput = stage7RedFaceLocatorFaceCentroids(new Float32Array([0, 0, 0, 1, 1, 1]));
const nonFiniteMarkerInput = stage7RedFaceLocatorFaceCentroids(new Float32Array([0, 0, 0, 1, 1, 1, Number.NaN, 0, 0]));
if (invalidMarkerInput.length !== 0 || nonFiniteMarkerInput.length !== 0
  || stage7RedFaceLocatorMarkerRadius(new Float32Array([0, 0, 0, Number.NaN, 1, 1])) !== 0) {
  throw new Error("invalid red-face or base buffers must fail closed without markers");
}
markerCentroids[0] = 77;
if (current.redPositions[0] !== 1) {
  throw new Error("centroid extraction must not mutate the exact red-face source");
}
const sourceSnapshot = unresolvedPositions.slice();
const idsSnapshot = [...current.faceIds];
current.redPositions[0] = 99;
if (unresolvedPositions[0] !== sourceSnapshot[0]
  || JSON.stringify(current.faceIds) !== JSON.stringify(idsSnapshot)) {
  throw new Error("toggling or editing presentation output must not mutate exact source facts");
}

const rerun = createStage7RedFaceLocatorPresentation({
  current: true,
  running: false,
  stale: false,
  separation,
  afterDangerPositions: afterDangerPositions.slice(),
});
if (JSON.stringify(rerun.faceIds) !== JSON.stringify(current.faceIds)
  || rerun.status !== current.status) {
  throw new Error("the same exact result must keep the same face IDs and status");
}

for (const [label, input] of [
  ["running", { current: false, running: true, stale: false }],
  ["stale", { current: false, running: false, stale: true }],
  ["missing", { current: false, running: false, stale: false }],
] as const) {
  const result = createStage7RedFaceLocatorPresentation({ ...input, separation, afterDangerPositions });
  if (result.state !== label || result.enabled || result.count !== 0 || result.faceIds.length !== 0 || result.redPositions.length !== 0) {
    throw new Error(`${label} result must disable the locator and clear old IDs`);
  }
}

const emptySeparation = createDryWebSupportSeparationPresentation({
  beforeDangerPositions: afterDangerPositions,
  afterDangerPositions: new Float32Array(0),
  mitigatedPositions: new Float32Array(0),
  entries: [],
});
const noRed = createStage7RedFaceLocatorPresentation({
  current: true,
  running: false,
  stale: false,
  separation: emptySeparation,
  afterDangerPositions: new Float32Array(0),
});
if (noRed.state !== "current" || noRed.enabled || noRed.count !== 0 || noRed.status !== "赤 0面 / 診断face ID なし") {
  throw new Error("a current exact result with no red faces must remain disabled");
}

const on = stage7RedFaceLocatorOverlayPolicy(current, true);
if (on.mode !== "red-only" || !on.dimNonRed || on.clearOverlay) {
  throw new Error("ON policy must dim context and keep the red-only overlay");
}
const off = stage7RedFaceLocatorOverlayPolicy(current, false);
if (off.mode !== "normal" || off.dimNonRed || !off.clearOverlay) {
  throw new Error("OFF policy must clear the overlay and restore normal ownership");
}
const staleOff = stage7RedFaceLocatorOverlayPolicy(
  createStage7RedFaceLocatorPresentation({ current: false, running: false, stale: true, separation, afterDangerPositions }),
  true,
);
if (staleOff.mode !== "normal" || staleOff.dimNonRed || !staleOff.clearOverlay) {
  throw new Error("stale state must fail closed to OFF cleanup even if visible was retained");
}

console.log("stage7RedFaceLocatorPresentation: current IDs/order, fail-closed states, immutability, and OFF policy passed");
