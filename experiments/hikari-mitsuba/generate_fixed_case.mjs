import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { replay } from "../../src/studies/cloud-sculpt/history.ts";
import { DEFAULT_HIKARI_SETTINGS } from "../../src/studies/cloud-sculpt/hikari.ts";
import {
  buildCloudMesh,
  computeMeshVolume,
  encodeObj,
  inspectSavedStlTopology,
  orientMeshForSavedStl,
} from "../../src/studies/cloud-sculpt/meshExport.ts";
import { buildCloudOpticalScene } from "../../src/studies/cloud-sculpt/opticalSceneAdapter.ts";
import { computeSamplingBounds } from "../../src/studies/cloud-sculpt/meshExport.ts";

const REPOSITORY = "satw-jp/katachi";
const SOURCE_COMMIT = "586a20cedfca9e769f710cfd96a400b4737069d5";
const OUTPUT_DIR = resolve("experiments/hikari-mitsuba/outputs");
const DOCUMENT_PATH = "docs/hikari/cases/hikari-blender-backlight-study.hkr";

await mkdir(OUTPUT_DIR, { recursive: true });
const document = JSON.parse(await readFile(resolve(DOCUMENT_PATH), "utf8"));
const sourceCase = document.views[0].case;
const historyEntries = sourceCase.shape.recipeEntries;
const state = replay(historyEntries);

const settings = {
  ...DEFAULT_HIKARI_SETTINGS,
  phenomenon: "optics",
  opticalView: "natural",
  opticalColorMode: "color",
  rainbowModel: "prism",
  dispersion: 0,
  ior: 1.5,
  absorption: 2.5,
  hostPreset: "neutral",
  hostTransmissionColor: "#ffffff",
  inclusionEnabled: false,
  daylightMode: "manual",
  lightAngle: -24,
  lightWidth: 1,
  sunSize: 0.53,
  opticalSeed: "sun-01",
  opticalSampleCount: 16384,
};
const adapter = buildCloudOpticalScene(state.balls, state.params.k, settings);
if (adapter.issues.length > 0) throw new Error(`OpticalScene is invalid: ${adapter.issues.join("; ")}`);

// The first pass discovers the generated field bounds. The second pass uses
// the existing Hikari mesh path with the explicit 20 mm/shape-unit assumption.
const fieldBounds = computeSamplingBounds(state.balls, state.params.k);
const probeMesh = buildCloudMesh(state.balls, state.params.k, {
  resolution: 64,
  targetLongestMm: 1,
});
const targetLongestMm = probeMesh.sourceBounds.longest * adapter.scene.physicalScale.mmPerShapeUnit;
const mesh = orientMeshForSavedStl(buildCloudMesh(state.balls, state.params.k, {
  resolution: 64,
  targetLongestMm,
}));
const obj = encodeObj(mesh);
const objPath = resolve(OUTPUT_DIR, "P0-colored-shadow.obj");
await writeFile(objPath, obj, "utf8");
const objSha256 = createHash("sha256").update(obj, "utf8").digest("hex");
const savedTopology = inspectSavedStlTopology(mesh.triangles, mesh.scaleMmPerUnit);

const canonicalShape = {
  kind: "balls-smooth-union",
  smoothness: state.params.k,
  balls: state.balls.map(({ x, y, z, r }) => ({
    center: { x, y, z },
    radius: r,
  })),
};
const canonicalShapeJson = JSON.stringify(canonicalShape);
const shapeSha256 = createHash("sha256").update(canonicalShapeJson, "utf8").digest("hex");
const mm = adapter.scene.physicalScale.mmPerShapeUnit;
const scalePoint = (value) => value * mm;
const point = (value) => ({ x: scalePoint(value.x), y: scalePoint(value.y), z: scalePoint(value.z) });
const settingsAbsorptionPerShapeUnit = {
  r: adapter.hostAbsorptionPerShapeUnit.r,
  g: adapter.hostAbsorptionPerShapeUnit.g,
  b: adapter.hostAbsorptionPerShapeUnit.b,
};
const absorptionPerMm = adapter.scene.host.material.absorptionPerMm;
const sourceCamera = sourceCase.camera;

const fixedCase = {
  schema: "hikari-mitsuba-spike-case",
  schemaVersion: 1,
  caseId: "P0-colored-shadow",
  purpose: "One existing Hikari fixed case transferred to an isolated Mitsuba physical reference.",
  repository: REPOSITORY,
  sourceCommit: SOURCE_COMMIT,
  productionBaseline: `main@${SOURCE_COMMIT}`,
  sourceDocument: DOCUMENT_PATH,
  sourceDocumentCaseId: sourceCase.caseId,
  sourceDocumentCommit: sourceCase.commit,
  sourceDocumentVersion: sourceCase.appVersion,
  shape: {
    recipeEntries: historyEntries,
    recipe: state.params,
    source: canonicalShape,
    canonicalShapeSha256: shapeSha256,
    fieldBounds,
  },
  mesh: {
    filename: "P0-colored-shadow.obj",
    sha256: objSha256,
    format: "obj",
    resolution: 64,
    triangleCount: mesh.triangles.length,
    dimensionsMm: mesh.mmBounds.size,
    scaleMmPerShapeUnit: mesh.scaleMmPerUnit,
    topology: savedTopology,
    signedVolumeMm3: computeMeshVolume(mesh),
  },
  physicalScale: {
    mmPerShapeUnit: mm,
    source: adapter.scene.physicalScale.source,
    statement: "Current Hikari adapter's explicit assumed scale; it is not a measured artwork dimension.",
  },
  camera: {
    positionShapeUnits: sourceCamera.position,
    targetShapeUnits: sourceCamera.target,
    positionMm: sourceCamera.position.map(scalePoint),
    targetMm: sourceCamera.target.map(scalePoint),
    fovDeg: sourceCamera.fov,
    aspect: sourceCamera.aspect,
  },
  optical: {
    host: {
      id: adapter.scene.host.material.id,
      ior: adapter.scene.host.material.ior,
      absorptionPerShapeUnit: settingsAbsorptionPerShapeUnit,
      absorptionPerMm,
      transmissionColor: "neutral host preset; current scalar absorption is mapped to RGB coefficients",
      roughness: adapter.scene.host.material.roughness,
    },
    inclusions: [],
    light: {
      directionPropagation: adapter.scene.light.direction,
      radiance: adapter.scene.light.radiance,
      angularDiameterDeg: 0.53,
    },
    receiver: {
      id: adapter.scene.receiver.id,
      positionShapeUnits: adapter.scene.receiver.pose.position,
      positionMm: point(adapter.scene.receiver.pose.position),
      normal: adapter.scene.receiver.normal,
      extentMm: { x: 240, z: 240 },
      reflectance: 0.70,
    },
    environment: {
      radiance: { r: 0.85, g: 0.85, b: 0.85 },
      note: "Neutral constant environment for a bounded reference; not a calibrated sky model.",
    },
  },
  mapping: {
    units: "millimetres in Mitsuba scene; Hikari shape units multiplied by 20 mm/shape-unit",
    coordinateSystem: "Hikari right-handed Y-up is retained; Mitsuba uses the same scene-axis convention here",
    host: "Hikari balls-smooth-union field -> current buildCloudMesh() -> shared-index OBJ -> Mitsuba mesh shape",
    material: "Hikari ior -> dielectric int_ior; Hikari absorption per shape unit / 20 -> homogeneous sigma_t per mm; sigma_s=0",
    receiver: "Hikari legacy-floor y=-2.35 -> Mitsuba horizontal diffuse rectangle at y=-47 mm",
    light: "Hikari propagationDirection/radiance -> Mitsuba finite area emitter aimed at the fixed receiver/body; source size is explicit 0.53 deg only as provenance, not a photometric calibration",
    camera: "Hikari fixed camera position/target/FOV -> Mitsuba perspective sensor after the same scale conversion",
  },
  nonProduction: [
    "This case is an offline research transfer; it is not a Hikari runtime contract.",
    "No .hkr, manifest, version, Light Drawing, or Hikari source is modified by this spike.",
  ],
};

await writeFile(resolve(OUTPUT_DIR, "fixed-case.json"), `${JSON.stringify(fixedCase, null, 2)}\n`, "utf8");
await writeFile(resolve(OUTPUT_DIR, "P0-colored-shadow.recipe.json"), `${JSON.stringify(historyEntries, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  caseId: fixedCase.caseId,
  sourceCommit: fixedCase.sourceCommit,
  shapeSha256,
  objSha256,
  triangleCount: fixedCase.mesh.triangleCount,
  dimensionsMm: fixedCase.mesh.dimensionsMm,
  scaleMmPerShapeUnit: fixedCase.mesh.scaleMmPerShapeUnit,
  savedTopology: fixedCase.mesh.topology,
  opticalSceneIssues: adapter.issues,
}, null, 2));
