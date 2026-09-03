import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { conceptQualityProfile, createQualityOverlay, qualityProfile, type SpatialEcho } from "../visual/visualQuality.ts";
import { V4_PALETTES } from "../conceptTypes.ts";
import type { ConceptBuildContext } from "../conceptTypes.ts";
import type { ConceptSource } from "../sourceAdapter.ts";

const source: ConceptSource = {
  fingerprint: "test-source",
  center: new THREE.Vector3(),
  nodes: [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)],
  edges: [{ id: "edge-0", startIndex: 0, endIndex: 1, start: new THREE.Vector3(-1, 0, 0), end: new THREE.Vector3(0, 1, 0), midpoint: new THREE.Vector3(-0.5, 0.5, 0), length: 1.4, direction: new THREE.Vector3(1, 1, 0).normalize(), density: 0.7, connectivity: 0.8, directionChange: 0.4, motifInfluence: 0.5, supportRole: 0.7 }],
  motifs: [{ id: "motif-0", center: new THREE.Vector3(), scale: 0.16, sourceIndex: 0 }],
};

const context = (visualQuality: "baseline" | "lifted"): ConceptBuildContext => ({
  source,
  scene: new THREE.Scene(),
  camera: new THREE.PerspectiveCamera(),
  seed: 12345,
  quality: "desktop",
  parameters: { exposure: 1.25, localContrast: 1.2, blurAmount: 0.7 },
  palette: "rich",
  colors: V4_PALETTES.rich,
  visualQuality,
});

test("spatial quality has a lifted profile and a no-op baseline profile", () => {
  const lifted = qualityProfile("lifted", "desktop");
  const baseline = qualityProfile("baseline", "desktop");
  assert.ok(lifted.pointScale > 0 && lifted.atmosphere > 0);
  assert.equal(baseline.pointScale, 0);
  assert.notEqual(conceptQualityProfile("void-bouquet").atmosphere, conceptQualityProfile("shadow-room").atmosphere);
});

test("lifted quality builds a source-seeded Gaussian layer while baseline stays unchanged", () => {
  const lifted = createQualityOverlay(context("lifted"), "weight-of-hesitation");
  const baseline = createQualityOverlay(context("baseline"), "weight-of-hesitation");
  assert.ok(lifted);
  assert.equal(baseline, null);
  const geometry = lifted!.object.geometry;
  assert.ok(geometry.getAttribute("aSizeAlpha").count > 0);
  assert.ok(geometry.getAttribute("aStats").count > 0);
});

test("SpatialEcho keeps source identity and non-physical depth fields explicit", () => {
  const echo: SpatialEcho = { sourceId: "edge-0", position: new THREE.Vector3(), scale: 1.3, depthBand: 0, primitive: "gaussian", focusBias: -0.2, opacityBias: 0.8, luminanceBias: 0.1, parallaxFactor: 1.28, temporalPhase: 0.2 };
  assert.equal(echo.sourceId, "edge-0");
  assert.ok(echo.parallaxFactor > 1 && echo.depthBand === 0);
});
