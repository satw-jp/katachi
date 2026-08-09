import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import sharp from "sharp";
import * as THREE from "three";
import { buildLightDrawingField, type LightDrawingField, type LightDrawingSample } from "./lightDrawingField.ts";
import { createCloudHikariShape } from "./hikariAdapter.ts";
import { traceFocusedRay } from "./optics.ts";

const outputDirectory = new URL("../../../docs/hikari/evidence/", import.meta.url);
const imageUrl = new URL("ld1-curved-ribbon-2026-08-01.png", outputDirectory);
const metricsUrl = new URL("ld1-curved-ribbon-2026-08-01.json", outputDirectory);

const balls = [{ id: 1, x: 0, y: 0, z: 0, r: 1 }];
const traceStrength = 0.14;
const lightAngleDeg = Number(process.argv[2] ?? 60);
const plain = createCloudHikariShape(balls, 0, { surfaceTraceStrength: 0 });
const traced = createCloudHikariShape(balls, 0, { surfaceTraceStrength: traceStrength });
if (!plain || !traced) throw new Error("LD1 report requires a non-empty shape");

const bounds = plain.asset.bounds;
const center = new THREE.Vector3(
  (bounds.min.x + bounds.max.x) * 0.5,
  (bounds.min.y + bounds.max.y) * 0.5,
  (bounds.min.z + bounds.max.z) * 0.5,
);
const max = new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.max.z);
const radius = Math.max(0.1, center.distanceTo(max));
const angle = THREE.MathUtils.degToRad(lightAngleDeg);
const direction = new THREE.Vector3(Math.sin(angle) * 0.72, -1, Math.cos(angle) * 0.28).normalize();
const basisU = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0));
if (basisU.lengthSq() < 0.001) basisU.set(1, 0, 0);
basisU.normalize();
const basisV = new THREE.Vector3().crossVectors(basisU, direction).normalize();
const originCenter = center.clone().addScaledVector(direction, -radius * 2.6);
const floorY = bounds.min.y - Math.max(0.45, radius * 0.28);
const emittedRayCount = 16384;
const plainSamples: LightDrawingSample[] = [];
const tracedSamples: LightDrawingSample[] = [];
const sharedReceiverDisplacements: number[] = [];

for (let emitted = 0; emitted < emittedRayCount; emitted++) {
  const sequenceIndex = emitted + 1;
  const u = ((0.5 + sequenceIndex * 0.754877666) % 1) * 2 - 1;
  const v = ((0.5 + sequenceIndex * 0.569840296) % 1) * 2 - 1;
  const origin = originCenter
    .clone()
    .addScaledVector(basisU, u * radius * 1.15)
    .addScaledVector(basisV, v * radius * 1.05);
  const baseRay = traceFocusedRay(plain.runtime, origin, direction, 1.5, floorY, radius * 5);
  const tracedRay = traceFocusedRay(traced.runtime, origin, direction, 1.5, floorY, radius * 5);
  if (baseRay.entry && baseRay.floorHit) {
    plainSamples.push({ x: baseRay.floorHit.x, z: baseRay.floorHit.z, energy: 1, color: [1, 1, 1] });
  }
  if (tracedRay.entry && tracedRay.floorHit) {
    tracedSamples.push({ x: tracedRay.floorHit.x, z: tracedRay.floorHit.z, energy: 1, color: [1, 1, 1] });
  }
  if (baseRay.entry && baseRay.floorHit && tracedRay.entry && tracedRay.floorHit) {
    sharedReceiverDisplacements.push(baseRay.floorHit.distanceTo(tracedRay.floorHit));
  }
}

const domain = {
  minX: center.x - radius * 2.5,
  minZ: center.z - radius * 2.5,
  sizeX: radius * 5,
  sizeZ: radius * 5,
};
const fieldOptions = {
  domain,
  emittedRayCount,
  width: 256,
  height: 256,
  reconstructionRadius: 2,
  exposure: 0.22,
};
const plainField = buildLightDrawingField(plainSamples, fieldOptions);
const tracedField = buildLightDrawingField(tracedSamples, fieldOptions);
const differenceData = differenceField(plainField, tracedField);
const metrics = {
  caseId: "LD1-curved-ribbon-2026-08-01",
  shape: "analytic single sphere",
  emittedRayCount,
  ior: 1.5,
  lightAngleDeg,
  traceStrength: { off: 0, on: traceStrength },
  receiverDomain: domain,
  hits: { off: plainSamples.length, on: tracedSamples.length, shared: sharedReceiverDisplacements.length },
  meanSharedReceiverDisplacement: mean(sharedReceiverDisplacements),
  p95SharedReceiverDisplacement: percentile(sharedReceiverDisplacements, 0.95),
  movedSharedHitsOver0_01ShapeUnits: sharedReceiverDisplacements.filter((value) => value > 0.01).length,
  image: {
    off: summarizeField(plainField),
    on: summarizeField(tracedField),
    meanAbsoluteByteDifference: meanAbsoluteDifference(plainField.data, tracedField.data),
  },
  limitations: [
    "The curved ribbon is a controlled authored proxy, not a scan of a physical making trace.",
    "This report uses the CPU single-boundary reference; finite source integration and multi-boundary transport are not included.",
  ],
};

await mkdir(outputDirectory, { recursive: true });
const offPng = await sharp(plainField.data, { raw: { width: 256, height: 256, channels: 4 } }).png().toBuffer();
const onPng = await sharp(tracedField.data, { raw: { width: 256, height: 256, channels: 4 } }).png().toBuffer();
const diffPng = await sharp(differenceData, { raw: { width: 256, height: 256, channels: 4 } }).png().toBuffer();
const titleSvg = Buffer.from(`
  <svg width="800" height="42" xmlns="http://www.w3.org/2000/svg">
    <rect width="800" height="42" fill="#071014"/>
    <g fill="#d9f4f7" font-family="Helvetica, Arial, sans-serif" font-size="14">
      <text x="8" y="26">OFF — smooth boundary</text>
      <text x="278" y="26">ON — curved making trace</text>
      <text x="548" y="26">difference × 3</text>
    </g>
  </svg>
`);
await sharp({ create: { width: 800, height: 298, channels: 4, background: "#071014" } })
  .composite([
    { input: titleSvg, left: 0, top: 0 },
    { input: offPng, left: 0, top: 42 },
    { input: onPng, left: 272, top: 42 },
    { input: diffPng, left: 544, top: 42 },
  ])
  .png()
  .toFile(fileURLToPath(imageUrl));
await writeFile(metricsUrl, `${JSON.stringify(metrics, null, 2)}\n`, "utf8");
console.log(JSON.stringify(metrics, null, 2));
console.log(`wrote ${imageUrl.pathname}`);

function differenceField(a: LightDrawingField, b: LightDrawingField): Uint8Array {
  const result = new Uint8Array(a.data.length);
  for (let index = 0; index < result.length; index += 4) {
    result[index] = Math.min(255, Math.abs(a.data[index] - b.data[index]) * 3);
    result[index + 1] = Math.min(255, Math.abs(a.data[index + 1] - b.data[index + 1]) * 3);
    result[index + 2] = Math.min(255, Math.abs(a.data[index + 2] - b.data[index + 2]) * 3);
    result[index + 3] = 255;
  }
  return result;
}

function summarizeField(field: LightDrawingField) {
  let litPixels = 0;
  let sum = 0;
  let maximum = 0;
  for (let index = 0; index < field.data.length; index += 4) {
    const value = field.data[index];
    if (value > 0) litPixels++;
    sum += value;
    maximum = Math.max(maximum, value);
  }
  return { litPixels, sum, maximum };
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: readonly number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * quantile))];
}

function meanAbsoluteDifference(a: Uint8Array, b: Uint8Array): number {
  let sum = 0;
  let count = 0;
  for (let index = 0; index < a.length; index += 4) {
    sum += Math.abs(a[index] - b[index]);
    count++;
  }
  return sum / Math.max(1, count);
}
