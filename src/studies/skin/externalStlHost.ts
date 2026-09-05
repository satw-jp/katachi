import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { sha256Hex } from "../../lib/hash.ts";

export type HostAxis = "x" | "y" | "z";
export type HostHandedness = "right" | "left";
export type HostUnitStatus = "explicit" | "unresolved";
export type HostSourceFormat = "ascii-stl" | "binary-stl";

export interface HostVec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type HostQuaternion = readonly [number, number, number, number];

export interface HostSourceInterpretation {
  readonly unitStatus: HostUnitStatus;
  readonly mmPerSourceUnit?: number;
  readonly upAxis: HostAxis;
  readonly handedness: HostHandedness;
  readonly importPolicyVersion: string;
}

export interface HostInstanceTransform {
  readonly translation: HostVec3;
  readonly rotation: HostQuaternion;
  readonly uniformScale: number;
}

export interface HostBounds {
  readonly min: HostVec3;
  readonly max: HostVec3;
}

export interface HostRay {
  readonly origin: HostVec3;
  readonly direction: HostVec3;
}

export interface HostSurfaceHit {
  readonly position: HostVec3;
  readonly geometricNormal: HostVec3;
  readonly triangleIndex: number;
  readonly barycentric: readonly [number, number, number];
  /** Euclidean distance for closestSurface; ray distance for raycast. */
  readonly distance: number;
}

export interface ParsedHostMesh {
  /** Triangle soup after source interpretation, before instance transform. */
  readonly positions: Float64Array;
  /** One geometric normal per triangle; zero for a skipped degenerate triangle. */
  readonly geometricNormals: Float64Array;
  readonly triangleCount: number;
  readonly validTriangleIndices: readonly number[];
  readonly bounds: HostBounds;
  readonly coordinateFrame: "right-handed-y-up-mm";
}

export interface ParsedRawStlMesh {
  /** Triangle soup in the original STL coordinate units. */
  readonly positions: Float64Array;
  readonly triangleCount: number;
  readonly bounds: HostBounds;
}

export interface HostSurfaceQuery {
  closestSurface(point: HostVec3): HostSurfaceHit | null;
  raycast(ray: HostRay): HostSurfaceHit | null;
}

export interface ImportedHostSourceOptions {
  readonly filename: string;
  readonly interpretation: HostSourceInterpretation;
}

export interface ImportedHostSourceIdentity {
  readonly sha256: string;
  readonly byteLength: number;
}

export interface ImportedHostInstance {
  readonly source: ImportedHostSource;
  readonly transform: HostInstanceTransform;
  /** Parsed geometry after source interpretation and instance transform. */
  readonly mesh: ParsedHostMesh;
  readonly query: HostSurfaceQuery;
}

const EPSILON = 1e-10;
const MAX_SAFE_TRIANGLE_COUNT = Math.floor((Number.MAX_SAFE_INTEGER - 84) / 50);
const LEAF_TRIANGLES = 12;

interface Basis {
  readonly x: HostVec3;
  readonly y: HostVec3;
  readonly z: HostVec3;
}

interface TriangleClosestPoint {
  readonly position: HostVec3;
  readonly barycentric: readonly [number, number, number];
  readonly distanceSquared: number;
}

interface BvhNode {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
  start: number;
  count: number;
  left: number;
  right: number;
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

function cloneVec3(value: HostVec3, label: string): HostVec3 {
  return Object.freeze({
    x: finite(value.x, `${label}.x`),
    y: finite(value.y, `${label}.y`),
    z: finite(value.z, `${label}.z`),
  });
}

function cloneQuaternion(value: HostQuaternion): HostQuaternion {
  if (value.length !== 4) throw new Error("Host rotation requires four quaternion components");
  const x = finite(value[0], "rotation.x");
  const y = finite(value[1], "rotation.y");
  const z = finite(value[2], "rotation.z");
  const w = finite(value[3], "rotation.w");
  const length = Math.hypot(x, y, z, w);
  if (Math.abs(length - 1) > 1e-6) throw new Error("Host rotation quaternion must be normalized");
  return Object.freeze([x, y, z, w]);
}

function validateInterpretation(value: HostSourceInterpretation): HostSourceInterpretation {
  if (value.unitStatus !== "explicit" && value.unitStatus !== "unresolved") {
    throw new Error("Host unitStatus must be explicit or unresolved");
  }
  if (value.unitStatus === "explicit") {
    positive(value.mmPerSourceUnit ?? Number.NaN, "mmPerSourceUnit");
  } else if (value.mmPerSourceUnit !== undefined) {
    throw new Error("Unresolved Host units cannot carry mmPerSourceUnit");
  }
  if (value.upAxis !== "x" && value.upAxis !== "y" && value.upAxis !== "z") {
    throw new Error("Host upAxis must be x, y, or z");
  }
  if (value.handedness !== "right" && value.handedness !== "left") {
    throw new Error("Host handedness must be right or left");
  }
  if (typeof value.importPolicyVersion !== "string" || value.importPolicyVersion.length === 0) {
    throw new Error("Host importPolicyVersion must be non-empty");
  }
  return Object.freeze({ ...value });
}

function copyBytes(input: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  if (input instanceof ArrayBuffer) return input.slice(0);
  const source = new Uint8Array(input.buffer as ArrayBuffer, input.byteOffset, input.byteLength);
  return source.slice().buffer;
}

function binaryTriangleCount(bytes: ArrayBuffer): number | null {
  if (bytes.byteLength < 84) return null;
  const view = new DataView(bytes);
  const count = view.getUint32(80, true);
  if (count > MAX_SAFE_TRIANGLE_COUNT) return null;
  return 84 + count * 50 === bytes.byteLength ? count : null;
}

function classifyStlFormat(bytes: ArrayBuffer): HostSourceFormat {
  if (binaryTriangleCount(bytes) !== null) return "binary-stl";
  const text = new TextDecoder().decode(bytes);
  if (/^\s*solid\b/i.test(text) && /\bfacet\b/i.test(text) && /\bvertex\b/i.test(text)) return "ascii-stl";
  throw new Error("STL source is neither a recognized binary nor ASCII STL");
}

function sourceBasis(interpretation: HostSourceInterpretation): Basis {
  if (interpretation.upAxis === "y") {
    return interpretation.handedness === "right"
      ? { x: { x: 1, y: 0, z: 0 }, y: { x: 0, y: 1, z: 0 }, z: { x: 0, y: 0, z: 1 } }
      : { x: { x: 1, y: 0, z: 0 }, y: { x: 0, y: 1, z: 0 }, z: { x: 0, y: 0, z: -1 } };
  }
  if (interpretation.upAxis === "z") {
    return interpretation.handedness === "right"
      ? { x: { x: 1, y: 0, z: 0 }, y: { x: 0, y: 0, z: -1 }, z: { x: 0, y: 1, z: 0 } }
      : { x: { x: 1, y: 0, z: 0 }, y: { x: 0, y: 0, z: 1 }, z: { x: 0, y: 1, z: 0 } };
  }
  return interpretation.handedness === "right"
    ? { x: { x: 0, y: 1, z: 0 }, y: { x: 0, y: 0, z: 1 }, z: { x: 1, y: 0, z: 0 } }
    : { x: { x: 0, y: 1, z: 0 }, y: { x: 1, y: 0, z: 0 }, z: { x: 0, y: 0, z: 1 } };
}

/** Derived source-frame correction. It is never part of the instance pose. */
export function createSourceInterpretationTransform(
  interpretation: HostSourceInterpretation,
): THREE.Matrix4 {
  const checked = validateInterpretation(interpretation);
  if (checked.unitStatus !== "explicit") throw new Error("Cannot create a metric transform for unresolved Host units");
  const mm = checked.mmPerSourceUnit!;
  const basis = sourceBasis(checked);
  return new THREE.Matrix4().set(
    basis.x.x * mm, basis.y.x * mm, basis.z.x * mm, 0,
    basis.x.y * mm, basis.y.y * mm, basis.z.y * mm, 0,
    basis.x.z * mm, basis.y.z * mm, basis.z.z * mm, 0,
    0, 0, 0, 1,
  );
}

function applyMatrix(matrix: THREE.Matrix4, point: HostVec3): HostVec3 {
  const e = matrix.elements;
  return {
    x: e[0] * point.x + e[4] * point.y + e[8] * point.z + e[12],
    y: e[1] * point.x + e[5] * point.y + e[9] * point.z + e[13],
    z: e[2] * point.x + e[6] * point.y + e[10] * point.z + e[14],
  };
}

function boundsFromPositions(positions: Float64Array): HostBounds {
  let minX = Infinity; let minY = Infinity; let minZ = Infinity;
  let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
  for (let index = 0; index < positions.length; index += 3) {
    minX = Math.min(minX, positions[index]);
    minY = Math.min(minY, positions[index + 1]);
    minZ = Math.min(minZ, positions[index + 2]);
    maxX = Math.max(maxX, positions[index]);
    maxY = Math.max(maxY, positions[index + 1]);
    maxZ = Math.max(maxZ, positions[index + 2]);
  }
  return Object.freeze({
    min: Object.freeze({ x: minX, y: minY, z: minZ }),
    max: Object.freeze({ x: maxX, y: maxY, z: maxZ }),
  });
}

export function parseRawStlMesh(input: ArrayBuffer | ArrayBufferView): ParsedRawStlMesh {
  const geometry = new STLLoader().parse(copyBytes(input));
  try {
    const attribute = geometry.getAttribute("position");
    if (!attribute || attribute.itemSize !== 3 || attribute.count === 0 || attribute.count % 3 !== 0) {
      throw new Error("STL parser returned an invalid triangle position buffer");
    }
    const positions = new Float64Array(attribute.count * 3);
    for (let index = 0; index < attribute.count; index += 1) {
      positions[index * 3] = finite(attribute.getX(index), "parsed raw Host x");
      positions[index * 3 + 1] = finite(attribute.getY(index), "parsed raw Host y");
      positions[index * 3 + 2] = finite(attribute.getZ(index), "parsed raw Host z");
    }
    return Object.freeze({
      positions,
      triangleCount: attribute.count / 3,
      bounds: boundsFromPositions(positions),
    });
  } finally {
    geometry.dispose();
  }
}

function parseGeometry(source: ImportedHostSource): ParsedHostMesh {
  const interpretation = source.interpretation;
  const transform = createSourceInterpretationTransform(interpretation);
  const raw = parseRawStlMesh(source.bytes);
  const positions = new Float64Array(raw.positions.length);
  for (let index = 0; index < raw.positions.length; index += 3) {
    const point = applyMatrix(transform, {
      x: raw.positions[index],
      y: raw.positions[index + 1],
      z: raw.positions[index + 2],
    });
    positions[index] = finite(point.x, "parsed Host x");
    positions[index + 1] = finite(point.y, "parsed Host y");
    positions[index + 2] = finite(point.z, "parsed Host z");
  }
  const triangleCount = raw.triangleCount;
  const normals = new Float64Array(triangleCount * 3);
  const validTriangleIndices: number[] = [];
  const basis = sourceBasis(interpretation);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const offset = triangle * 9;
    const ax = raw.positions[offset]; const ay = raw.positions[offset + 1]; const az = raw.positions[offset + 2];
    const bx = raw.positions[offset + 3]; const by = raw.positions[offset + 4]; const bz = raw.positions[offset + 5];
    const cx = raw.positions[offset + 6]; const cy = raw.positions[offset + 7]; const cz = raw.positions[offset + 8];
    const e1x = bx - ax; const e1y = by - ay; const e1z = bz - az;
    const e2x = cx - ax; const e2y = cy - ay; const e2z = cz - az;
    const rawNx = e1y * e2z - e1z * e2y;
    const rawNy = e1z * e2x - e1x * e2z;
    const rawNz = e1x * e2y - e1y * e2x;
    const rawLength = Math.hypot(rawNx, rawNy, rawNz);
    const nx = basis.x.x * rawNx + basis.y.x * rawNy + basis.z.x * rawNz;
    const ny = basis.x.y * rawNx + basis.y.y * rawNy + basis.z.y * rawNz;
    const nz = basis.x.z * rawNx + basis.y.z * rawNy + basis.z.z * rawNz;
    const length = Math.hypot(nx, ny, nz);
    if (!(rawLength > EPSILON) || !(length > EPSILON)) continue;
    normals[triangle * 3] = nx / length;
    normals[triangle * 3 + 1] = ny / length;
    normals[triangle * 3 + 2] = nz / length;
    validTriangleIndices.push(triangle);
  }
  if (validTriangleIndices.length === 0) throw new Error("STL parser returned no non-degenerate triangles");
  return Object.freeze({
    positions,
    geometricNormals: normals,
    triangleCount,
    validTriangleIndices: Object.freeze(validTriangleIndices),
    bounds: boundsFromPositions(positions),
    coordinateFrame: "right-handed-y-up-mm",
  });
}

function transformMesh(mesh: ParsedHostMesh, transform: HostInstanceTransform): ParsedHostMesh {
  const checked = normalizeInstanceTransform(transform);
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(checked.translation.x, checked.translation.y, checked.translation.z),
    new THREE.Quaternion(...checked.rotation),
    new THREE.Vector3(checked.uniformScale, checked.uniformScale, checked.uniformScale),
  );
  const positions = new Float64Array(mesh.positions.length);
  for (let index = 0; index < mesh.positions.length; index += 3) {
    const transformed = applyMatrix(matrix, {
      x: mesh.positions[index],
      y: mesh.positions[index + 1],
      z: mesh.positions[index + 2],
    });
    positions[index] = transformed.x;
    positions[index + 1] = transformed.y;
    positions[index + 2] = transformed.z;
  }
  const normals = new Float64Array(mesh.geometricNormals.length);
  for (let index = 0; index < mesh.geometricNormals.length; index += 3) {
    const transformed = new THREE.Vector3(
      mesh.geometricNormals[index],
      mesh.geometricNormals[index + 1],
      mesh.geometricNormals[index + 2],
    ).applyQuaternion(new THREE.Quaternion(...checked.rotation)).normalize();
    normals[index] = transformed.x;
    normals[index + 1] = transformed.y;
    normals[index + 2] = transformed.z;
  }
  return Object.freeze({
    positions,
    geometricNormals: normals,
    triangleCount: mesh.triangleCount,
    validTriangleIndices: mesh.validTriangleIndices,
    bounds: boundsFromPositions(positions),
    coordinateFrame: mesh.coordinateFrame,
  });
}

function normalizeInstanceTransform(transform: HostInstanceTransform): HostInstanceTransform {
  const checked = Object.freeze({
    translation: cloneVec3(transform.translation, "translation"),
    rotation: cloneQuaternion(transform.rotation),
    uniformScale: positive(transform.uniformScale, "uniformScale"),
  });
  return checked;
}

function dot(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  return ax * bx + ay * by + az * bz;
}

function closestPointOnTriangle(point: HostVec3, positions: Float64Array, triangle: number): TriangleClosestPoint {
  const offset = triangle * 9;
  const ax = positions[offset]; const ay = positions[offset + 1]; const az = positions[offset + 2];
  const bx = positions[offset + 3]; const by = positions[offset + 4]; const bz = positions[offset + 5];
  const cx = positions[offset + 6]; const cy = positions[offset + 7]; const cz = positions[offset + 8];
  const abx = bx - ax; const aby = by - ay; const abz = bz - az;
  const acx = cx - ax; const acy = cy - ay; const acz = cz - az;
  const apx = point.x - ax; const apy = point.y - ay; const apz = point.z - az;
  const d1 = dot(abx, aby, abz, apx, apy, apz);
  const d2 = dot(acx, acy, acz, apx, apy, apz);
  if (d1 <= 0 && d2 <= 0) return pointResult(ax, ay, az, 1, 0, 0, point);

  const bpx = point.x - bx; const bpy = point.y - by; const bpz = point.z - bz;
  const d3 = dot(abx, aby, abz, bpx, bpy, bpz);
  const d4 = dot(acx, acy, acz, bpx, bpy, bpz);
  if (d3 >= 0 && d4 <= d3) return pointResult(bx, by, bz, 0, 1, 0, point);

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return pointResult(ax + v * abx, ay + v * aby, az + v * abz, 1 - v, v, 0, point);
  }

  const cpx = point.x - cx; const cpy = point.y - cy; const cpz = point.z - cz;
  const d5 = dot(abx, aby, abz, cpx, cpy, cpz);
  const d6 = dot(acx, acy, acz, cpx, cpy, cpz);
  if (d6 >= 0 && d5 <= d6) return pointResult(cx, cy, cz, 0, 0, 1, point);

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return pointResult(ax + w * acx, ay + w * acy, az + w * acz, 1 - w, 0, w, point);
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + d5 - d6);
    return pointResult(bx + w * (cx - bx), by + w * (cy - by), bz + w * (cz - bz), 0, 1 - w, w, point);
  }

  const denominator = 1 / (va + vb + vc);
  const v = vb * denominator;
  const w = vc * denominator;
  return pointResult(ax + abx * v + acx * w, ay + aby * v + acy * w, az + abz * v + acz * w, 1 - v - w, v, w, point);
}

function pointResult(
  x: number,
  y: number,
  z: number,
  a: number,
  b: number,
  c: number,
  query: HostVec3,
): TriangleClosestPoint {
  const dx = x - query.x; const dy = y - query.y; const dz = z - query.z;
  return {
    position: { x, y, z },
    barycentric: [a, b, c],
    distanceSquared: dx * dx + dy * dy + dz * dz,
  };
}

function axisValue(positions: Float64Array, triangle: number, axis: number): number {
  const offset = triangle * 9 + axis;
  return (positions[offset] + positions[offset + 3] + positions[offset + 6]) / 3;
}

class HostTriangleQuery implements HostSurfaceQuery {
  private readonly triangleOrder: Uint32Array;
  private readonly nodes: BvhNode[] = [];

  constructor(private readonly mesh: ParsedHostMesh) {
    this.triangleOrder = new Uint32Array(mesh.validTriangleIndices);
    this.buildNode(0, this.triangleOrder.length);
  }

  private compareTriangles(left: number, right: number, axis: number): number {
    return axisValue(this.mesh.positions, left, axis) - axisValue(this.mesh.positions, right, axis) || left - right;
  }

  private swapOrder(left: number, right: number): void {
    const value = this.triangleOrder[left];
    this.triangleOrder[left] = this.triangleOrder[right];
    this.triangleOrder[right] = value;
  }

  private partitionOrder(left: number, right: number, pivotIndex: number, axis: number): number {
    const pivot = this.triangleOrder[pivotIndex];
    this.swapOrder(pivotIndex, right);
    let store = left;
    for (let cursor = left; cursor < right; cursor += 1) {
      if (this.compareTriangles(this.triangleOrder[cursor], pivot, axis) < 0) this.swapOrder(store++, cursor);
    }
    this.swapOrder(store, right);
    return store;
  }

  private quickSelect(left: number, rightExclusive: number, target: number, axis: number): void {
    let low = left;
    let high = rightExclusive - 1;
    while (low < high) {
      const pivot = this.partitionOrder(low, high, low + Math.floor((high - low) / 2), axis);
      if (pivot === target) return;
      if (target < pivot) high = pivot - 1;
      else low = pivot + 1;
    }
  }

  private buildNode(start: number, end: number): number {
    let minX = Infinity; let minY = Infinity; let minZ = Infinity;
    let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
    let cMinX = Infinity; let cMinY = Infinity; let cMinZ = Infinity;
    let cMaxX = -Infinity; let cMaxY = -Infinity; let cMaxZ = -Infinity;
    for (let cursor = start; cursor < end; cursor += 1) {
      const triangle = this.triangleOrder[cursor];
      const offset = triangle * 9;
      for (let vertex = 0; vertex < 3; vertex += 1) {
        const base = offset + vertex * 3;
        const x = this.mesh.positions[base]; const y = this.mesh.positions[base + 1]; const z = this.mesh.positions[base + 2];
        minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
      }
      const cx = axisValue(this.mesh.positions, triangle, 0);
      const cy = axisValue(this.mesh.positions, triangle, 1);
      const cz = axisValue(this.mesh.positions, triangle, 2);
      cMinX = Math.min(cMinX, cx); cMinY = Math.min(cMinY, cy); cMinZ = Math.min(cMinZ, cz);
      cMaxX = Math.max(cMaxX, cx); cMaxY = Math.max(cMaxY, cy); cMaxZ = Math.max(cMaxZ, cz);
    }
    const index = this.nodes.length;
    const count = end - start;
    this.nodes.push({ minX, minY, minZ, maxX, maxY, maxZ, start, count, left: -1, right: -1 });
    if (count <= LEAF_TRIANGLES) return index;
    const spans = [cMaxX - cMinX, cMaxY - cMinY, cMaxZ - cMinZ];
    const axis = spans[1] > spans[0] ? (spans[2] > spans[1] ? 2 : 1) : (spans[2] > spans[0] ? 2 : 0);
    const middle = start + Math.floor(count / 2);
    this.quickSelect(start, end, middle, axis);
    this.nodes[index].left = this.buildNode(start, middle);
    this.nodes[index].right = this.buildNode(middle, end);
    this.nodes[index].count = 0;
    return index;
  }

  private boundsDistanceSquared(node: BvhNode, point: HostVec3): number {
    const dx = point.x < node.minX ? node.minX - point.x : point.x > node.maxX ? point.x - node.maxX : 0;
    const dy = point.y < node.minY ? node.minY - point.y : point.y > node.maxY ? point.y - node.maxY : 0;
    const dz = point.z < node.minZ ? node.minZ - point.z : point.z > node.maxZ ? point.z - node.maxZ : 0;
    return dx * dx + dy * dy + dz * dz;
  }

  closestSurface(point: HostVec3): HostSurfaceHit | null {
    const query = cloneVec3(point, "closestSurface point");
    let best: HostSurfaceHit | null = null;
    let bestDistanceSquared = Infinity;
    const stack = [0];
    while (stack.length > 0) {
      const node = this.nodes[stack.pop()!];
      if (this.boundsDistanceSquared(node, query) > bestDistanceSquared + EPSILON) continue;
      if (node.count > 0) {
        for (let cursor = node.start; cursor < node.start + node.count; cursor += 1) {
          const triangle = this.triangleOrder[cursor];
          const candidate = closestPointOnTriangle(query, this.mesh.positions, triangle);
          const replaces = candidate.distanceSquared < bestDistanceSquared - EPSILON
            || (Math.abs(candidate.distanceSquared - bestDistanceSquared) <= EPSILON
              && (best === null || triangle < best.triangleIndex));
          if (!replaces) continue;
          const normalOffset = triangle * 3;
          bestDistanceSquared = candidate.distanceSquared;
          best = {
            position: candidate.position,
            geometricNormal: {
              x: this.mesh.geometricNormals[normalOffset],
              y: this.mesh.geometricNormals[normalOffset + 1],
              z: this.mesh.geometricNormals[normalOffset + 2],
            },
            triangleIndex: triangle,
            barycentric: candidate.barycentric,
            distance: Math.sqrt(candidate.distanceSquared),
          };
        }
      } else {
        stack.push(node.right, node.left);
      }
    }
    return best;
  }

  private rayBoundsHit(node: BvhNode, ray: HostRay, maximum: number): boolean {
    let near = 0;
    let far = maximum;
    for (const axis of ["x", "y", "z"] as const) {
      const origin = ray.origin[axis];
      const direction = ray.direction[axis];
      const min = node[`min${axis.toUpperCase()}` as "minX" | "minY" | "minZ"];
      const max = node[`max${axis.toUpperCase()}` as "maxX" | "maxY" | "maxZ"];
      if (Math.abs(direction) <= EPSILON) {
        if (origin < min || origin > max) return false;
        continue;
      }
      let a = (min - origin) / direction;
      let b = (max - origin) / direction;
      if (a > b) [a, b] = [b, a];
      near = Math.max(near, a);
      far = Math.min(far, b);
      if (far < near) return false;
    }
    return far >= 0;
  }

  private rayTriangleHit(triangle: number, ray: HostRay): HostSurfaceHit | null {
    const offset = triangle * 9;
    const ax = this.mesh.positions[offset]; const ay = this.mesh.positions[offset + 1]; const az = this.mesh.positions[offset + 2];
    const bx = this.mesh.positions[offset + 3]; const by = this.mesh.positions[offset + 4]; const bz = this.mesh.positions[offset + 5];
    const cx = this.mesh.positions[offset + 6]; const cy = this.mesh.positions[offset + 7]; const cz = this.mesh.positions[offset + 8];
    const e1x = bx - ax; const e1y = by - ay; const e1z = bz - az;
    const e2x = cx - ax; const e2y = cy - ay; const e2z = cz - az;
    const px = ray.direction.y * e2z - ray.direction.z * e2y;
    const py = ray.direction.z * e2x - ray.direction.x * e2z;
    const pz = ray.direction.x * e2y - ray.direction.y * e2x;
    const determinant = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(determinant) <= EPSILON) return null;
    const inverse = 1 / determinant;
    const tx = ray.origin.x - ax; const ty = ray.origin.y - ay; const tz = ray.origin.z - az;
    const u = (tx * px + ty * py + tz * pz) * inverse;
    if (u < 0 || u > 1) return null;
    const qx = ty * e1z - tz * e1y;
    const qy = tz * e1x - tx * e1z;
    const qz = tx * e1y - ty * e1x;
    const v = (ray.direction.x * qx + ray.direction.y * qy + ray.direction.z * qz) * inverse;
    if (v < 0 || u + v > 1) return null;
    const distance = (e2x * qx + e2y * qy + e2z * qz) * inverse;
    if (!(distance >= 0)) return null;
    const normalOffset = triangle * 3;
    return {
      position: {
        x: ray.origin.x + ray.direction.x * distance,
        y: ray.origin.y + ray.direction.y * distance,
        z: ray.origin.z + ray.direction.z * distance,
      },
      geometricNormal: {
        x: this.mesh.geometricNormals[normalOffset],
        y: this.mesh.geometricNormals[normalOffset + 1],
        z: this.mesh.geometricNormals[normalOffset + 2],
      },
      triangleIndex: triangle,
      barycentric: [1 - u - v, u, v],
      distance,
    };
  }

  raycast(rayInput: HostRay): HostSurfaceHit | null {
    const origin = cloneVec3(rayInput.origin, "raycast origin");
    const directionLength = Math.hypot(rayInput.direction.x, rayInput.direction.y, rayInput.direction.z);
    if (!(directionLength > EPSILON)) throw new Error("raycast direction must be non-zero");
    const ray: HostRay = {
      origin,
      direction: {
        x: rayInput.direction.x / directionLength,
        y: rayInput.direction.y / directionLength,
        z: rayInput.direction.z / directionLength,
      },
    };
    let best: HostSurfaceHit | null = null;
    const stack = [0];
    while (stack.length > 0) {
      const node = this.nodes[stack.pop()!];
      if (!this.rayBoundsHit(node, ray, best?.distance ?? Infinity)) continue;
      if (node.count > 0) {
        for (let cursor = node.start; cursor < node.start + node.count; cursor += 1) {
          const candidate = this.rayTriangleHit(this.triangleOrder[cursor], ray);
          if (!candidate) continue;
          if (best === null || candidate.distance < best.distance - EPSILON
            || (Math.abs(candidate.distance - best.distance) <= EPSILON && candidate.triangleIndex < best.triangleIndex)) {
            best = candidate;
          }
        }
      } else {
        stack.push(node.right, node.left);
      }
    }
    return best;
  }
}

export class ImportedHostSource {
  private constructor(
    private readonly originalBytes: ArrayBuffer,
    readonly sourceIdentity: ImportedHostSourceIdentity,
    readonly filename: string,
    readonly format: HostSourceFormat,
    readonly interpretation: HostSourceInterpretation,
  ) {}

  /** Returns a detached copy so callers cannot mutate the retained source. */
  get bytes(): ArrayBuffer {
    return this.originalBytes.slice(0);
  }

  parseMesh(): ParsedHostMesh {
    return parseGeometry(this);
  }

  parseRawMesh(): ParsedRawStlMesh {
    return parseRawStlMesh(this.bytes);
  }

  static fromParts(
    bytes: ArrayBuffer,
    sourceHash: string,
    options: ImportedHostSourceOptions,
  ): ImportedHostSource {
    const interpretation = validateInterpretation(options.interpretation);
    const filename = options.filename;
    if (typeof filename !== "string" || filename.length === 0) throw new Error("Host filename must be non-empty");
    return new ImportedHostSource(
      bytes,
      Object.freeze({ sha256: sourceHash, byteLength: bytes.byteLength }),
      filename,
      classifyStlFormat(bytes),
      interpretation,
    );
  }
}

export async function createImportedHostSource(
  input: ArrayBuffer | ArrayBufferView,
  options: ImportedHostSourceOptions,
): Promise<ImportedHostSource> {
  const bytes = copyBytes(input);
  const sourceHash = await sha256Hex(bytes);
  return ImportedHostSource.fromParts(bytes, sourceHash, options);
}

export function createImportedHostInstance(
  source: ImportedHostSource,
  transform: HostInstanceTransform,
): ImportedHostInstance {
  const checkedTransform = normalizeInstanceTransform(transform);
  const mesh = transformMesh(source.parseMesh(), checkedTransform);
  return Object.freeze({
    source,
    transform: checkedTransform,
    mesh,
    query: new HostTriangleQuery(mesh),
  });
}

export const IDENTITY_HOST_INSTANCE_TRANSFORM: HostInstanceTransform = Object.freeze({
  translation: Object.freeze({ x: 0, y: 0, z: 0 }),
  rotation: Object.freeze([0, 0, 0, 1] as HostQuaternion),
  uniformScale: 1,
});
