import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { replay } from "../../src/studies/cloud-sculpt/history.ts";
import { DEFAULT_HIKARI_SETTINGS } from "../../src/studies/cloud-sculpt/hikari.ts";
import {
  buildCloudMesh,
  encodeObj,
  inspectSavedStlTopology,
  orientMeshForSavedStl,
} from "../../src/studies/cloud-sculpt/meshExport.ts";
import { buildCloudOpticalScene } from "../../src/studies/cloud-sculpt/opticalSceneAdapter.ts";

const SOURCE_COMMIT = "586a20cedfca9e769f710cfd96a400b4737069d5";
const DOCUMENT_PATH = "docs/hikari/cases/hikari-blender-backlight-study.hkr";
const sourceDocument = JSON.parse(await readFile(resolve(DOCUMENT_PATH), "utf8"));
const sourceCase = sourceDocument.views[0].case;
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
if (adapter.issues.length > 0) throw new Error(`OpticalScene invalid: ${adapter.issues.join("; ")}`);

// This is the same Hikari realization route used by the research spike, but
// the OBJ exists only in memory and is transferred as a bounded request field.
const probeMesh = buildCloudMesh(state.balls, state.params.k, { resolution: 64, targetLongestMm: 1 });
const targetLongestMm = probeMesh.sourceBounds.longest * adapter.scene.physicalScale.mmPerShapeUnit;
const mesh = orientMeshForSavedStl(buildCloudMesh(state.balls, state.params.k, { resolution: 64, targetLongestMm }));
const obj = encodeObj(mesh);
const objSha256 = createHash("sha256").update(obj, "utf8").digest("hex");
const canonicalShape = {
  kind: "balls-smooth-union",
  smoothness: state.params.k,
  balls: state.balls.map(({ x, y, z, r }) => ({ center: { x, y, z }, radius: r })),
};
const shapeFingerprint = createHash("sha256")
  .update(JSON.stringify({ sourceCommit: SOURCE_COMMIT, historyEntries, canonicalShape }), "utf8")
  .digest("hex");
const mmPerShapeUnit = adapter.scene.physicalScale.mmPerShapeUnit;
const toVec = (values) => ({ x: values[0], y: values[1], z: values[2] });
const toMm = (value) => ({ x: value.x * mmPerShapeUnit, y: value.y * mmPerShapeUnit, z: value.z * mmPerShapeUnit });
const sourceCamera = sourceCase.camera;
const receiverPositionMm = toMm(adapter.scene.receiver.pose.position);
const host = adapter.scene.host.material;
const receiver = {
  positionMm: receiverPositionMm,
  normal: adapter.scene.receiver.normal,
  extentMm: { x: 240, z: 240 },
  reflectance: 0.70,
};
const common = {
  operation: "hikari.mitsuba.render.v1",
  case: { id: "P0-colored-shadow", label: "existing Hikari fixed case" },
  provenance: {
    repository: "satw-jp/katachi",
    sourceCommit: SOURCE_COMMIT,
    sourceRef: "main",
    shapeSource: "cloud-sculpt.buildCloudMesh",
    fingerprint: shapeFingerprint,
  },
  canonicalMesh: {
    format: "obj",
    dataBase64: Buffer.from(obj, "utf8").toString("base64"),
    byteLength: Buffer.byteLength(obj, "utf8"),
    sha256: objSha256,
  },
  physicalScale: { mmPerShapeUnit, source: adapter.scene.physicalScale.source },
  hostMaterial: {
    id: host.id,
    ior: host.ior,
    absorptionPerMm: host.absorptionPerMm,
    roughness: host.roughness,
  },
  light: {
    directionPropagation: adapter.scene.light.direction,
    radiance: adapter.scene.light.radiance,
    angularDiameterDeg: 0.53,
  },
  receiver,
  environment: { radiance: { r: 0.85, g: 0.85, b: 0.85 } },
};

export function createRequest(renderPurpose, device = "cuda") {
  const receiverView = renderPurpose === "receiver";
  const width = 96;
  const height = 96;
  return {
    requestId: `p0-${renderPurpose}-${device}`,
    ...common,
    camera: {
      positionMm: receiverView ? { x: 0, y: 140, z: -220 } : toVec(sourceCamera.position.map((value) => value * mmPerShapeUnit)),
      targetMm: receiverView ? receiverPositionMm : toVec(sourceCamera.target.map((value) => value * mmPerShapeUnit)),
      up: { x: 0, y: 1, z: 0 },
      fovDeg: sourceCamera.fov,
      aspect: width / height,
    },
    renderPurpose,
    compute: { device },
    spp: 4,
    resolution: { width, height },
  };
}

export const fixtureSummary = {
  caseId: "P0-colored-shadow",
  sourceCommit: SOURCE_COMMIT,
  triangleCount: mesh.triangles.length,
  meshSha256: objSha256,
  meshBytes: Buffer.byteLength(obj, "utf8"),
  savedTopology: inspectSavedStlTopology(mesh.triangles, mesh.scaleMmPerUnit),
};
