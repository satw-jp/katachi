/**
 * Deterministic CPU reference for straight transparent-shadow rays.
 * This deliberately does not refract the ray: interfaces attenuate the same
 * straight path with an unpolarized Fresnel transmission approximation.
 */
import {
  opticalDepthForShapePath,
  transmissionFromOpticalDepth,
  type Medium,
  type OpticalScene,
  type Rgb,
  type Vec3,
} from "./opticalScene.ts";
import {
  activeMediumAtWorldPoint,
  mediumSignedDistanceWorld,
  validateOpticalScene,
  type ActiveMedium,
} from "./opticalGeometry.ts";

export interface StraightRay { origin: Vec3; direction: Vec3; }

export interface TraceOptions {
  tMin?: number;
  maxDistance?: number;
  /** Upper bound for conservative SDF marching samples. */
  maxSteps?: number;
  /** Upper bound for discovered boundary events. */
  maxEvents?: number;
  /** Smallest march step in shape units. */
  minStep?: number;
  /** Bisection iterations used after a sign change. */
  refinementSteps?: number;
}

export interface MediumSegment {
  mediumId: string;
  kind: ActiveMedium["kind"];
  startT: number;
  endT: number;
  lengthShapeUnits: number;
  opticalDepth: Rgb;
}

export interface MediumOpticalDepth { mediumId: string; opticalDepth: Rgb; }

export interface BoundaryEvent {
  t: number;
  point: Vec3;
  boundaryMediumId: string;
  fromMediumId: string;
  toMediumId: string;
  normal: Vec3;
  /** Straight-path, unpolarized Fresnel energy transmission (1 - R). */
  transmission: number;
}

export interface StraightRayTrace {
  valid: boolean;
  normalizedRay: StraightRay | null;
  boundaryEvents: BoundaryEvent[];
  segments: MediumSegment[];
  opticalDepthByMedium: MediumOpticalDepth[];
  /** Beer-Lambert segment transmission multiplied by straight-path interface transmission. */
  throughput: Rgb;
  issues: string[];
}

const BLACK: Rgb = { r: 0, g: 0, b: 0 };
const WHITE: Rgb = { r: 1, g: 1, b: 1 };

/**
 * Marches a normalized, unbent ray.  It supports the Phase 2 scene contract:
 * air, one host, and at most one contained inclusion.  Equal IOR does not
 * merge media: it merely makes their interface transmission exactly one.
 */
export function traceStraightRay(scene: OpticalScene, ray: StraightRay, options: TraceOptions = {}): StraightRayTrace {
  const issues = validateOpticalScene(scene).slice();
  const normalizedRay = normalizeRay(ray);
  const tMin = options.tMin ?? 0;
  const maxDistance = options.maxDistance ?? 100;
  const maxSteps = integerOption(options.maxSteps, 4096, 1);
  const maxEvents = integerOption(options.maxEvents, 8, 1);
  const minStep = positiveOption(options.minStep, Math.max(scene?.boundaryEpsilon ?? 1e-5, 1e-5));
  const refinementSteps = integerOption(options.refinementSteps, 28, 1);
  if (!normalizedRay) issues.push("Ray origin and direction must be finite and direction must be non-zero");
  if (!Number.isFinite(tMin) || !Number.isFinite(maxDistance) || maxDistance <= tMin) issues.push("Trace range must be finite with maxDistance > tMin");
  if (!finitePositive(minStep)) issues.push("minStep must be finite and > 0");
  if (issues.length || !normalizedRay) return invalidTrace(issues, normalizedRay);

  const media = [scene.host, ...scene.inclusions];
  const roots: Array<{ t: number; medium: Medium }> = [];
  let t = tMin;
  let previous = media.map((medium) => mediumSignedDistanceWorld(medium, pointAt(normalizedRay, t)));
  let steps = 0;
  while (t < maxDistance && steps++ < maxSteps) {
    const nearest = Math.min(...previous.map((distance) => Math.abs(distance)));
    const nextT = Math.min(maxDistance, t + Math.max(minStep, nearest * 0.5));
    if (!(nextT > t) || !Number.isFinite(nextT)) { issues.push("SDF march produced a non-finite step"); break; }
    const next = media.map((medium) => mediumSignedDistanceWorld(medium, pointAt(normalizedRay, nextT)));
    for (let index = 0; index < media.length; index++) {
      if (!Number.isFinite(previous[index]) || !Number.isFinite(next[index])) { issues.push("SDF evaluation was non-finite"); break; }
      if (crosses(previous[index], next[index])) roots.push({ t: refineCrossing(media[index], normalizedRay, t, nextT, previous[index], refinementSteps), medium: media[index] });
    }
    if (issues.length) break;
    t = nextT;
    previous = next;
  }
  if (steps >= maxSteps && t < maxDistance) issues.push("SDF march reached maxSteps before maxDistance");
  if (issues.length) return invalidTrace(issues, normalizedRay);

  roots.sort((a, b) => a.t - b.t || a.medium.id.localeCompare(b.medium.id));
  const uniqueRoots = roots.filter((root, index) => index === 0 || Math.abs(root.t - roots[index - 1].t) > minStep * 0.25);
  if (uniqueRoots.length > maxEvents) return invalidTrace([`Trace discovered more than maxEvents (${maxEvents})`], normalizedRay);

  const boundaries: number[] = [tMin, ...uniqueRoots.map((root) => root.t), maxDistance];
  const segments: MediumSegment[] = [];
  const depths = new Map<string, Rgb>();
  let throughput = { ...WHITE };
  for (let index = 0; index < boundaries.length - 1; index++) {
    const startT = boundaries[index]; const endT = boundaries[index + 1];
    if (endT - startT <= 0) continue;
    const active = activeMediumAtWorldPoint(scene, pointAt(normalizedRay, (startT + endT) * 0.5));
    const depth = active.medium ? opticalDepthForShapePath(endT - startT, active.medium.material, scene.physicalScale) : { ...BLACK };
    segments.push({ mediumId: active.mediumId, kind: active.kind, startT, endT, lengthShapeUnits: endT - startT, opticalDepth: depth });
    addRgb(depths, active.mediumId, depth);
    const transmission = transmissionFromOpticalDepth(depth);
    throughput = multiplyRgb(throughput, transmission);
  }
  const boundaryEvents: BoundaryEvent[] = [];
  for (let index = 0; index < uniqueRoots.length; index++) {
    const root = uniqueRoots[index];
    // Classification intentionally calls a boundary band air, so sample beyond it.
    const nearestGap = Math.min(
      root.t - tMin,
      maxDistance - root.t,
      index > 0 ? root.t - uniqueRoots[index - 1].t : Number.POSITIVE_INFINITY,
      index + 1 < uniqueRoots.length ? uniqueRoots[index + 1].t - root.t : Number.POSITIVE_INFINITY,
    );
    const probe = Math.min(nearestGap * 0.25, Math.max(minStep * 2, scene.boundaryEpsilon * 2, 1e-7));
    if (!(probe > scene.boundaryEpsilon)) return invalidTrace(["Boundary events are too close to classify deterministically"], normalizedRay);
    const from = activeMediumAtWorldPoint(scene, pointAt(normalizedRay, root.t - probe));
    const to = activeMediumAtWorldPoint(scene, pointAt(normalizedRay, root.t + probe));
    if (from.mediumId === to.mediumId) continue;
    const normal = estimateNormal(root.medium, pointAt(normalizedRay, root.t), Math.max(minStep * 0.25, scene.boundaryEpsilon));
    if (!normal) return invalidTrace(["Could not estimate a finite boundary normal"], normalizedRay);
    const transmission = fresnelTransmission(normalizedRay.direction, normal, iorFor(from), iorFor(to));
    throughput = scaleRgb(throughput, transmission);
    boundaryEvents.push({ t: root.t, point: pointAt(normalizedRay, root.t), boundaryMediumId: root.medium.id, fromMediumId: from.mediumId, toMediumId: to.mediumId, normal, transmission });
  }
  return { valid: true, normalizedRay, boundaryEvents, segments, opticalDepthByMedium: [...depths].map(([mediumId, opticalDepth]) => ({ mediumId, opticalDepth })), throughput, issues: [] };
}

function invalidTrace(issues: string[], normalizedRay: StraightRay | null): StraightRayTrace {
  return { valid: false, normalizedRay, boundaryEvents: [], segments: [], opticalDepthByMedium: [], throughput: { ...BLACK }, issues };
}
function normalizeRay(ray: StraightRay): StraightRay | null {
  if (!ray || !finiteVec(ray.origin) || !finiteVec(ray.direction)) return null;
  const length = Math.hypot(ray.direction.x, ray.direction.y, ray.direction.z);
  return length > 1e-12 ? { origin: { ...ray.origin }, direction: { x: ray.direction.x / length, y: ray.direction.y / length, z: ray.direction.z / length } } : null;
}
function pointAt(ray: StraightRay, t: number): Vec3 { return { x: ray.origin.x + ray.direction.x * t, y: ray.origin.y + ray.direction.y * t, z: ray.origin.z + ray.direction.z * t }; }
function crosses(a: number, b: number): boolean { return a === 0 || b === 0 || (a < 0) !== (b < 0); }
function refineCrossing(medium: Medium, ray: StraightRay, lo0: number, hi0: number, loDistance: number, iterations: number): number {
  let lo = lo0; let hi = hi0; let sign = loDistance < 0;
  for (let i = 0; i < iterations; i++) { const mid = (lo + hi) * 0.5; const value = mediumSignedDistanceWorld(medium, pointAt(ray, mid)); if ((value < 0) === sign) lo = mid; else hi = mid; }
  return (lo + hi) * 0.5;
}
function estimateNormal(medium: Medium, point: Vec3, h: number): Vec3 | null {
  const dx = mediumSignedDistanceWorld(medium, { x: point.x + h, y: point.y, z: point.z }) - mediumSignedDistanceWorld(medium, { x: point.x - h, y: point.y, z: point.z });
  const dy = mediumSignedDistanceWorld(medium, { x: point.x, y: point.y + h, z: point.z }) - mediumSignedDistanceWorld(medium, { x: point.x, y: point.y - h, z: point.z });
  const dz = mediumSignedDistanceWorld(medium, { x: point.x, y: point.y, z: point.z + h }) - mediumSignedDistanceWorld(medium, { x: point.x, y: point.y, z: point.z - h });
  const length = Math.hypot(dx, dy, dz); return Number.isFinite(length) && length > 1e-12 ? { x: dx / length, y: dy / length, z: dz / length } : null;
}
function fresnelTransmission(direction: Vec3, normal: Vec3, n1: number, n2: number): number {
  if (Math.abs(n1 - n2) <= 1e-12) return 1;
  const cosine = Math.min(1, Math.abs(direction.x * normal.x + direction.y * normal.y + direction.z * normal.z));
  const sin2T = (n1 / n2) ** 2 * (1 - cosine * cosine); if (sin2T >= 1) return 0;
  const cosT = Math.sqrt(Math.max(0, 1 - sin2T));
  const rs = ((n1 * cosine - n2 * cosT) / (n1 * cosine + n2 * cosT)) ** 2;
  const rp = ((n1 * cosT - n2 * cosine) / (n1 * cosT + n2 * cosine)) ** 2;
  return Math.max(0, Math.min(1, 1 - (rs + rp) * 0.5));
}
function iorFor(active: ActiveMedium): number { return active.medium?.material.ior ?? 1; }
function addRgb(map: Map<string, Rgb>, id: string, value: Rgb): void { const old = map.get(id) ?? { ...BLACK }; map.set(id, { r: old.r + value.r, g: old.g + value.g, b: old.b + value.b }); }
function multiplyRgb(a: Rgb, b: Rgb): Rgb { return { r: a.r * b.r, g: a.g * b.g, b: a.b * b.b }; }
function scaleRgb(a: Rgb, scale: number): Rgb { return { r: a.r * scale, g: a.g * scale, b: a.b * scale }; }
function finiteVec(value: Vec3): boolean { return [value.x, value.y, value.z].every(Number.isFinite); }
function finitePositive(value: number): boolean { return Number.isFinite(value) && value > 0; }
function positiveOption(value: number | undefined, fallback: number): number { return value === undefined ? fallback : value; }
function integerOption(value: number | undefined, fallback: number, minimum: number): number { return value === undefined ? fallback : Number.isInteger(value) && value >= minimum ? value : fallback; }
