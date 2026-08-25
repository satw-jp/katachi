import assert from "node:assert/strict";
import test from "node:test";
import { applySupportPaintOverrides, buildSupportPaintFrame, createSupportPaintStroke, emptySupportPaint, type SupportPaintSite } from "./supportPaint.ts";
import { supportPaintReprojectionFacts } from "./supportPaintReprojection.ts";

const surface = new Float32Array([-10,-10,-10, 10,-10,-10, 10,10,10, -10,-10,-10, 10,10,10, -10,10,10]);
const frame = buildSupportPaintFrame(surface);
const paint = { ...emptySupportPaint(frame.longestMm), strokes: [createSupportPaintStroke({
  order: 0, mode: "inside", centerMm: { xMm: 5, yMm: 0, zMm: 0 }, radiusMm: 4,
  surfaceNormal: { xMm: 0, yMm: 0, zMm: 1 }, frame, paintBackfaces: false,
})] };

function sites(prefix: string): SupportPaintSite[] {
  return [
    { id: prefix+"-a", classification: "outside", positionMm: { xMm: 4, yMm: 0, zMm: 0 }, normal: { xMm: 0, yMm: 0, zMm: 1 } },
    { id: prefix+"-b", classification: "outside", positionMm: { xMm: 6, yMm: 0, zMm: 0 }, normal: { xMm: 0, yMm: 0, zMm: 1 } },
    { id: prefix+"-opposite", classification: "outside", positionMm: { xMm: 5, yMm: 0, zMm: 0 }, normal: { xMm: 0, yMm: 0, zMm: -1 } },
    { id: prefix+"-far", classification: "outside", positionMm: { xMm: -7, yMm: 0, zMm: 0 }, normal: { xMm: 0, yMm: 0, zMm: 1 } },
  ];
}

test("Surface 48 reprojection uses normalized region and normal rather than temporary site IDs", () => {
  const low = applySupportPaintOverrides({ sites: sites("low"), supportSurfacePositionsMm: surface, supportPaint: paint });
  const surface48 = applySupportPaintOverrides({ sites: sites("surface48"), supportSurfacePositionsMm: surface, supportPaint: paint });
  assert.deepEqual(low.sites.map((site) => site.classification), surface48.sites.map((site) => site.classification));
  assert.ok(surface48.sites.every((site) => !site.id.startsWith("low")));
  const facts = supportPaintReprojectionFacts({ resolution: 48, sites: surface48.sites, supportPaint: paint, frame: surface48.frame });
  assert.equal(facts.affectedInsideCount, 2);
  assert.equal(facts.affectedOutsideCount, 0);
  assert.equal(facts.oppositeNormalCount, 0);
  assert.equal(facts.outsideStoredRegionCount, 0);
  assert.equal(facts.regionMatch, true);
});

test("reprojection diagnostics fail region match for a corrupted opposite-side assignment", () => {
  const applied = applySupportPaintOverrides({ sites: sites("surface48"), supportSurfacePositionsMm: surface, supportPaint: paint });
  const corrupted = applied.sites.map((site) => site.id.endsWith("opposite")
    ? { ...site, supportPaintStrokeOrder: 0, supportPaintMode: "inside" as const }
    : site);
  const facts = supportPaintReprojectionFacts({ resolution: 48, sites: corrupted, supportPaint: paint, frame: applied.frame });
  assert.equal(facts.oppositeNormalCount, 1);
  assert.equal(facts.regionMatch, false);
});
