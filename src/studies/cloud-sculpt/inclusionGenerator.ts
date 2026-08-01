/**
 * Reproducible, renderer-free recipes for clear inclusions.  This module does
 * not make an OpticalScene: callers remain free to decide how to render or
 * trace the generated media.
 */
import { hashSeed, makeRng } from "./random.ts";
import type { Medium, OpticalMaterial, PhysicalScale, ShapeBall, ShapeSource, Vec3 } from "./opticalScene.ts";
import { mediumSignedDistanceWorld, transformPoint } from "./opticalGeometry.ts";

export interface InclusionRecipe {
  seed: string;
  count: { min: number; max: number };
  shapeFamily: "round" | "soft-cluster" | "stretched" | "mixed";
  sizeMm: { min: number; max: number; distribution: "even" | "varied" };
  placement: "scattered" | "clustered" | "layered" | "author-seeded";
  minimumHostWallMm: number;
  minimumGapMm: number;
  allowMerge: boolean;
}

export interface InclusionGenerationOptions {
  /** Positions are world-space, consumed in order only by author-seeded recipes. */
  authorPositions?: readonly Vec3[];
  /** Kept finite so an overcrowded recipe always terminates. */
  maxAttemptsPerInclusion?: number;
}

export interface InclusionGenerationResult {
  inclusions: readonly Medium[];
  issues: readonly string[];
  recipe: InclusionRecipe;
}

const DEFAULT_RECIPE: InclusionRecipe = {
  seed: "inclusions", count: { min: 1, max: 1 }, shapeFamily: "round",
  sizeMm: { min: 1, max: 2, distribution: "even" }, placement: "scattered",
  minimumHostWallMm: 1, minimumGapMm: 0.5, allowMerge: false,
};
const AXES: readonly Vec3[] = [
  { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
  { x: 0.577, y: 0.577, z: 0.577 }, { x: -0.577, y: 0.577, z: 0.577 },
  { x: 0.577, y: -0.577, z: 0.577 }, { x: 0.577, y: 0.577, z: -0.577 },
];

export function normalizeInclusionRecipe(value: Partial<InclusionRecipe> | undefined): InclusionRecipe {
  const raw = value ?? {};
  const countMin = count(raw.count?.min, DEFAULT_RECIPE.count.min);
  const countMax = Math.max(countMin, count(raw.count?.max, DEFAULT_RECIPE.count.max));
  const sizeMin = positive(raw.sizeMm?.min, DEFAULT_RECIPE.sizeMm.min);
  const sizeMax = Math.max(sizeMin, positive(raw.sizeMm?.max, DEFAULT_RECIPE.sizeMm.max));
  return {
    seed: typeof raw.seed === "string" && raw.seed.trim() ? raw.seed : DEFAULT_RECIPE.seed,
    count: { min: countMin, max: countMax },
    shapeFamily: raw.shapeFamily === "soft-cluster" || raw.shapeFamily === "stretched" || raw.shapeFamily === "mixed" ? raw.shapeFamily : "round",
    sizeMm: { min: sizeMin, max: sizeMax, distribution: raw.sizeMm?.distribution === "varied" ? "varied" : "even" },
    placement: raw.placement === "clustered" || raw.placement === "layered" || raw.placement === "author-seeded" ? raw.placement : "scattered",
    minimumHostWallMm: nonNegative(raw.minimumHostWallMm, DEFAULT_RECIPE.minimumHostWallMm),
    minimumGapMm: nonNegative(raw.minimumGapMm, DEFAULT_RECIPE.minimumGapMm),
    allowMerge: raw.allowMerge === true,
  };
}

export function generateInclusions(
  host: Medium,
  material: OpticalMaterial,
  physicalScale: PhysicalScale,
  recipeInput: Partial<InclusionRecipe> | undefined,
  options: InclusionGenerationOptions = {},
): InclusionGenerationResult {
  const recipe = normalizeInclusionRecipe(recipeInput);
  const issues: string[] = [];
  if (recipe.allowMerge) issues.push("allowMerge is unsupported: coincident inclusion boundaries are not generated");
  if (!(physicalScale.mmPerShapeUnit > 0) || !Number.isFinite(physicalScale.mmPerShapeUnit)) {
    return { inclusions: [], issues: [...issues, "Physical scale must be finite and > 0"], recipe };
  }
  const mmPerUnit = physicalScale.mmPerShapeUnit;
  const rng = makeRng(hashSeed(recipe.seed));
  const requested = recipe.count.min + Math.floor(rng() * (recipe.count.max - recipe.count.min + 1));
  const maxAttempts = clampInt(options.maxAttemptsPerInclusion, 1, 512, 48);
  const inclusions: Medium[] = [];
  const accepted: Array<{ position: Vec3; radius: number }> = [];
  const hostBounds = bounds(host.shape.balls);
  if (!hostBounds) return { inclusions, issues: [...issues, "Host has no finite positive balls for inclusion placement"], recipe };

  for (let index = 0; index < requested; index++) {
    const radius = sizeFor(recipe, rng) / mmPerUnit / 2;
    const family = recipe.shapeFamily === "mixed" ? (rng() < 0.5 ? "round" : rng() < 0.5 ? "soft-cluster" : "stretched") : recipe.shapeFamily;
    const balls = shapeBalls(family, radius, rng);
    let acceptedMedium: Medium | undefined;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const position = recipe.placement === "author-seeded" && options.authorPositions?.[index]
        ? copy(options.authorPositions[index])
        : candidatePosition(host, hostBounds, recipe.placement, index, requested, rng);
      const medium: Medium = {
        id: `inclusion-${index + 1}-${hashSeed(`${recipe.seed}:${index}`).toString(36)}`,
        material: { ...material, absorptionPerMm: { ...material.absorptionPerMm } },
        shape: { kind: "balls-smooth-union", balls, smoothness: family === "round" ? 0 : radius * 0.45 },
        pose: { position, rotation: { x: 0, y: 0, z: 0, w: 1 }, uniformScale: 1 },
      };
      const envelope = maxEnvelope(medium.shape);
      if (containedWithWall(host, medium, recipe.minimumHostWallMm / mmPerUnit)
        && separated(position, envelope, accepted, recipe.minimumGapMm / mmPerUnit)) {
        acceptedMedium = medium;
        accepted.push({ position: copy(position), radius: envelope });
        break;
      }
    }
    if (acceptedMedium) inclusions.push(acceptedMedium);
    else issues.push(`Could not fit requested inclusion ${index + 1} after ${maxAttempts} deterministic attempts`);
  }
  if (inclusions.length < requested) issues.push(`Generated ${inclusions.length} of ${requested} requested inclusions`);
  return { inclusions, issues, recipe };
}

function containedWithWall(host: Medium, inclusion: Medium, wall: number): boolean {
  // Full smoothness is a conservative expansion; it may reject a tight but
  // valid candidate, but never accepts a visible blend bulge as safely inside.
  const expansion = Math.max(0, inclusion.shape.smoothness);
  for (const ball of inclusion.shape.balls) for (const direction of AXES) {
    const radius = ball.radius + expansion;
    const point = transformPoint({ x: ball.center.x + direction.x * radius, y: ball.center.y + direction.y * radius, z: ball.center.z + direction.z * radius }, inclusion.pose);
    if (mediumSignedDistanceWorld(host, point) > -wall) return false;
  }
  return true;
}

function candidatePosition(host: Medium, b: { min: Vec3; max: Vec3 }, placement: InclusionRecipe["placement"], index: number, total: number, rng: () => number): Vec3 {
  const centre = { x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2, z: (b.min.z + b.max.z) / 2 };
  const local = {
    x: b.min.x + (b.max.x - b.min.x) * rng(), y: b.min.y + (b.max.y - b.min.y) * rng(), z: b.min.z + (b.max.z - b.min.z) * rng(),
  };
  if (placement === "clustered") {
    local.x = centre.x + (local.x - centre.x) * 0.45;
    local.y = centre.y + (local.y - centre.y) * 0.45;
    local.z = centre.z + (local.z - centre.z) * 0.45;
  }
  if (placement === "layered") local.y = b.min.y + (b.max.y - b.min.y) * ((index + 1) / (total + 1));
  return transformPoint(local, host.pose);
}

function shapeBalls(family: "round" | "soft-cluster" | "stretched", r: number, rng: () => number): readonly ShapeBall[] {
  if (family === "round") return [{ center: { x: 0, y: 0, z: 0 }, radius: r }];
  const axis = rng() < 0.5 ? "x" : rng() < 0.5 ? "y" : "z";
  const count = family === "soft-cluster" ? 3 : 4;
  return Array.from({ length: count }, (_, i) => {
    const offset = (i - (count - 1) / 2) * r * (family === "stretched" ? 0.9 : 0.65);
    return { center: { x: axis === "x" ? offset : 0, y: axis === "y" ? offset : 0, z: axis === "z" ? offset : 0 }, radius: r * (family === "soft-cluster" ? 0.7 + rng() * 0.3 : 0.72) };
  });
}

function sizeFor(recipe: InclusionRecipe, rng: () => number): number {
  const t = recipe.sizeMm.distribution === "varied" ? rng() * rng() : rng();
  return recipe.sizeMm.min + (recipe.sizeMm.max - recipe.sizeMm.min) * t;
}
function bounds(balls: readonly ShapeBall[]): { min: Vec3; max: Vec3 } | null {
  if (!balls.length || balls.some((b) => !Number.isFinite(b.radius) || b.radius <= 0)) return null;
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const ball of balls) for (const axis of ["x", "y", "z"] as const) { min[axis] = Math.min(min[axis], ball.center[axis] - ball.radius); max[axis] = Math.max(max[axis], ball.center[axis] + ball.radius); }
  return { min, max };
}
function maxEnvelope(shape: ShapeSource): number { return Math.max(...shape.balls.map((b) => Math.hypot(b.center.x, b.center.y, b.center.z) + b.radius + Math.max(0, shape.smoothness))); }
function separated(position: Vec3, radius: number, prior: readonly { position: Vec3; radius: number }[], gap: number): boolean { return prior.every((p) => Math.hypot(position.x - p.position.x, position.y - p.position.y, position.z - p.position.z) >= radius + p.radius + gap); }
function copy(v: Vec3): Vec3 { return { x: v.x, y: v.y, z: v.z }; }
function positive(v: unknown, fallback: number): number { return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback; }
function nonNegative(v: unknown, fallback: number): number { return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : fallback; }
function count(v: unknown, fallback: number): number { return clampInt(v, 1, 32, fallback); }
function clampInt(v: unknown, min: number, max: number, fallback: number): number { return typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.floor(v))) : fallback; }
