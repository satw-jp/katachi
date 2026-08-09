import assert from "node:assert/strict";
import * as THREE from "three";
import {
  buildVariantGeometry,
  createPhaseField,
  type HitsujiParams,
} from "./deformation.ts";

const base = new THREE.SphereGeometry(1, 18, 12);
const field = createPhaseField(260304);
const defaults: HitsujiParams = {
  seed: 260304,
  differential: { amount: 0.72, patchScale: 1, contrast: 1, roughness: 0.35 },
  phase: { voidFraction: 0.34, domainScale: 1, steps: 34, inflation: 0.38, innerDepth: 0.24 },
  flow: { height: 0.82, density: 1, curl: 1, sharpness: 7 },
};

function cloneParams(): HitsujiParams {
  return JSON.parse(JSON.stringify(defaults)) as HitsujiParams;
}

function positions(geometry: THREE.BufferGeometry): Float32Array {
  return (geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
}

function allFinite(values: Float32Array): boolean {
  for (const value of values) if (!Number.isFinite(value)) return false;
  return true;
}

function boundaryEdgeCount(geometry: THREE.BufferGeometry): number {
  const index = geometry.getIndex();
  assert.ok(index, "殻はindexを持つ");
  const counts = new Map<string, number>();
  const add = (a: number, b: number) => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    const b = index.getX(i + 1);
    const c = index.getX(i + 2);
    add(a, b);
    add(b, c);
    add(c, a);
  }
  return Array.from(counts.values()).filter((count) => count === 1).length;
}

const noHoleParams = cloneParams();
noHoleParams.phase.voidFraction = 0;
const noHoles = buildVariantGeometry(base, "phase-separation", noHoleParams, field);
assert.equal(
  noHoles.userData.hitsujiPhase.keptTriangles,
  (base.index?.count ?? 0) / 3,
  "穴の量0は元の全三角形を外側に残す",
);
assert.ok((noHoles.index?.count ?? 0) > (base.index?.count ?? 0) * 2, "外面・内面・元メッシュ境界の側面を作る");

const porousParams = cloneParams();
porousParams.phase.voidFraction = 0.5;
const porous = buildVariantGeometry(base, "phase-separation", porousParams, field);
assert.ok((porous.index?.count ?? 0) > 0, "残る相が存在する");
assert.ok(
  porous.userData.hitsujiPhase.keptTriangles < (base.index?.count ?? 0) / 3,
  "片方の相が外側から実際に三角形を除く",
);
assert.ok(porous.userData.hitsujiPhase.boundaryEdges > 0, "穴の境界を検出して側面を作る");
assert.ok(allFinite(positions(porous)), "相分離後の頂点は有限値");
assert.equal(boundaryEdgeCount(porous), 0, "外面・内面・側面を接続した殻には開いた境界辺がない");

const zeroInnerParams = cloneParams();
zeroInnerParams.phase.innerDepth = 0;
const zeroInner = buildVariantGeometry(base, "phase-separation", zeroInnerParams, field);
const deepInnerParams = cloneParams();
deepInnerParams.phase.innerDepth = 0.8;
const deepInner = buildVariantGeometry(base, "phase-separation", deepInnerParams, field);
assert.notDeepEqual(
  Array.from(positions(zeroInner)),
  Array.from(positions(deepInner)),
  "内側への厚みは内面の位置を変える",
);

const phaseA = cloneParams();
const phaseB = cloneParams();
phaseB.differential.amount = 1.5;
phaseB.flow.height = 0;
const phaseGeometryA = buildVariantGeometry(base, "phase-separation", phaseA, field);
const phaseGeometryB = buildVariantGeometry(base, "phase-separation", phaseB, field);
assert.deepEqual(
  Array.from(phaseGeometryA.index?.array ?? []),
  Array.from(phaseGeometryB.index?.array ?? []),
  "差分成長・流れの値は相分離の穴へ影響しない",
);

const growthA = cloneParams();
const growthB = cloneParams();
growthB.phase.voidFraction = 0.7;
growthB.flow.curl = 0;
const growthGeometryA = buildVariantGeometry(base, "differential-growth", growthA, field);
const growthGeometryB = buildVariantGeometry(base, "differential-growth", growthB, field);
assert.deepEqual(
  Array.from(positions(growthGeometryA)),
  Array.from(positions(growthGeometryB)),
  "相分離・流れの値は差分成長へ影響しない",
);

const denseFlowParams = cloneParams();
denseFlowParams.flow.density = 8;
const denseFlow = buildVariantGeometry(base, "flow-wool", denseFlowParams, field);
assert.ok(allFinite(positions(denseFlow)), "毛束の密度8でも頂点は有限値");
assert.notDeepEqual(
  Array.from(positions(denseFlow)),
  Array.from(positions(buildVariantGeometry(base, "flow-wool", defaults, field))),
  "毛束の密度8は既定密度とは異なる形を作る",
);

const initialPhase = createPhaseField(260304, 0);
const coarsenedPhase = createPhaseField(260304, 80);
assert.notDeepEqual(
  Array.from(initialPhase),
  Array.from(coarsenedPhase),
  "まとまりの時間は3D相分離場そのものを変える",
);

console.log("11 passed — hitsuji deformation");
