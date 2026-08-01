/** Pure geometry for Phase 2 optical scenes. No THREE or renderer dependencies. */
import {
  IDENTITY_QUATERNION,
  type Medium,
  type OpticalScene,
  type Quaternion,
  type RigidPose,
  type ShapeSource,
  type Vec3,
} from "./opticalScene.ts";

export const DEFAULT_BOUNDARY_EPSILON = 1e-5;

export interface ActiveMedium {
  kind: "air" | "host" | "inclusion";
  /** Medium identity is retained even if material IOR happens to match another medium. */
  mediumId: string;
  medium: Medium | null;
}

export interface ContainmentFailure {
  inclusionId: string;
  witnessWorldPoint: Vec3;
  hostSignedDistance: number;
}

const AIR: ActiveMedium = { kind: "air", mediumId: "air", medium: null };

export function normalizeQuaternion(value: Quaternion | undefined): Quaternion {
  const q = value ?? IDENTITY_QUATERNION;
  const length = Math.hypot(q.x, q.y, q.z, q.w);
  if (!Number.isFinite(length) || length <= 1e-12) return { ...IDENTITY_QUATERNION };
  return { x: q.x / length, y: q.y / length, z: q.z / length, w: q.w / length };
}

export function normalizeRigidPose(value: Partial<RigidPose> | undefined): RigidPose {
  const position = value?.position;
  const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
  return {
    position: finite(position?.x) && finite(position?.y) && finite(position?.z) ? { ...position } : { x: 0, y: 0, z: 0 },
    rotation: normalizeQuaternion(value?.rotation),
    uniformScale: finite(value?.uniformScale) && value.uniformScale > 0 ? value.uniformScale : 1,
  };
}

/** Use this at scene boundaries; normalisation is allowed, but scale may never be zero or negative. */
export function hasValidRigidPose(value: RigidPose | undefined): boolean {
  if (!value || !Number.isFinite(value.uniformScale) || value.uniformScale <= 0) return false;
  const p = value.position;
  const q = value.rotation;
  return [p.x, p.y, p.z, q.x, q.y, q.z, q.w].every(Number.isFinite)
    && Math.hypot(q.x, q.y, q.z, q.w) > 1e-12;
}

export function inverseTransformPoint(worldPoint: Vec3, pose: RigidPose): Vec3 {
  const p = normalizeRigidPose(pose);
  const translated = { x: (worldPoint.x - p.position.x) / p.uniformScale, y: (worldPoint.y - p.position.y) / p.uniformScale, z: (worldPoint.z - p.position.z) / p.uniformScale };
  return rotateByQuaternion(translated, conjugate(p.rotation));
}

export function transformPoint(localPoint: Vec3, pose: RigidPose): Vec3 {
  const p = normalizeRigidPose(pose);
  const rotated = rotateByQuaternion(localPoint, p.rotation);
  return { x: p.position.x + rotated.x * p.uniformScale, y: p.position.y + rotated.y * p.uniformScale, z: p.position.z + rotated.z * p.uniformScale };
}

function conjugate(q: Quaternion): Quaternion { return { x: -q.x, y: -q.y, z: -q.z, w: q.w }; }
function rotateByQuaternion(v: Vec3, raw: Quaternion): Vec3 {
  const q = normalizeQuaternion(raw);
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  return { x: v.x + q.w * tx + (q.y * tz - q.z * ty), y: v.y + q.w * ty + (q.z * tx - q.x * tz), z: v.z + q.w * tz + (q.x * ty - q.y * tx) };
}

/** Matches field.ts polynomial smooth-min; k=0 is a hard union. */
export function evaluateBallSmoothUnionSdf(shape: ShapeSource, point: Vec3): number {
  if (shape.balls.length === 0) return Number.POSITIVE_INFINITY;
  let distance = Number.POSITIVE_INFINITY;
  const k = Number.isFinite(shape.smoothness) && shape.smoothness > 0 ? shape.smoothness : 0;
  for (const ball of shape.balls) {
    const radius = Number.isFinite(ball.radius) && ball.radius > 0 ? ball.radius : 0;
    const next = Math.hypot(point.x - ball.center.x, point.y - ball.center.y, point.z - ball.center.z) - radius;
    if (k === 0 || !Number.isFinite(distance)) distance = Math.min(distance, next);
    else {
      const h = Math.max(0, Math.min(1, 0.5 + 0.5 * (next - distance) / k));
      distance = next * (1 - h) + distance * h - k * h * (1 - h);
    }
  }
  return distance;
}

export function mediumSignedDistanceWorld(medium: Medium, worldPoint: Vec3): number {
  const pose = normalizeRigidPose(medium.pose);
  return evaluateBallSmoothUnionSdf(medium.shape, inverseTransformPoint(worldPoint, pose)) * pose.uniformScale;
}

/** Boundary (|distance| <= epsilon) is air, making ownership deterministic. */
export function activeMediumAtWorldPoint(scene: OpticalScene, worldPoint: Vec3): ActiveMedium {
  const epsilon = positiveEpsilon(scene.boundaryEpsilon);
  for (const inclusion of scene.inclusions) {
    if (mediumSignedDistanceWorld(inclusion, worldPoint) < -epsilon) return { kind: "inclusion", mediumId: inclusion.id, medium: inclusion };
  }
  if (mediumSignedDistanceWorld(scene.host, worldPoint) < -epsilon) return { kind: "host", mediumId: scene.host.id, medium: scene.host };
  return AIR;
}

/** Deterministic witness set: centres and ±axis surface points of every inclusion ball. */
export function findInvalidContainment(scene: OpticalScene): ContainmentFailure | null {
  const epsilon = positiveEpsilon(scene.boundaryEpsilon);
  for (const inclusion of scene.inclusions) {
    for (const ball of inclusion.shape.balls) {
      const r = Math.max(0, ball.radius);
      const localPoints = [ball.center, { x: ball.center.x + r, y: ball.center.y, z: ball.center.z }, { x: ball.center.x - r, y: ball.center.y, z: ball.center.z }, { x: ball.center.x, y: ball.center.y + r, z: ball.center.z }, { x: ball.center.x, y: ball.center.y - r, z: ball.center.z }, { x: ball.center.x, y: ball.center.y, z: ball.center.z + r }, { x: ball.center.x, y: ball.center.y, z: ball.center.z - r }];
      for (const localPoint of localPoints) {
        const worldPoint = transformPoint(localPoint, inclusion.pose);
        const hostDistance = mediumSignedDistanceWorld(scene.host, worldPoint);
        if (hostDistance > -epsilon) return { inclusionId: inclusion.id, witnessWorldPoint: worldPoint, hostSignedDistance: hostDistance };
      }
    }
  }
  return null;
}

export function validateOpticalScene(scene: OpticalScene): string[] {
  const issues: string[] = [];
  if (scene.inclusions.length > 1) issues.push("Phase 2 supports at most one inclusion");
  if (!scene.host.id) issues.push("Host medium needs an identity");
  if (!hasValidRigidPose(scene.host.pose)) issues.push("Host pose needs a finite rotation and uniformScale > 0");
  if (scene.inclusions.some((inclusion) => !hasValidRigidPose(inclusion.pose))) issues.push("Every inclusion pose needs a finite rotation and uniformScale > 0");
  if (scene.inclusions.some((inclusion) => !inclusion.id || inclusion.id === scene.host.id)) issues.push("Every inclusion needs an identity distinct from the host");
  if (scene.inclusions.some((inclusion, index) => scene.inclusions.findIndex((candidate) => candidate.id === inclusion.id) !== index)) issues.push("Every inclusion identity must be unique");
  if (!hasValidShape(scene.host.shape)) issues.push("Host shape needs finite balls, positive radii, and non-negative smoothness");
  if (scene.inclusions.some((inclusion) => !hasValidShape(inclusion.shape))) issues.push("Every inclusion shape needs finite balls, positive radii, and non-negative smoothness");
  if (!hasValidMaterial(scene.host.material)) issues.push("Host material needs a finite IOR, RGB absorption, and roughness");
  if (scene.inclusions.some((inclusion) => !hasValidMaterial(inclusion.material))) issues.push("Every inclusion material needs a finite IOR, RGB absorption, and roughness");
  if (!hasValidRigidPose(scene.receiver.pose) || !isNormalized(scene.receiver.normal)) issues.push("Receiver needs a valid pose and normalized local normal");
  if (!isNormalized(scene.light.direction) || !isFiniteNonNegativeRgb(scene.light.radiance)) issues.push("Directional light needs a normalized direction and non-negative finite radiance");
  if (!(scene.physicalScale.mmPerShapeUnit > 0) || !Number.isFinite(scene.physicalScale.mmPerShapeUnit)) issues.push("Physical scale must be finite and > 0");
  if (!(scene.boundaryEpsilon > 0) || !Number.isFinite(scene.boundaryEpsilon)) issues.push("boundaryEpsilon must be finite and > 0");
  if (findInvalidContainment(scene)) issues.push("Inclusion is not contained by the host at a deterministic witness point");
  return issues;
}

function positiveEpsilon(value: number): number { return Number.isFinite(value) && value > 0 ? value : DEFAULT_BOUNDARY_EPSILON; }

function isFiniteVec3(value: Vec3): boolean {
  return [value.x, value.y, value.z].every(Number.isFinite);
}

function isNormalized(value: Vec3): boolean {
  return isFiniteVec3(value) && Math.abs(Math.hypot(value.x, value.y, value.z) - 1) <= 1e-6;
}

function hasValidShape(shape: ShapeSource): boolean {
  return shape.balls.length > 0
    && Number.isFinite(shape.smoothness)
    && shape.smoothness >= 0
    && shape.balls.every((ball) => isFiniteVec3(ball.center) && Number.isFinite(ball.radius) && ball.radius > 0);
}

function hasValidMaterial(medium: Medium["material"]): boolean {
  return Boolean(medium.id)
    && Number.isFinite(medium.ior)
    && medium.ior >= 1
    && Number.isFinite(medium.roughness)
    && medium.roughness >= 0
    && medium.roughness <= 1
    && isFiniteNonNegativeRgb(medium.absorptionPerMm);
}

function isFiniteNonNegativeRgb(value: { r: number; g: number; b: number }): boolean {
  return [value.r, value.g, value.b].every((channel) => Number.isFinite(channel) && channel >= 0);
}
