import assert from "node:assert/strict";
import type { Ball } from "../cloud-sculpt/field.ts";
import { estimateAutomaticOpeningOffsetUnits, hostGradientNormal, likelyOffsetMergedRegion, measureOpenings, prepareOpeningMeasurementPatches } from "./openingMap.ts";
import type { OpeningMapRequest } from "./openingMapWorkerProtocol.ts";
import { layoutOpeningLabelsOutside } from "./openingLabelLayout.ts";

let passed = 0;
function test(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`ok - ${name}`); }
  catch (error) { console.error(`FAIL - ${name}`); console.error(error); process.exitCode = 1; }
}

const host: Ball[] = [{ id: 1, x: 0, y: 0, z: 0, r: 2 }];
const request: OpeningMapRequest = {
  type: "measure", requestId: 1, generation: 0, host, hostK: 0.4, thickness: 0.4,
  patches: [{ id: 1, shape: "coin", points: [{ x: 2, y: 0, z: 0, r: 0.9 }] }],
  roundK: 0.05, coinBulge: 0, coinBulgeBalance: 0, quadMeshJoinWidth: 0, mode: "window",
  resolution: 24, targetLongestMm: 80, offsetMm: 0, minAreaMm2: 0.05,
};

test("host gradient is outward and deterministic on a sphere", () => {
  const n = hostGradientNormal(host, 0.4, { x: 2, y: 0, z: 0 }, 1e-4);
  assert.ok(n.x > 0.999 && Math.abs(n.y) < 1e-6 && Math.abs(n.z) < 1e-6);
});

test("measurement returns the exact-current-mesh scale and accepted regions", () => {
  const result = measureOpenings(request);
  assert.ok(result.scaleMmPerUnit > 0 && result.meshTriangles.length > 0 && result.openings.length > 0);
  for (const [index, opening] of result.openings.entries()) {
    assert.equal(opening.id, `O-${String(index + 1).padStart(3, "0")}`);
    assert.ok(opening.areaMm2 >= request.minAreaMm2 && opening.perimeterMm > 0 && Number.isFinite(opening.shapeIndex) && opening.triangles.length > 0);
  }
});

test("accepted IDs are deterministic and display filtering cannot renumber them", () => {
  const pick = () => measureOpenings(request).openings.map(({ id, areaMm2, centroid }) => ({ id, areaMm2, centroid }));
  assert.deepEqual(pick(), pick());
});

test("a positive offset that turns almost the whole surface into one region is flagged instead of presented as one ordinary hole", () => {
  assert.equal(likelyOffsetMergedRegion(2, 1, 0.95), true);
  assert.equal(likelyOffsetMergedRegion(0, 1, 0.95), false, "the physical host surface is not blamed on offset");
  assert.equal(likelyOffsetMergedRegion(2, 12, 0.95), false, "multiple measured regions are not the merged-one signature");
  assert.equal(likelyOffsetMergedRegion(2, 1, 0.5), false, "one local opening is not the near-global failure mode");
});

test("automatic layer stays at the host for flat motifs and follows raised motif bodies", () => {
  assert.ok(Math.abs(estimateAutomaticOpeningOffsetUnits(request)) < 1e-6);
  const raised = {
    ...request,
    automaticOffset: true,
    patches: [{ id: 2, shape: "flower" as const, points: [{ x: 2.4, y: 0, z: 0, r: 0.4 }] }],
  };
  assert.ok(estimateAutomaticOpeningOffsetUnits(raised) > 0.35);
  const measured = measureOpenings(raised);
  assert.equal(measured.automaticOffset, true);
  assert.ok(measured.offsetMm > 0);
});

test("legacy QUAD points use the mesh-join reinforced radius for measurement classification", () => {
  const legacy: OpeningMapRequest = {
    ...request,
    quadMeshJoinWidth: 0.2,
    patches: [{ id: 2, shape: "coin", quadCellId: 3, points: [{ x: 2, y: 0, z: 0, r: 0.5, fusionR: 0.1 }] }],
  };
  const measurementPatches = prepareOpeningMeasurementPatches(legacy);
  assert.equal(measurementPatches[0].points[0].r, 0.7);
  assert.equal(measurementPatches[0].points[0].meshJoinR, 0.2);
});

test("opening cards occupy unique perimeter slots outside the projected form", () => {
  const subject = { left: 210, top: 165, right: 590, bottom: 535 };
  const anchors = Array.from({ length: 12 }, (_, index) => ({
    x: 300 + (index % 4) * 65,
    y: 260 + Math.floor(index / 4) * 70,
  }));
  const positions = layoutOpeningLabelsOutside(anchors, {
    viewportWidth: 800,
    viewportHeight: 700,
    subjectRect: subject,
  });
  assert.equal(positions.length, anchors.length);
  assert.equal(new Set(positions.map(({ x, y }) => `${x.toFixed(3)},${y.toFixed(3)}`)).size, anchors.length);
  for (const position of positions) {
    const card = { left: position.x - 63, right: position.x + 63, top: position.y - 25, bottom: position.y + 25 };
    const overlaps = card.left < subject.right && card.right > subject.left && card.top < subject.bottom && card.bottom > subject.top;
    assert.equal(overlaps, false);
  }
});

test("opening cards choose the nearest clear side while keeping labels on-screen", () => {
  const positions = layoutOpeningLabelsOutside(
    [{ x: 155, y: 350 }, { x: 645, y: 350 }],
    {
      viewportWidth: 800,
      viewportHeight: 700,
      subjectRect: { left: 210, top: 165, right: 590, bottom: 535 },
    },
  );
  assert.ok(positions[0].x < 210);
  assert.ok(positions[1].x > 590);
  for (const position of positions) {
    assert.ok(position.x >= 71 && position.x <= 729);
    assert.ok(position.y >= 35 && position.y <= 665);
  }
});

test("opening cards avoid persistent viewport controls as well as the form", () => {
  const obstacle = { left: 0, top: 0, right: 285, bottom: 180 };
  const [position] = layoutOpeningLabelsOutside(
    [{ x: 180, y: 190 }],
    {
      viewportWidth: 880,
      viewportHeight: 720,
      subjectRect: { left: 210, top: 165, right: 680, bottom: 630 },
      obstacleRects: [obstacle],
    },
  );
  const card = { left: position.x - 63, right: position.x + 63, top: position.y - 25, bottom: position.y + 25 };
  const overlapsObstacle = card.left < obstacle.right && card.right > obstacle.left && card.top < obstacle.bottom && card.bottom > obstacle.top;
  assert.equal(overlapsObstacle, false);
});

console.log(`\n${passed} passed`);
if (!process.exitCode) console.log("ALL TESTS PASSED");
