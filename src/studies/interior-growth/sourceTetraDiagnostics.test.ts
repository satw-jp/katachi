import assert from "node:assert/strict";
import {
  buildMeshFromField,
  type Triangle,
} from "../cloud-sculpt/meshExport.ts";
import {
  DEFAULT_GROWTH_PARAMS,
  buildPlateOffset,
  computeDerivedLateralAllowance,
  findPrinterPreset,
  fitHostToBuildVolume,
  vNorm,
  type FabricationEnvelope,
  type HostFixtureId,
} from "./field.ts";
import { createUnitsFieldSampler, growNetwork } from "./growth.ts";
import {
  aboveBuildPlateSdf,
  buildCandidateMesh,
  computeUnitBounds,
} from "./meshExport.ts";
import { classifySolidTopology } from "./solidTopology.ts";
import {
  diagnoseShellSourceTetra,
  traceMeshSourceTetra,
  type DiagnosticField,
} from "./sourceTetraDiagnostics.ts";

const RESOLUTION = 64;

function triangleKey(triangle: Triangle): string {
  return [triangle.a, triangle.b, triangle.c]
    .map((p) => `${p.x},${p.y},${p.z}`)
    .sort()
    .join("|");
}

function fixture(hostId: HostFixtureId) {
  const preset = findPrinterPreset("bambu-a1-mini");
  const buildAxis = { x: 0, y: 1, z: 0 };
  const envelope: FabricationEnvelope = {
    buildAxis,
    layerHeightMm: 0.2,
    supportThresholdAngleDeg: 30,
    derivedMaxLateralAdvancePerLayerMm: computeDerivedLateralAllowance(0.2, 30),
  };
  const fit = fitHostToBuildVolume(hostId, buildAxis, preset.buildVolumeMm);
  const result = growNetwork(
    hostId,
    envelope,
    { ...DEFAULT_GROWTH_PARAMS, targetSurfaceCoverage: 0.25 },
    "ring-constrained",
    fit.scaleMmPerUnit,
  );
  const blendK = result.params.unitRadius * 0.3;
  const axis = vNorm(result.envelope.buildAxis);
  const plateOffset = buildPlateOffset(result.hostId, axis);
  const bounds = computeUnitBounds(result.units, result.hostId, blendK, axis, plateOffset);
  const materialAt = createUnitsFieldSampler(result.units, blendK);
  const savedField: DiagnosticField = (x, y, z) =>
    Math.max(materialAt(x, y, z), aboveBuildPlateSdf(x, y, z, axis, plateOffset));
  const mesh = buildCandidateMesh(result, RESOLUTION, blendK);
  const topology = classifySolidTopology(mesh.triangles, mesh.scaleMmPerUnit, {
    fieldAt: savedField,
    sourceGridStepFieldUnits: bounds.longest / RESOLUTION,
  });
  const traced = traceMeshSourceTetra(bounds, savedField, RESOLUTION);
  return { bounds, savedField, mesh, topology, traced };
}

const box = fixture("box");

{
  const production = buildMeshFromField(box.bounds, box.savedField, {
    resolution: RESOLUTION,
    targetLongestMm: 1,
  });
  assert.equal(box.traced.triangles.length, production.triangles.length);
  for (let i = 0; i < production.triangles.length; i++) {
    assert.equal(triangleKey(box.traced.triangles[i]), triangleKey(production.triangles[i]), `triangle ${i}`);
  }
  console.log("ok - C2 trace reproduces buildMeshFromField triangle geometry exactly");
}

const boxAmbiguous = box.topology.shells.filter((shell) => shell.kind === "ambiguous");
assert.equal(boxAmbiguous.length, 2);
const reports = boxAmbiguous.map((shell) =>
  diagnoseShellSourceTetra(
    shell,
    box.mesh.triangles,
    box.traced,
    shell.fieldBandFieldUnits ?? 0,
  ),
);

for (const report of reports) {
  assert.equal(report.matchedTriangleCount, report.triangleCount);
  assert.equal(report.mixedCornerTriangleCount, report.triangleCount);
  assert.ok(report.linearCentroidMaxAbs < 1e-6, JSON.stringify(report));
  assert.equal(report.centroidMaterialCount, 0);
  assert.equal(report.resolvedBoundaryCount, 0);
  assert.equal(report.classification, "undetermined");
}
console.log("ok - C2 maps every ambiguous box triangle to a mixed-sign source tetra and leaves both shells undetermined");

// The classification is intentionally pinned to the measured result, not to
// the previous 9-cavity expectation. If only some triangles are void on both
// sides, the whole shell remains undetermined rather than being rounded.
console.log(JSON.stringify(reports, null, 2));
