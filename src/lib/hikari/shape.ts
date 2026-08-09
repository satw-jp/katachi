// A small, browser-safe interchange boundary between Katachi Studies and hikari.
//
// ShapeAsset is data: it can be serialized, hashed, reopened, and passed to a
// different application. RuntimeShape is behavior: it answers the geometry
// questions needed by optical code. Keeping the two separate prevents an
// unserializable JavaScript callback from becoming the file format.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Bounds3 {
  min: Vec3;
  max: Vec3;
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type AuthoredRegionRole =
  | "host"
  | "inclusion"
  | "void"
  | "surface-emphasis"
  | "interior-emphasis"
  | "path"
  | "phase"
  | "unspecified";

export interface ShapeRegionDefinition {
  id: string;
  label: string;
  authoredRole: AuthoredRegionRole;
  notes?: string[];
}

export interface MetaballRecord extends Vec3 {
  id: string;
  radius: number;
  regionId?: string;
}

export interface CurvedRibbonSurfaceTrace {
  kind: "curved-ribbon-v1";
  /** The trace is evaluated in this stable object-local frame. */
  center: Vec3;
  referenceRadius: number;
  /** Author-facing 0–1 amount. Geometry displacement is derived from it. */
  strength: number;
}

export interface MetaballRepresentation {
  kind: "metaballs-v1";
  balls: MetaballRecord[];
  smoothK: number;
  distanceQuality: "distance-like";
  recommendedStepScale: number;
  /** Optional, saved geometry—not a view-shader normal effect. */
  surfaceTrace?: CurvedRibbonSurfaceTrace;
}

export type ScalarMeaning = "signed-distance" | "density";

export interface SampledFieldRepresentation {
  kind: "sampled-field-v1";
  dimensions: [number, number, number];
  values: number[];
  scalarMeaning: ScalarMeaning;
  isoValue: number;
  distanceQuality: "signed-distance" | "distance-like" | "level-set";
  recommendedStepScale: number;
  /** Optional nearest-voxel labels. -1 means that no authored region applies. */
  regionLabels?: number[];
  /** regionLabels stores indexes into this array. */
  regionIds?: string[];
}

export type ShapeRepresentation = MetaballRepresentation | SampledFieldRepresentation;

export interface ShapeAsset {
  formatVersion: 1;
  id: string;
  revision: string;
  source: {
    studyId: string;
    studyVersion?: string;
  };
  bounds: Bounds3;
  /** Source scale, when Katachi has one. OpticalScene chooses the active scale. */
  nativeMmPerShapeUnit: number | null;
  representation: ShapeRepresentation;
  regions: ShapeRegionDefinition[];
  recipe: JsonValue;
  sourceHash: string;
  approximations: string[];
}

export interface RuntimeShape {
  readonly asset: ShapeAsset;
  /** Negative is inside, positive is outside. It may be a level-set proxy. */
  distance(point: Vec3): number;
  contains(point: Vec3): boolean;
  normal(point: Vec3, epsilon?: number): Vec3 | null;
  regionAt(point: Vec3): string | null;
}

export function createRuntimeShape(asset: ShapeAsset): RuntimeShape {
  validateShapeAsset(asset);
  const sample = asset.representation.kind === "metaballs-v1"
    ? createMetaballSampler(asset.representation)
    : createGridSampler(asset.bounds, asset.representation);
  const defaultEpsilon = normalEpsilon(asset);

  return {
    asset,
    distance: sample.distance,
    contains: (point) => sample.distance(point) <= 0,
    normal: (point, epsilon = defaultEpsilon) => estimateNormal(sample.distance, point, epsilon),
    regionAt: sample.regionAt,
  };
}

export function serializeShapeAsset(asset: ShapeAsset): string {
  validateShapeAsset(asset);
  return JSON.stringify(asset, null, 2);
}

export function parseShapeAsset(text: string): ShapeAsset {
  const value: unknown = JSON.parse(text);
  validateShapeAsset(value);
  return value;
}

export function validateShapeAsset(value: unknown): asserts value is ShapeAsset {
  if (!isRecord(value)) throw new Error("ShapeAsset must be an object");
  if (value.formatVersion !== 1) throw new Error("Unsupported ShapeAsset formatVersion");
  requireNonEmptyString(value.id, "ShapeAsset.id");
  requireNonEmptyString(value.revision, "ShapeAsset.revision");
  if (!isRecord(value.source)) throw new Error("ShapeAsset.source must be an object");
  requireNonEmptyString(value.source.studyId, "ShapeAsset.source.studyId");
  if (value.source.studyVersion !== undefined) {
    requireNonEmptyString(value.source.studyVersion, "ShapeAsset.source.studyVersion");
  }
  validateBounds(value.bounds);
  if (value.nativeMmPerShapeUnit !== null) {
    requirePositiveNumber(value.nativeMmPerShapeUnit, "ShapeAsset.nativeMmPerShapeUnit");
  }
  requireNonEmptyString(value.sourceHash, "ShapeAsset.sourceHash");
  validateStringArray(value.approximations, "ShapeAsset.approximations");
  validateJsonValue(value.recipe, "ShapeAsset.recipe");
  if (!Array.isArray(value.regions)) throw new Error("ShapeAsset.regions must be an array");

  const regionIds = new Set<string>();
  for (const [index, region] of value.regions.entries()) {
    if (!isRecord(region)) throw new Error(`ShapeAsset.regions[${index}] must be an object`);
    requireNonEmptyString(region.id, `ShapeAsset.regions[${index}].id`);
    requireNonEmptyString(region.label, `ShapeAsset.regions[${index}].label`);
    if (!AUTHORED_REGION_ROLES.has(String(region.authoredRole))) {
      throw new Error(`ShapeAsset.regions[${index}].authoredRole is invalid`);
    }
    if (region.notes !== undefined) validateStringArray(region.notes, `ShapeAsset.regions[${index}].notes`);
    if (regionIds.has(region.id)) throw new Error(`Duplicate ShapeAsset region id: ${region.id}`);
    regionIds.add(region.id);
  }

  validateRepresentation(value.representation, regionIds);
}

const AUTHORED_REGION_ROLES: ReadonlySet<string> = new Set([
  "host",
  "inclusion",
  "void",
  "surface-emphasis",
  "interior-emphasis",
  "path",
  "phase",
  "unspecified",
]);

function validateRepresentation(value: unknown, regionIds: Set<string>): asserts value is ShapeRepresentation {
  if (!isRecord(value)) throw new Error("ShapeAsset.representation must be an object");
  if (value.kind === "metaballs-v1") {
    if (!Array.isArray(value.balls) || value.balls.length === 0) {
      throw new Error("metaballs-v1 requires at least one ball");
    }
    requireNonNegativeNumber(value.smoothK, "metaballs-v1.smoothK");
    if (value.distanceQuality !== "distance-like") {
      throw new Error("metaballs-v1.distanceQuality must be distance-like");
    }
    validateStepScale(value.recommendedStepScale);
    if (value.surfaceTrace !== undefined) validateSurfaceTrace(value.surfaceTrace);
    const ballIds = new Set<string>();
    for (const [index, ball] of value.balls.entries()) {
      if (!isRecord(ball)) throw new Error(`metaballs-v1.balls[${index}] must be an object`);
      requireNonEmptyString(ball.id, `metaballs-v1.balls[${index}].id`);
      requireVec3(ball, `metaballs-v1.balls[${index}]`);
      requirePositiveNumber(ball.radius, `metaballs-v1.balls[${index}].radius`);
      if (ball.regionId !== undefined && !regionIds.has(String(ball.regionId))) {
        throw new Error(`metaballs-v1.balls[${index}] refers to an unknown region`);
      }
      if (ballIds.has(ball.id)) throw new Error(`Duplicate metaball id: ${ball.id}`);
      ballIds.add(ball.id);
    }
    return;
  }

  if (value.kind !== "sampled-field-v1") {
    throw new Error(`Unsupported ShapeAsset representation: ${String(value.kind)}`);
  }
  const dimensions = validateDimensions(value.dimensions);
  if (!Array.isArray(value.values)) throw new Error("sampled-field-v1.values must be an array");
  const expected = dimensions[0] * dimensions[1] * dimensions[2];
  if (value.values.length !== expected) {
    throw new Error(`sampled-field-v1.values length ${value.values.length} does not match ${expected}`);
  }
  for (const [index, sample] of value.values.entries()) {
    requireFiniteNumber(sample, `sampled-field-v1.values[${index}]`);
  }
  if (value.scalarMeaning !== "signed-distance" && value.scalarMeaning !== "density") {
    throw new Error("sampled-field-v1.scalarMeaning is invalid");
  }
  requireFiniteNumber(value.isoValue, "sampled-field-v1.isoValue");
  if (!new Set(["signed-distance", "distance-like", "level-set"]).has(String(value.distanceQuality))) {
    throw new Error("sampled-field-v1.distanceQuality is invalid");
  }
  validateStepScale(value.recommendedStepScale);

  if ((value.regionLabels === undefined) !== (value.regionIds === undefined)) {
    throw new Error("sampled-field-v1 regionLabels and regionIds must be provided together");
  }
  if (value.regionLabels !== undefined && value.regionIds !== undefined) {
    if (!Array.isArray(value.regionLabels) || value.regionLabels.length !== expected) {
      throw new Error("sampled-field-v1.regionLabels must match the grid length");
    }
    if (!Array.isArray(value.regionIds)) throw new Error("sampled-field-v1.regionIds must be an array");
    for (const [index, regionId] of value.regionIds.entries()) {
      requireNonEmptyString(regionId, `sampled-field-v1.regionIds[${index}]`);
      if (!regionIds.has(regionId)) throw new Error(`sampled-field-v1 refers to unknown region: ${regionId}`);
    }
    for (const [index, label] of value.regionLabels.entries()) {
      if (!Number.isInteger(label) || label < -1 || label >= value.regionIds.length) {
        throw new Error(`sampled-field-v1.regionLabels[${index}] is invalid`);
      }
    }
  }
}

function createMetaballSampler(representation: MetaballRepresentation): {
  distance: (point: Vec3) => number;
  regionAt: (point: Vec3) => string | null;
} {
  return {
    distance: (point) => {
      let distance = ballDistance(representation.balls[0], point);
      for (let index = 1; index < representation.balls.length; index++) {
        distance = smoothMin(distance, ballDistance(representation.balls[index], point), representation.smoothK);
      }
      return distance - curvedRibbonDisplacement(point, representation.surfaceTrace);
    },
    regionAt: (point) => {
      let nearest: MetaballRecord | null = null;
      let nearestDistance = Infinity;
      for (const ball of representation.balls) {
        const distance = ballDistance(ball, point);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = ball;
        }
      }
      return nearest?.regionId ?? null;
    },
  };
}

/**
 * One deterministic, band-limited making trace used by the LD1 comparison.
 * GLSL and WGSL copies are kept intentionally small and must use the same
 * coefficients. The displacement is local to the saved shape and changes the
 * actual zero boundary queried by optics.
 */
export function curvedRibbonDisplacement(
  point: Vec3,
  trace: CurvedRibbonSurfaceTrace | undefined,
): number {
  if (!trace || trace.strength <= 0) return 0;
  const inverseRadius = 1 / trace.referenceRadius;
  const qx = (point.x - trace.center.x) * inverseRadius;
  const qy = (point.y - trace.center.y) * inverseRadius;
  const qz = (point.z - trace.center.z) * inverseRadius;
  const curve = qx * 0.74 + qz * 0.28 + Math.sin(qy * 2.7 + qz * 0.9) * 0.16 - 0.08;
  const ribbon = Math.exp(-curve * curve * 42);
  const handPressure = 0.72 + 0.28 * Math.sin(qy * 5.1 + qz * 3.7);
  return trace.strength * trace.referenceRadius * 0.22 * ribbon * handPressure;
}

function validateSurfaceTrace(value: unknown): asserts value is CurvedRibbonSurfaceTrace {
  if (!isRecord(value) || value.kind !== "curved-ribbon-v1") {
    throw new Error("metaballs-v1.surfaceTrace must be curved-ribbon-v1");
  }
  if (!isRecord(value.center)) throw new Error("metaballs-v1.surfaceTrace.center must be a vector");
  requireVec3(value.center, "metaballs-v1.surfaceTrace.center");
  requirePositiveNumber(value.referenceRadius, "metaballs-v1.surfaceTrace.referenceRadius");
  requireNonNegativeNumber(value.strength, "metaballs-v1.surfaceTrace.strength");
  if (value.strength > 1) throw new Error("metaballs-v1.surfaceTrace.strength must be <= 1");
}

function createGridSampler(bounds: Bounds3, representation: SampledFieldRepresentation): {
  distance: (point: Vec3) => number;
  regionAt: (point: Vec3) => string | null;
} {
  const [nx, ny, nz] = representation.dimensions;
  const toGrid = (point: Vec3) => ({
    x: ((point.x - bounds.min.x) / (bounds.max.x - bounds.min.x)) * (nx - 1),
    y: ((point.y - bounds.min.y) / (bounds.max.y - bounds.min.y)) * (ny - 1),
    z: ((point.z - bounds.min.z) / (bounds.max.z - bounds.min.z)) * (nz - 1),
  });
  const levelSetValue = (value: number) => representation.scalarMeaning === "density"
    ? representation.isoValue - value
    : value - representation.isoValue;

  return {
    distance: (point) => {
      const outsideDistance = distanceOutsideBounds(point, bounds);
      const grid = toGrid(clampPoint(point, bounds));
      const sampled = levelSetValue(sampleTrilinear(representation.values, representation.dimensions, grid));
      return outsideDistance > 0 ? outsideDistance + Math.max(0, sampled) : sampled;
    },
    regionAt: (point) => {
      if (!representation.regionLabels || !representation.regionIds || distanceOutsideBounds(point, bounds) > 0) {
        return null;
      }
      const grid = toGrid(point);
      const x = Math.round(clamp(grid.x, 0, nx - 1));
      const y = Math.round(clamp(grid.y, 0, ny - 1));
      const z = Math.round(clamp(grid.z, 0, nz - 1));
      const label = representation.regionLabels[gridIndex(x, y, z, nx, ny)];
      return label === undefined || label < 0 ? null : representation.regionIds[label] ?? null;
    },
  };
}

function sampleTrilinear(values: number[], dimensions: [number, number, number], point: Vec3): number {
  const [nx, ny, nz] = dimensions;
  const x0 = Math.floor(clamp(point.x, 0, nx - 1));
  const y0 = Math.floor(clamp(point.y, 0, ny - 1));
  const z0 = Math.floor(clamp(point.z, 0, nz - 1));
  const x1 = Math.min(nx - 1, x0 + 1);
  const y1 = Math.min(ny - 1, y0 + 1);
  const z1 = Math.min(nz - 1, z0 + 1);
  const tx = clamp(point.x - x0, 0, 1);
  const ty = clamp(point.y - y0, 0, 1);
  const tz = clamp(point.z - z0, 0, 1);
  const at = (x: number, y: number, z: number) => values[gridIndex(x, y, z, nx, ny)] ?? 0;
  const x00 = mix(at(x0, y0, z0), at(x1, y0, z0), tx);
  const x10 = mix(at(x0, y1, z0), at(x1, y1, z0), tx);
  const x01 = mix(at(x0, y0, z1), at(x1, y0, z1), tx);
  const x11 = mix(at(x0, y1, z1), at(x1, y1, z1), tx);
  return mix(mix(x00, x10, ty), mix(x01, x11, ty), tz);
}

function estimateNormal(
  distance: (point: Vec3) => number,
  point: Vec3,
  epsilon: number,
): Vec3 | null {
  if (!Number.isFinite(epsilon) || epsilon <= 0) return null;
  const x = distance({ x: point.x + epsilon, y: point.y, z: point.z })
    - distance({ x: point.x - epsilon, y: point.y, z: point.z });
  const y = distance({ x: point.x, y: point.y + epsilon, z: point.z })
    - distance({ x: point.x, y: point.y - epsilon, z: point.z });
  const z = distance({ x: point.x, y: point.y, z: point.z + epsilon })
    - distance({ x: point.x, y: point.y, z: point.z - epsilon });
  const length = Math.hypot(x, y, z);
  return length <= 1e-12 ? null : { x: x / length, y: y / length, z: z / length };
}

function normalEpsilon(asset: ShapeAsset): number {
  const size = {
    x: asset.bounds.max.x - asset.bounds.min.x,
    y: asset.bounds.max.y - asset.bounds.min.y,
    z: asset.bounds.max.z - asset.bounds.min.z,
  };
  if (asset.representation.kind === "sampled-field-v1") {
    const [nx, ny, nz] = asset.representation.dimensions;
    return Math.max(1e-6, Math.min(size.x / (nx - 1), size.y / (ny - 1), size.z / (nz - 1)) * 0.5);
  }
  return Math.max(1e-6, Math.min(size.x, size.y, size.z) / 512);
}

function ballDistance(ball: MetaballRecord, point: Vec3): number {
  return Math.hypot(point.x - ball.x, point.y - ball.y, point.z - ball.z) - ball.radius;
}

function smoothMin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return mix(b, a, h) - k * h * (1 - h);
}

function distanceOutsideBounds(point: Vec3, bounds: Bounds3): number {
  const dx = Math.max(bounds.min.x - point.x, 0, point.x - bounds.max.x);
  const dy = Math.max(bounds.min.y - point.y, 0, point.y - bounds.max.y);
  const dz = Math.max(bounds.min.z - point.z, 0, point.z - bounds.max.z);
  return Math.hypot(dx, dy, dz);
}

function clampPoint(point: Vec3, bounds: Bounds3): Vec3 {
  return {
    x: clamp(point.x, bounds.min.x, bounds.max.x),
    y: clamp(point.y, bounds.min.y, bounds.max.y),
    z: clamp(point.z, bounds.min.z, bounds.max.z),
  };
}

function gridIndex(x: number, y: number, z: number, nx: number, ny: number): number {
  return x + nx * (y + ny * z);
}

function validateBounds(value: unknown): asserts value is Bounds3 {
  if (!isRecord(value) || !isRecord(value.min) || !isRecord(value.max)) {
    throw new Error("ShapeAsset.bounds must contain min and max vectors");
  }
  requireVec3(value.min, "ShapeAsset.bounds.min");
  requireVec3(value.max, "ShapeAsset.bounds.max");
  if (value.max.x <= value.min.x || value.max.y <= value.min.y || value.max.z <= value.min.z) {
    throw new Error("ShapeAsset.bounds must have positive size on every axis");
  }
}

function validateDimensions(value: unknown): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error("sampled-field-v1.dimensions must contain three values");
  }
  for (const [index, dimension] of value.entries()) {
    if (!Number.isInteger(dimension) || dimension < 2) {
      throw new Error(`sampled-field-v1.dimensions[${index}] must be an integer >= 2`);
    }
  }
  return value as [number, number, number];
}

function validateStepScale(value: unknown): void {
  requirePositiveNumber(value, "representation.recommendedStepScale");
  if ((value as number) > 1) throw new Error("representation.recommendedStepScale must be <= 1");
}

function requireVec3(
  value: Record<string, unknown>,
  path: string,
): asserts value is Record<string, unknown> & Vec3 {
  requireFiniteNumber(value.x, `${path}.x`);
  requireFiniteNumber(value.y, `${path}.y`);
  requireFiniteNumber(value.z, `${path}.z`);
}

function requireFiniteNumber(value: unknown, path: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${path} must be finite`);
}

function requirePositiveNumber(value: unknown, path: string): asserts value is number {
  requireFiniteNumber(value, path);
  if (value <= 0) throw new Error(`${path} must be positive`);
}

function requireNonNegativeNumber(value: unknown, path: string): asserts value is number {
  requireFiniteNumber(value, path);
  if (value < 0) throw new Error(`${path} must not be negative`);
}

function requireNonEmptyString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${path} must be a non-empty string`);
}

function validateStringArray(value: unknown, path: string): asserts value is string[] {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
  for (const [index, item] of value.entries()) requireNonEmptyString(item, `${path}[${index}]`);
}

export function validateJsonValue(value: unknown, path = "value"): asserts value is JsonValue {
  validateJsonValueRecursive(value, path, new WeakSet<object>());
}

function validateJsonValueRecursive(value: unknown, path: string, ancestors: WeakSet<object>): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    requireFiniteNumber(value, path);
    return;
  }
  if (typeof value !== "object") throw new Error(`${path} must contain only JSON values`);
  if (ancestors.has(value)) throw new Error(`${path} must not contain circular references`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) validateJsonValueRecursive(item, `${path}[${index}]`, ancestors);
  } else {
    for (const [key, item] of Object.entries(value)) validateJsonValueRecursive(item, `${path}.${key}`, ancestors);
  }
  ancestors.delete(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function mix(a: number, b: number, t: number): number {
  return a * (1 - t) + b * t;
}
