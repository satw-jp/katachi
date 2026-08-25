import { viewportPointVisible, type ViewportClippingState } from "./viewportClipping.ts";

export interface SupportPaintRay {
  origin: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
}

export interface SupportPaintSurfaceHit {
  position: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  distance: number;
  triangleIndex: number;
}

interface BvhNode {
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
  start: number; count: number; left: number; right: number;
}

const LEAF_TRIANGLES = 12;
const EPSILON = 1e-10;

function axisValue(positions: Float32Array, triangle: number, axis: number): number {
  const offset = triangle * 9 + axis;
  return (positions[offset] + positions[offset + 3] + positions[offset + 6]) / 3;
}

export class SupportPaintSurfaceIndex {
  private readonly triangleOrder: Uint32Array;
  private readonly nodes: BvhNode[] = [];

  constructor(private readonly positions: Float32Array) {
    if (positions.length === 0 || positions.length % 9 !== 0) {
      throw new Error("Support Paint Surface index requires finite triangle soup");
    }
    for (let index = 0; index < positions.length; index++) {
      if (!Number.isFinite(positions[index])) throw new Error("Support Paint Surface index requires finite triangle soup");
    }
    this.triangleOrder = new Uint32Array(positions.length / 9);
    for (let index = 0; index < this.triangleOrder.length; index++) this.triangleOrder[index] = index;
    this.buildNode(0, this.triangleOrder.length);
  }

  get triangleCount(): number { return this.triangleOrder.length; }
  get nodeCount(): number { return this.nodes.length; }

  private compareTriangles(left: number, right: number, axis: number): number {
    return axisValue(this.positions, left, axis) - axisValue(this.positions, right, axis) || left - right;
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
    for (let cursor = left; cursor < right; cursor++) {
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
    for (let cursor = start; cursor < end; cursor++) {
      const triangle = this.triangleOrder[cursor];
      const offset = triangle * 9;
      for (let vertex = 0; vertex < 3; vertex++) {
        const base = offset + vertex * 3;
        const x = this.positions[base]; const y = this.positions[base + 1]; const z = this.positions[base + 2];
        minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z);
      }
      const cx = axisValue(this.positions, triangle, 0);
      const cy = axisValue(this.positions, triangle, 1);
      const cz = axisValue(this.positions, triangle, 2);
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

  private intersectsBounds(node: BvhNode, ray: SupportPaintRay, maximum: number): boolean {
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

  private intersectTriangle(triangleIndex: number, ray: SupportPaintRay): SupportPaintSurfaceHit | null {
    const offset = triangleIndex * 9;
    const ax = this.positions[offset]; const ay = this.positions[offset + 1]; const az = this.positions[offset + 2];
    const bx = this.positions[offset + 3]; const by = this.positions[offset + 4]; const bz = this.positions[offset + 5];
    const cx = this.positions[offset + 6]; const cy = this.positions[offset + 7]; const cz = this.positions[offset + 8];
    const e1x = bx - ax; const e1y = by - ay; const e1z = bz - az;
    const e2x = cx - ax; const e2y = cy - ay; const e2z = cz - az;
    const px = ray.direction.y * e2z - ray.direction.z * e2y;
    const py = ray.direction.z * e2x - ray.direction.x * e2z;
    const pz = ray.direction.x * e2y - ray.direction.y * e2x;
    const determinant = e1x * px + e1y * py + e1z * pz;
    if (determinant <= EPSILON) return null; // Three.js FrontSide semantics.
    const tx = ray.origin.x - ax; const ty = ray.origin.y - ay; const tz = ray.origin.z - az;
    const u = (tx * px + ty * py + tz * pz) / determinant;
    if (u < 0 || u > 1) return null;
    const qx = ty * e1z - tz * e1y;
    const qy = tz * e1x - tx * e1z;
    const qz = tx * e1y - ty * e1x;
    const v = (ray.direction.x * qx + ray.direction.y * qy + ray.direction.z * qz) / determinant;
    if (v < 0 || u + v > 1) return null;
    const distance = (e2x * qx + e2y * qy + e2z * qz) / determinant;
    if (!(distance >= 0)) return null;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    const length = Math.hypot(nx, ny, nz);
    if (!(length > EPSILON)) return null;
    return {
      position: {
        x: ray.origin.x + ray.direction.x * distance,
        y: ray.origin.y + ray.direction.y * distance,
        z: ray.origin.z + ray.direction.z * distance,
      },
      normal: { x: nx / length, y: ny / length, z: nz / length },
      distance,
      triangleIndex,
    };
  }

  raycast(ray: SupportPaintRay, clipping: ViewportClippingState | null): SupportPaintSurfaceHit | null {
    const length = Math.hypot(ray.direction.x, ray.direction.y, ray.direction.z);
    if (!(length > EPSILON) || ![ray.origin.x, ray.origin.y, ray.origin.z].every(Number.isFinite)) return null;
    const normalized: SupportPaintRay = {
      origin: { ...ray.origin },
      direction: { x: ray.direction.x / length, y: ray.direction.y / length, z: ray.direction.z / length },
    };
    let best: SupportPaintSurfaceHit | null = null;
    const stack = [0];
    while (stack.length > 0) {
      const node = this.nodes[stack.pop()!];
      if (!this.intersectsBounds(node, normalized, best?.distance ?? Infinity)) continue;
      if (node.count > 0) {
        for (let cursor = node.start; cursor < node.start + node.count; cursor++) {
          const hit = this.intersectTriangle(this.triangleOrder[cursor], normalized);
          if (!hit || hit.distance >= (best?.distance ?? Infinity) || !viewportPointVisible(hit.position, clipping)) continue;
          best = hit;
        }
      } else {
        stack.push(node.left, node.right);
      }
    }
    return best;
  }
}
