import { sha256Hex } from "../../../lib/hash.ts";
import {
  createImportedHostSource,
  type ImportedHostSource,
  type ParsedRawStlMesh,
} from "../externalStlHost.ts";

export type Vec3 = readonly [number, number, number];
export type Quaternion = readonly [number, number, number, number];

export const LOCKED_HOST_INPUT = Object.freeze({
  fileName: "mocomoco_221104.stl",
  sha256: "c848ea33eebf4b65ad4386fede4c82a7f1185e921098a5c018135cda1fad6c4e",
  byteLength: 13318784,
  triangleCount: 266374,
  sourceBounds: {
    min: [-97.3743896484375, -97.6064224243164, -196.83554077148438] as const,
    max: [91.1894302368164, 105.12374114990234, -4.680995941162109] as const,
  },
  translation: [3.092479705810547, -3.7586593627929688, 196.83554077148438] as const,
  dimensions: [188.5638198852539, 202.73016357421875, 192.15454483032227] as const,
});

export const DEFAULT_COMPOSITION_RECIPE = Object.freeze({
  flowerCount: 64,
  flowerScale: 1,
  seed: 20260923,
  minAnchorSpacingMm: 12,
  maxSamplingAttempts: 8192,
  flowerOrientationTwistRad: 0,
  branchDiameterMm: 3,
  insetMm: 8,
  branchRecipe: "inset-relay-mst-v0" as const,
});

export interface CompositionRecipe {
  readonly flowerCount: number;
  readonly flowerScale: number;
  readonly seed: number;
  readonly minAnchorSpacingMm: number;
  readonly maxSamplingAttempts: number;
  readonly flowerOrientationTwistRad: number;
  readonly branchDiameterMm: number;
  readonly insetMm: number;
  readonly branchRecipe: "inset-relay-mst-v0";
}

export interface CompositionFlower {
  readonly id: string;
  readonly triangleIndex: number;
  readonly barycentric: readonly [number, number, number];
  readonly position: Vec3;
  readonly normal: Vec3;
  readonly rotation: Quaternion;
  readonly scale: number;
}

export interface CompositionGraphNode {
  readonly id: string;
  readonly flowerId: string;
  readonly role: "back-anchor" | "surface-anchor";
  readonly position: Vec3;
}

export interface CompositionGraphEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly role: "relay" | "attachment";
}

export interface CompositionBranchGraph {
  readonly recipe: "inset-relay-mst-v0";
  readonly rootNodeId: string;
  readonly insetMm: number;
  readonly diameterMm: number;
  readonly nodes: readonly CompositionGraphNode[];
  readonly edges: readonly CompositionGraphEdge[];
}

export interface CompositionHost {
  readonly source: ImportedHostSource;
  readonly bytes: Uint8Array;
  readonly sourceHash: string;
  readonly fileName: string;
  readonly rawMesh: ParsedRawStlMesh;
  readonly cumulativeAreas: Float64Array;
  readonly normals: Float64Array;
  readonly totalArea: number;
  readonly validTriangleCount: number;
}

export interface CompositionState {
  readonly host: CompositionHost;
  readonly motif: import("./motifSource.ts").MotifPrototype;
  readonly recipe: CompositionRecipe;
  readonly flowers: readonly CompositionFlower[];
  readonly branches: CompositionBranchGraph;
  readonly presentation: { readonly showHost: boolean };
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}

function positive(value: number, label: string): number {
  finite(value, label);
  if (!(value > 0)) throw new Error(`${label} must be positive`);
  return value;
}

function copyBytes(input: ArrayBuffer | ArrayBufferView): Uint8Array {
  return input instanceof ArrayBuffer
    ? new Uint8Array(input.slice(0))
    : new Uint8Array(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength));
}

function assertClose(actual: number, expected: number, label: string, tolerance = 1e-4): void {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label} does not match the locked MOCOMOCO input`);
  }
}

export async function loadCompositionHost(input: ArrayBuffer | ArrayBufferView, fileName: string = LOCKED_HOST_INPUT.fileName): Promise<CompositionHost> {
  const bytes = copyBytes(input);
  if (bytes.byteLength !== LOCKED_HOST_INPUT.byteLength) throw new Error("MOCOMOCO STL byte length does not match the locked input");
  const source = await createImportedHostSource(bytes, {
    filename: fileName,
    interpretation: {
      unitStatus: "explicit",
      mmPerSourceUnit: 1,
      upAxis: "z",
      handedness: "right",
      importPolicyVersion: "skin-composition-mocomoco-z-up-mm-v0",
    },
  });
  if (source.format !== "binary-stl" || source.sourceIdentity.sha256 !== LOCKED_HOST_INPUT.sha256) {
    throw new Error("MOCOMOCO STL does not match the locked binary source identity");
  }
  const rawMesh = source.parseRawMesh();
  if (rawMesh.triangleCount !== LOCKED_HOST_INPUT.triangleCount) throw new Error("MOCOMOCO STL triangle count does not match the locked input");
  const bounds = rawMesh.bounds;
  const actualMin = [bounds.min.x, bounds.min.y, bounds.min.z];
  const actualMax = [bounds.max.x, bounds.max.y, bounds.max.z];
  for (let axis = 0; axis < 3; axis += 1) {
    assertClose(actualMin[axis], LOCKED_HOST_INPUT.sourceBounds.min[axis], `source minimum axis ${axis}`);
    assertClose(actualMax[axis], LOCKED_HOST_INPUT.sourceBounds.max[axis], `source maximum axis ${axis}`);
    assertClose(actualMax[axis] - actualMin[axis], LOCKED_HOST_INPUT.dimensions[axis], `source dimension axis ${axis}`);
  }

  const cumulativeAreas = new Float64Array(rawMesh.triangleCount);
  const normals = new Float64Array(rawMesh.triangleCount * 3);
  const positions = rawMesh.positions;
  let totalArea = 0;
  let validTriangleCount = 0;
  for (let triangle = 0; triangle < rawMesh.triangleCount; triangle += 1) {
    const offset = triangle * 9;
    const abx = positions[offset + 3] - positions[offset];
    const aby = positions[offset + 4] - positions[offset + 1];
    const abz = positions[offset + 5] - positions[offset + 2];
    const acx = positions[offset + 6] - positions[offset];
    const acy = positions[offset + 7] - positions[offset + 1];
    const acz = positions[offset + 8] - positions[offset + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    const length = Math.hypot(nx, ny, nz);
    const area = length * 0.5;
    if (area > 1e-12 && Number.isFinite(area)) {
      totalArea += area;
      validTriangleCount += 1;
      normals[triangle * 3] = nx / length;
      normals[triangle * 3 + 1] = ny / length;
      normals[triangle * 3 + 2] = nz / length;
    }
    cumulativeAreas[triangle] = totalArea;
  }
  if (!(totalArea > 0) || validTriangleCount === 0) throw new Error("MOCOMOCO STL has no valid surface triangles");
  return Object.freeze({
    source,
    bytes,
    sourceHash: source.sourceIdentity.sha256,
    fileName,
    rawMesh,
    cumulativeAreas,
    normals,
    totalArea,
    validTriangleCount,
  });
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function triangleForArea(cumulative: Float64Array, target: number): number {
  let low = 0;
  let high = cumulative.length - 1;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (target < cumulative[middle]) high = middle;
    else low = middle + 1;
  }
  return low;
}

function subtract(left: Vec3, right: Vec3): [number, number, number] {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function normalize(vector: readonly [number, number, number]): [number, number, number] {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (!(length > 1e-12)) throw new Error("Cannot normalize a zero vector");
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function flowerRotation(normal: Vec3, twist: number): Quaternion {
  const n = normalize([normal[0], normal[1], normal[2]]);
  let x = [1 - n[0] * n[0], -n[0] * n[1], -n[0] * n[2]] as [number, number, number];
  if (Math.hypot(x[0], x[1], x[2]) < 1e-8) x = [-n[1] * n[0], 1 - n[1] * n[1], -n[1] * n[2]];
  x = normalize(x);
  let y: [number, number, number] = [
    n[1] * x[2] - n[2] * x[1],
    n[2] * x[0] - n[0] * x[2],
    n[0] * x[1] - n[1] * x[0],
  ];
  if (twist !== 0) {
    const cosine = Math.cos(twist);
    const sine = Math.sin(twist);
    x = normalize([x[0] * cosine + y[0] * sine, x[1] * cosine + y[1] * sine, x[2] * cosine + y[2] * sine]);
    y = [
      n[1] * x[2] - n[2] * x[1],
      n[2] * x[0] - n[0] * x[2],
      n[0] * x[1] - n[1] * x[0],
    ];
  }
  const m00 = x[0]; const m01 = y[0]; const m02 = n[0];
  const m10 = x[1]; const m11 = y[1]; const m12 = n[1];
  const m20 = x[2]; const m21 = y[2]; const m22 = n[2];
  const trace = m00 + m11 + m22;
  let qx: number; let qy: number; let qz: number; let qw: number;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    qw = 0.25 * s; qx = (m21 - m12) / s; qy = (m02 - m20) / s; qz = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    qw = (m21 - m12) / s; qx = 0.25 * s; qy = (m01 + m10) / s; qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    qw = (m02 - m20) / s; qx = (m01 + m10) / s; qy = 0.25 * s; qz = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    qw = (m10 - m01) / s; qx = (m02 + m20) / s; qy = (m12 + m21) / s; qz = 0.25 * s;
  }
  const length = Math.hypot(qx, qy, qz, qw);
  return [qx / length, qy / length, qz / length, qw / length];
}

export function placeCompositionFlowers(host: CompositionHost, recipe: CompositionRecipe): readonly CompositionFlower[] {
  if (!Number.isInteger(recipe.flowerCount) || recipe.flowerCount < 1 || recipe.flowerCount > 128) throw new Error("Flower count must be an integer from 1 to 128");
  positive(recipe.flowerScale, "Flower scale");
  if (!Number.isInteger(recipe.seed) || recipe.seed < 0 || recipe.seed > 0xffffffff) throw new Error("Flower seed must be a 32-bit unsigned integer");
  positive(recipe.minAnchorSpacingMm, "Minimum anchor spacing");
  if (!Number.isInteger(recipe.maxSamplingAttempts) || recipe.maxSamplingAttempts < recipe.flowerCount) throw new Error("Sampling attempt limit is too small");
  finite(recipe.flowerOrientationTwistRad, "Flower orientation twist");
  const random = mulberry32(recipe.seed);
  const flowers: CompositionFlower[] = [];
  const translation = LOCKED_HOST_INPUT.translation;
  let attempts = 0;
  while (flowers.length < recipe.flowerCount && attempts < recipe.maxSamplingAttempts) {
    attempts += 1;
    const triangleIndex = triangleForArea(host.cumulativeAreas, random() * host.totalArea);
    if (host.cumulativeAreas[triangleIndex] === (triangleIndex === 0 ? 0 : host.cumulativeAreas[triangleIndex - 1])) continue;
    const root = Math.sqrt(random());
    const barycentric: [number, number, number] = [1 - root, root * (1 - random()), 0];
    barycentric[2] = 1 - barycentric[0] - barycentric[1];
    const offset = triangleIndex * 9;
    const sourcePosition: [number, number, number] = [0, 0, 0];
    for (let axis = 0; axis < 3; axis += 1) {
      sourcePosition[axis] = host.rawMesh.positions[offset + axis] * barycentric[0]
        + host.rawMesh.positions[offset + 3 + axis] * barycentric[1]
        + host.rawMesh.positions[offset + 6 + axis] * barycentric[2];
    }
    const position: Vec3 = [sourcePosition[0] + translation[0], sourcePosition[1] + translation[1], sourcePosition[2] + translation[2]];
    const normal: Vec3 = [host.normals[triangleIndex * 3], host.normals[triangleIndex * 3 + 1], host.normals[triangleIndex * 3 + 2]];
    if (flowers.some((flower) => Math.hypot(...subtract(position, flower.position)) < recipe.minAnchorSpacingMm)) continue;
    const id = `flower-${String(flowers.length).padStart(4, "0")}`;
    flowers.push(Object.freeze({
      id,
      triangleIndex,
      barycentric: Object.freeze(barycentric),
      position,
      normal,
      rotation: flowerRotation(normal, recipe.flowerOrientationTwistRad),
      scale: recipe.flowerScale,
    }));
  }
  if (flowers.length !== recipe.flowerCount) {
    throw new Error(`Placed ${flowers.length} of ${recipe.flowerCount} flowers after ${attempts} attempts; previous composition was kept`);
  }
  return Object.freeze(flowers);
}

function squaredDistance(left: Vec3, right: Vec3): number {
  const dx = left[0] - right[0]; const dy = left[1] - right[1]; const dz = left[2] - right[2];
  return dx * dx + dy * dy + dz * dz;
}

function backAnchor(flower: CompositionFlower, insetMm: number): Vec3 {
  return [
    flower.position[0] - flower.normal[0] * insetMm,
    flower.position[1] - flower.normal[1] * insetMm,
    flower.position[2] - flower.normal[2] * insetMm,
  ];
}

export function buildCompositionBranches(flowers: readonly CompositionFlower[], diameterMm: number, insetMm: number): CompositionBranchGraph {
  positive(diameterMm, "Branch diameter");
  positive(insetMm, "Branch inset");
  if (flowers.length === 0) throw new Error("At least one flower is required to build branches");
  const ids = new Set<string>();
  for (const flower of flowers) {
    if (!flower.id || ids.has(flower.id)) throw new Error("Flower IDs must be non-empty and unique");
    ids.add(flower.id);
    if (![...flower.position, ...flower.normal].every(Number.isFinite)) throw new Error(`Flower ${flower.id} has non-finite anchor data`);
  }
  const ordered = [...flowers].sort((a, b) => a.id.localeCompare(b.id));
  const relayNodes = ordered.map((flower) => ({ flower, position: backAnchor(flower, insetMm) }));
  const root = [...relayNodes].sort((a, b) => a.position[2] - b.position[2] || a.flower.id.localeCompare(b.flower.id))[0];
  const connected = new Set<string>([root.flower.id]);
  const edges: CompositionGraphEdge[] = [];
  while (connected.size < ordered.length) {
    let best: { from: typeof relayNodes[number]; to: typeof relayNodes[number]; distanceSquared: number } | null = null;
    for (const from of relayNodes) {
      if (!connected.has(from.flower.id)) continue;
      for (const to of relayNodes) {
        if (connected.has(to.flower.id)) continue;
        const distanceSquared = squaredDistance(from.position, to.position);
        if (!best || distanceSquared < best.distanceSquared - 1e-12
          || (Math.abs(distanceSquared - best.distanceSquared) <= 1e-12
            && (from.flower.id.localeCompare(best.from.flower.id) < 0
              || (from.flower.id === best.from.flower.id && to.flower.id.localeCompare(best.to.flower.id) < 0)))) {
          best = { from, to, distanceSquared };
        }
      }
    }
    if (!best) throw new Error("Could not connect all flower relays");
    connected.add(best.to.flower.id);
    edges.push(Object.freeze({
      id: `relay-${best.from.flower.id}-${best.to.flower.id}`,
      from: `back-${best.from.flower.id}`,
      to: `back-${best.to.flower.id}`,
      role: "relay",
    }));
  }
  for (const flower of ordered) {
    edges.push(Object.freeze({
      id: `attach-${flower.id}`,
      from: `back-${flower.id}`,
      to: `surface-${flower.id}`,
      role: "attachment",
    }));
  }
  const nodes: CompositionGraphNode[] = [];
  for (const flower of ordered) {
    nodes.push(Object.freeze({ id: `back-${flower.id}`, flowerId: flower.id, role: "back-anchor", position: backAnchor(flower, insetMm) }));
    nodes.push(Object.freeze({ id: `surface-${flower.id}`, flowerId: flower.id, role: "surface-anchor", position: flower.position }));
  }
  return Object.freeze({
    recipe: "inset-relay-mst-v0",
    rootNodeId: `back-${root.flower.id}`,
    insetMm,
    diameterMm,
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
  });
}

export function assertCompositionContinuity(state: CompositionState): void {
  if (state.host.sourceHash !== LOCKED_HOST_INPUT.sha256) throw new Error("Composition host identity is not the locked MOCOMOCO source");
  if (!state.motif || state.flowers.length !== state.recipe.flowerCount || state.flowers.length === 0) throw new Error("Composition flower set is incomplete");
  if (state.branches.nodes.length !== state.flowers.length * 2 || state.branches.edges.length !== state.flowers.length * 2 - 1) {
    throw new Error("Composition branch graph does not match the current flower count");
  }
}

export function graphFingerprint(graph: CompositionBranchGraph): string {
  return JSON.stringify({
    recipe: graph.recipe,
    rootNodeId: graph.rootNodeId,
    insetMm: graph.insetMm,
    diameterMm: graph.diameterMm,
    nodes: graph.nodes,
    edges: graph.edges,
  });
}

export function compareAnchorPosition(host: CompositionHost, flower: CompositionFlower): number {
  if (!Number.isInteger(flower.triangleIndex) || flower.triangleIndex < 0 || flower.triangleIndex >= host.rawMesh.triangleCount) return Number.POSITIVE_INFINITY;
  const weights = flower.barycentric;
  if (weights.some((value) => !Number.isFinite(value) || value < -1e-8 || value > 1 + 1e-8)
    || Math.abs(weights[0] + weights[1] + weights[2] - 1) > 1e-8) return Number.POSITIVE_INFINITY;
  const offset = flower.triangleIndex * 9;
  let maximum = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    const expected = host.rawMesh.positions[offset + axis] * weights[0]
      + host.rawMesh.positions[offset + 3 + axis] * weights[1]
      + host.rawMesh.positions[offset + 6 + axis] * weights[2]
      + LOCKED_HOST_INPUT.translation[axis];
    maximum = Math.max(maximum, Math.abs(expected - flower.position[axis]));
  }
  return maximum;
}

export async function compositionDigest(value: unknown): Promise<string> {
  return sha256Hex(JSON.stringify(value));
}
