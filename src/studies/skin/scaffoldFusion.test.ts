import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMeshFromField, inspectSavedStlTopology, orientMeshForSavedStl } from "../cloud-sculpt/meshExport.ts";
import { combineWithScaffoldSdf, expandBoundsWithScaffold, expandScaffoldSamplingGrid, inspectFusedScaffoldPlateAnchoring, type SkinScaffoldPillar } from "./scaffoldFusion.ts";

const pillar: SkinScaffoldPillar = {
  x: 0, y: 0, plateZ: 0, topZ: 1.58,
  shaftRadius: 0.16, baseRadius: 0.22, tipRadius: 0.1,
  baseHeight: 0.2, tipHeight: 0.3,
};

test("fused scaffold closes at the plate and makes a floating body one component", () => {
  const body = (x: number, y: number, z: number): number => Math.hypot(x, y, z - 2) - 0.5;
  const sdf = combineWithScaffoldSdf(body, [pillar]);
  assert.ok(sdf(0, 0, -0.01) > 0, "the field is outside immediately below the plate");
  assert.ok(sdf(0, 0, 0.01) < 0, "the field is inside immediately above the plate");
  assert.ok(sdf(pillar.baseRadius * 0.85, 0, pillar.baseHeight * 0.25) < 0, "the broad pad keeps printable width through layer 1");
  assert.ok(sdf(pillar.baseRadius * 0.85, 0, -0.01) > 0, "the broad pad does not extend below the plate");
  assert.ok(sdf(0, 0, 1.5) < 0, "tip overlaps the body underside");
  assert.ok(sdf(0, 0, 0.4) < 0, "shaft is solid");
  assert.ok(sdf(pillar.shaftRadius * 0.8, 0, pillar.baseHeight * 0.6) < 0, "shaft overlaps the broad pad below its pinched top");
  assert.ok(sdf(0.5, 0, 0.4) > 0, "space beside the shaft remains empty");
  const baseBounds = {
    min: { x: -0.7, y: -0.7, z: 0.3 }, max: { x: 0.7, y: 0.7, z: 2.7 },
    size: { x: 1.4, y: 1.4, z: 2.4 }, longest: 2.4,
  };
  const mesh = buildMeshFromField(expandBoundsWithScaffold(baseBounds, [pillar]), sdf, {
    resolution: 64, targetLongestMm: 30,
  });
  const before = inspectSavedStlTopology(mesh.triangles, mesh.scaleMmPerUnit);
  assert.equal(before.closed, true);
  assert.equal(before.connectedComponents, 1);
  const repaired = orientMeshForSavedStl(mesh);
  assert.equal(inspectSavedStlTopology(repaired.triangles, repaired.scaleMmPerUnit).ok, true);
  const anchor = inspectFusedScaffoldPlateAnchoring(repaired, [pillar]);
  assert.equal(anchor.ok, true);
  assert.ok(Math.abs(anchor.plateClearanceMm) <= 0.05);
  assert.ok(anchor.minimumFirstLayerFootprintMm >= anchor.requiredBaseDiameterMm);
  assert.equal(inspectFusedScaffoldPlateAnchoring(repaired, [{ ...pillar, baseRadius: 0.02 }]).ok, false);
  assert.equal(inspectFusedScaffoldPlateAnchoring(repaired, [{ ...pillar, baseHeight: 0.005 }]).ok, false);
  assert.equal(inspectFusedScaffoldPlateAnchoring(repaired, [{ ...pillar, plateZ: 0.5 }]).ok, false);
});


test("broad pad changes XY bounds without shifting the scaffold Z sampling margin", () => {
  const bounds = {
    min: { x: -0.1, y: -0.1, z: 0.5 }, max: { x: 0.1, y: 0.1, z: 1 },
    size: { x: 0.2, y: 0.2, z: 0.5 }, longest: 0.5,
  };
  const narrow = expandBoundsWithScaffold(bounds, [{ ...pillar, baseRadius: 0.22 }]);
  const broad = expandBoundsWithScaffold(bounds, [{ ...pillar, baseRadius: 0.85 }]);
  assert.ok(broad.min.x < narrow.min.x);
  assert.ok(broad.max.x > narrow.max.x);
  assert.equal(broad.min.z, narrow.min.z);
  assert.equal(broad.max.z, narrow.max.z);
});


test("broad pad extension preserves the proven contact-grid pitch and phase", () => {
  const bounds = {
    min: { x: -0.73, y: -0.41, z: 0.37 }, max: { x: 0.91, y: 1.99, z: 2.12 },
    size: { x: 1.64, y: 2.4, z: 1.75 }, longest: 2.4,
  };
  const resolution = 96;
  const raw = expandBoundsWithScaffold(bounds, [pillar]);
  const contactPillar = { ...pillar, baseRadius: Math.max(pillar.shaftRadius, pillar.tipRadius) };
  const contactBounds = expandBoundsWithScaffold(bounds, [contactPillar]);
  const grid = expandScaffoldSamplingGrid(bounds, [pillar], resolution);
  const originalStep = contactBounds.longest / resolution;
  assert.ok(Math.abs(grid.step - originalStep) < 1e-12);
  assert.ok(Math.abs(grid.bounds.longest / grid.resolution - originalStep) < 1e-12);
  assert.ok(grid.bounds.min.x <= raw.min.x && grid.bounds.max.x >= raw.max.x);
  assert.ok(grid.bounds.min.y <= raw.min.y && grid.bounds.max.y >= raw.max.y);
  assert.ok(grid.bounds.min.z <= raw.min.z && grid.bounds.max.z >= raw.max.z);
  for (const axis of ["x", "y", "z"] as const) {
    const phaseCells = (contactBounds.min[axis] - grid.bounds.min[axis]) / originalStep;
    assert.ok(Math.abs(phaseCells - Math.round(phaseCells)) < 1e-9);
    const sizeCells = grid.bounds.size[axis] / originalStep;
    assert.ok(Math.abs(sizeCells - Math.round(sizeCells)) < 1e-9);
  }
  const unchanged = expandScaffoldSamplingGrid(bounds, [], resolution);
  assert.deepEqual(unchanged.bounds, bounds);
  assert.equal(unchanged.resolution, resolution);
});
