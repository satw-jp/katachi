import { fieldSdf } from "../../../src/studies/cloud-sculpt/field.ts";
import { surfaceOverhangAngleDeg } from "../../../src/studies/skin/surfaceAngleDiagnosis.ts";
import {
  GEOMETRY_COMPUTE_LAB_CONTRACT,
  MESH_ANALYSIS_FIELD_ALGORITHM,
  SHADOW_GEOMETRY_COMPUTE_POLICY,
  type MeshAnalysisFieldRequest,
  type MeshAnalysisFieldResult,
} from "./contracts.ts";

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}

export function evaluateMeshAnalysisFieldOnWeb(
  request: MeshAnalysisFieldRequest,
): MeshAnalysisFieldResult {
  if (request.positions.length % 9 !== 0) {
    throw new Error("mesh analysis positions must contain nine values per face");
  }
  if (request.requestedFields[0] !== "insideScore"
    || request.requestedFields[1] !== "overhangAngleDeg") {
    throw new Error("mesh analysis v1 requires continuous inside and overhang fields");
  }
  const faceCount = request.positions.length / 9;
  const faceIndices = new Uint32Array(faceCount);
  const insideScore = new Float64Array(faceCount);
  const overhangAngleDeg = new Float32Array(faceCount);
  for (let faceIndex = 0; faceIndex < faceCount; faceIndex += 1) {
    const offset = faceIndex * 9;
    const ax = finite(request.positions[offset], `face ${faceIndex} ax`);
    const ay = finite(request.positions[offset + 1], `face ${faceIndex} ay`);
    const az = finite(request.positions[offset + 2], `face ${faceIndex} az`);
    const bx = finite(request.positions[offset + 3], `face ${faceIndex} bx`);
    const by = finite(request.positions[offset + 4], `face ${faceIndex} by`);
    const bz = finite(request.positions[offset + 5], `face ${faceIndex} bz`);
    const cx = finite(request.positions[offset + 6], `face ${faceIndex} cx`);
    const cy = finite(request.positions[offset + 7], `face ${faceIndex} cy`);
    const cz = finite(request.positions[offset + 8], `face ${faceIndex} cz`);
    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    const length = Math.hypot(nx, ny, nz);
    const normal = length > 1e-12
      ? { x: nx / length, y: ny / length, z: nz / length }
      : { x: 0, y: 0, z: 0 };
    const centroid = {
      x: (ax + bx + cx) / 3,
      y: (ay + by + cy) / 3,
      z: (az + bz + cz) / 3,
    };
    faceIndices[faceIndex] = faceIndex;
    insideScore[faceIndex] = fieldSdf(
      request.baseField.balls,
      request.baseField.smoothness,
      centroid.x,
      centroid.y,
      centroid.z,
    );
    overhangAngleDeg[faceIndex] = surfaceOverhangAngleDeg(normal);
  }
  return {
    contract: GEOMETRY_COMPUTE_LAB_CONTRACT,
    operation: "evaluateMeshAnalysisField",
    algorithmContract: MESH_ANALYSIS_FIELD_ALGORITHM,
    topologyFingerprint: request.topologyFingerprint,
    faceIndices,
    insideScore,
    overhangAngleDeg,
    fieldBackends: { insideScore: "web", overhangAngleDeg: "web" },
    policy: SHADOW_GEOMETRY_COMPUTE_POLICY,
  };
}

export type FieldClassification = "inside" | "boundary" | "outside";

/** Thresholding is intentionally independent from field evaluation. */
export function classifyContinuousField(
  values: Float32Array | Float64Array,
  threshold: number,
  boundaryBand = 0,
): Uint8Array {
  if (!Number.isFinite(threshold) || !Number.isFinite(boundaryBand) || boundaryBand < 0) {
    throw new Error("field threshold and boundary band must be finite");
  }
  const classifications = new Uint8Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    const shifted = values[index] - threshold;
    classifications[index] = shifted < -boundaryBand ? 0 : shifted > boundaryBand ? 2 : 1;
  }
  return classifications;
}

export function fieldClassificationName(value: number): FieldClassification {
  return (["inside", "boundary", "outside"] as const)[value]
    ?? (() => { throw new Error("field classification code is invalid"); })();
}
