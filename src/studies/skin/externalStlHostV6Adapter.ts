import { hashSeed, makeRng } from "../cloud-sculpt/random.ts";
import {
  captureMotifShapeParams,
  DEFAULT_SKIN_PARAMS,
  generateShapePoints,
  type Patch,
  type PatchPoint,
  type Projected,
  type SkinParams,
} from "./field.ts";
import type {
  HostQuaternion,
  HostSurfaceHit,
  HostVec3,
  ImportedHostInstance,
} from "./externalStlHost.ts";

export const V6_HOST_ADAPTER_VERSION = "skin-v6-host-adapter-v0";
export const V6_PLACEMENT_NORMAL_POLICY = "GEOMETRIC" as const;

export interface HostPlacementCandidate {
  readonly sampleIndex: number;
  readonly triangleIndex: number;
  readonly barycentric: readonly [number, number, number];
  readonly position: HostVec3;
  readonly placementNormal: HostVec3;
  readonly tangentU: HostVec3;
  readonly tangentV: HostVec3;
  readonly triangleArea: number;
}

export interface HostAuthoredFlowerMotif extends Patch {
  readonly shape: "flower";
  readonly motifPlacement: "surface";
  readonly hostAdapterVersion: string;
  readonly placementNormalPolicy: typeof V6_PLACEMENT_NORMAL_POLICY;
  readonly authoredHostTransform: {
    readonly translation: HostVec3;
    readonly rotation: HostQuaternion;
    readonly uniformScale: number;
  };
  readonly hostPlacement: HostPlacementCandidate;
  readonly source: "existing-v6-flower-generator";
}

export interface HostV6AdapterOptions {
  readonly seed?: string;
  readonly minimumClearance?: number;
}

interface WeightedTriangle {
  readonly triangleIndex: number;
  readonly area: number;
  readonly cumulativeArea: number;
}

function add(left: HostVec3, right: HostVec3): HostVec3 {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function subtract(left: HostVec3, right: HostVec3): HostVec3 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function scale(value: HostVec3, amount: number): HostVec3 {
  return { x: value.x * amount, y: value.y * amount, z: value.z * amount };
}

function dot(left: HostVec3, right: HostVec3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function cross(left: HostVec3, right: HostVec3): HostVec3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function length(value: HostVec3): number {
  return Math.hypot(value.x, value.y, value.z);
}

function normalize(value: HostVec3, label: string): HostVec3 {
  const magnitude = length(value);
  if (!(magnitude > 0) || !Number.isFinite(magnitude)) throw new Error(`${label} must be finite and non-zero`);
  return scale(value, 1 / magnitude);
}

function squaredDistance(left: HostVec3, right: HostVec3): number {
  const delta = subtract(left, right);
  return dot(delta, delta);
}

function triangleVertex(instance: ImportedHostInstance, triangle: number, vertex: number): HostVec3 {
  const offset = triangle * 9 + vertex * 3;
  return {
    x: instance.mesh.positions[offset],
    y: instance.mesh.positions[offset + 1],
    z: instance.mesh.positions[offset + 2],
  };
}

function triangleArea(instance: ImportedHostInstance, triangle: number): number {
  const a = triangleVertex(instance, triangle, 0);
  const b = triangleVertex(instance, triangle, 1);
  const c = triangleVertex(instance, triangle, 2);
  return length(cross(subtract(b, a), subtract(c, a))) * 0.5;
}

function deterministicTangentBasis(normal: HostVec3): { readonly tangentU: HostVec3; readonly tangentV: HostVec3 } {
  const axis = Math.abs(normal.x) <= Math.abs(normal.y) && Math.abs(normal.x) <= Math.abs(normal.z)
    ? { x: 1, y: 0, z: 0 }
    : Math.abs(normal.y) <= Math.abs(normal.z)
      ? { x: 0, y: 1, z: 0 }
      : { x: 0, y: 0, z: 1 };
  const tangentU = normalize(cross(axis, normal), "Host tangentU");
  const tangentV = normalize(cross(normal, tangentU), "Host tangentV");
  return { tangentU, tangentV };
}

function transformedHostTransform(instance: ImportedHostInstance): HostAuthoredFlowerMotif["authoredHostTransform"] {
  return Object.freeze({
    translation: Object.freeze({ ...instance.transform.translation }),
    rotation: Object.freeze([...instance.transform.rotation] as HostQuaternion),
    uniformScale: instance.transform.uniformScale,
  });
}

function projected(candidate: HostPlacementCandidate): Projected {
  return {
    x: candidate.position.x,
    y: candidate.position.y,
    z: candidate.position.z,
    nx: candidate.placementNormal.x,
    ny: candidate.placementNormal.y,
    nz: candidate.placementNormal.z,
  };
}

export class ExternalStlHostV6Adapter {
  readonly host: ImportedHostInstance;
  readonly seed: string;
  readonly placementNormalPolicy = V6_PLACEMENT_NORMAL_POLICY;
  private readonly weightedTriangles: readonly WeightedTriangle[];
  private readonly totalTriangleArea: number;

  constructor(host: ImportedHostInstance, options: HostV6AdapterOptions = {}) {
    this.host = host;
    this.seed = options.seed ?? "skin-v6-host";
    const weighted: WeightedTriangle[] = [];
    let total = 0;
    for (const triangle of host.mesh.validTriangleIndices) {
      const area = triangleArea(host, triangle);
      if (!(area > 0) || !Number.isFinite(area)) continue;
      total += area;
      weighted.push(Object.freeze({ triangleIndex: triangle, area, cumulativeArea: total }));
    }
    if (!(total > 0)) throw new Error("V6 Host adapter requires positive triangle area");
    this.weightedTriangles = Object.freeze(weighted);
    this.totalTriangleArea = total;
  }

  get triangleAreaTotal(): number {
    return this.totalTriangleArea;
  }

  closestSurface(point: HostVec3): HostSurfaceHit | null {
    return this.host.query.closestSurface(point);
  }

  geometricNormal(point: HostVec3): HostVec3 | null {
    return this.host.query.normal(point);
  }

  insideOutside(point: HostVec3): "inside" | "outside" | "surface" | "unknown" {
    return this.host.signedVolumeQuery?.insideOutside(point) ?? "unknown";
  }

  signedDistance(point: HostVec3): number | null {
    if (!this.host.signedVolumeQuery) return null;
    return this.host.signedVolumeQuery.signedDistance(point);
  }

  private triangleForArea(target: number): WeightedTriangle {
    let low = 0;
    let high = this.weightedTriangles.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (target < this.weightedTriangles[middle].cumulativeArea) high = middle;
      else low = middle + 1;
    }
    return this.weightedTriangles[low];
  }

  private candidate(sampleIndex: number, poolSize: number, rng: () => number): HostPlacementCandidate {
    const areaTarget = ((sampleIndex + 0.5) / poolSize) * this.totalTriangleArea;
    const weighted = this.triangleForArea(areaTarget);
    const triangle = weighted.triangleIndex;
    const a = triangleVertex(this.host, triangle, 0);
    const b = triangleVertex(this.host, triangle, 1);
    const c = triangleVertex(this.host, triangle, 2);
    const root = Math.sqrt(rng());
    const barycentric: readonly [number, number, number] = [
      1 - root,
      root * (1 - rng()),
      root * rng(),
    ];
    const position = add(add(scale(a, barycentric[0]), scale(b, barycentric[1])), scale(c, barycentric[2]));
    const normalOffset = triangle * 3;
    const placementNormal = normalize({
      x: this.host.mesh.geometricNormals[normalOffset],
      y: this.host.mesh.geometricNormals[normalOffset + 1],
      z: this.host.mesh.geometricNormals[normalOffset + 2],
    }, "Host geometric normal");
    const basis = deterministicTangentBasis(placementNormal);
    return Object.freeze({
      sampleIndex,
      triangleIndex: triangle,
      barycentric,
      position: Object.freeze(position),
      placementNormal: Object.freeze(placementNormal),
      tangentU: Object.freeze(basis.tangentU),
      tangentV: Object.freeze(basis.tangentV),
      triangleArea: weighted.area,
    });
  }

  sample(count: number, minimumClearance = 0): readonly HostPlacementCandidate[] {
    if (!Number.isInteger(count) || count < 0) throw new Error("V6 Host sample count must be a non-negative integer");
    if (!(minimumClearance >= 0) || !Number.isFinite(minimumClearance)) throw new Error("V6 Host minimumClearance must be finite and non-negative");
    if (count === 0) return [];
    const poolSize = Math.max(count, count * 8);
    const rng = makeRng(hashSeed(`${this.host.source.sourceIdentity.sha256}:${this.seed}:${count}`));
    const candidates: HostPlacementCandidate[] = [];
    const minimumClearanceSquared = minimumClearance * minimumClearance;
    for (let sampleIndex = 0; sampleIndex < poolSize && candidates.length < count; sampleIndex += 1) {
      const candidate = this.candidate(sampleIndex, poolSize, rng);
      if (minimumClearance > 0 && candidates.some((existing) => squaredDistance(existing.position, candidate.position) < minimumClearanceSquared)) continue;
      candidates.push(candidate);
    }
    return Object.freeze(candidates);
  }

  placeFlower(
    candidate: HostPlacementCandidate,
    params: SkinParams = DEFAULT_SKIN_PARAMS,
    anchorRadius: number = 2.4,
    patchId = candidate.sampleIndex + 1,
  ): HostAuthoredFlowerMotif {
    if (!(anchorRadius > 0) || !Number.isFinite(anchorRadius)) throw new Error("V6 Host flower anchorRadius must be positive and finite");
    const seed = hashSeed(`${this.host.source.sourceIdentity.sha256}:${this.seed}:${candidate.sampleIndex}:${patchId}`);
    const effectiveParams = { ...params, patchShape: "flower" as const, motifPlacement: "surface" as const };
    const points: PatchPoint[] = generateShapePoints(
      "flower",
      [],
      0,
      projected(candidate),
      anchorRadius,
      effectiveParams,
      makeRng(seed),
      patchId,
      [],
    );
    return Object.freeze({
      id: patchId,
      shape: "flower",
      motifPlacement: "surface",
      motifParams: captureMotifShapeParams(effectiveParams),
      points,
      hostAdapterVersion: V6_HOST_ADAPTER_VERSION,
      placementNormalPolicy: V6_PLACEMENT_NORMAL_POLICY,
      authoredHostTransform: transformedHostTransform(this.host),
      hostPlacement: candidate,
      source: "existing-v6-flower-generator",
    });
  }

  placeFlowers(
    count: number,
    params: SkinParams = DEFAULT_SKIN_PARAMS,
    anchorRadius = 2.4,
    options: HostV6AdapterOptions = {},
  ): readonly HostAuthoredFlowerMotif[] {
    const candidates = this.sample(count, options.minimumClearance ?? anchorRadius * 2.05);
    return Object.freeze(candidates.map((candidate, index) => this.placeFlower(candidate, params, anchorRadius, index + 1)));
  }
}

export function createExternalStlHostV6Adapter(
  host: ImportedHostInstance,
  options: HostV6AdapterOptions = {},
): ExternalStlHostV6Adapter {
  if (host.capabilities.surfaceCapability.availability !== "AVAILABLE") {
    throw new Error("V6 Host adapter requires Surface capability");
  }
  if (host.capabilities.signedVolumeCapability.availability !== "AVAILABLE") {
    throw new Error("V6 Host adapter requires promoted Signed Volume capability");
  }
  return new ExternalStlHostV6Adapter(host, options);
}
