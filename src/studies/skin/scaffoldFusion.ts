import { smoothMin } from "../cloud-sculpt/field.ts";
import type { Bounds, MeshBuildResult } from "../cloud-sculpt/meshExport.ts";

/** Source-unit description of a removable vertical support fused during the
 * same SDF sampling pass as SKIN. This is deliberately not a second mesh. */
export interface SkinScaffoldPillar {
  x: number;
  y: number;
  plateZ: number;
  topZ: number;
  shaftRadius: number;
  baseRadius: number;
  tipRadius: number;
  baseHeight: number;
  tipHeight: number;
}

function broadFootSdf(radial: number, z: number, minZ: number, maxZ: number, radius: number): number {
  const halfHeight = Math.max(1e-6, maxZ - minZ) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;
  const radialRatio = radial / Math.max(radius, 1e-6);
  const verticalRatio = Math.abs(z - centerZ) / halfHeight;
  const fourthPowerRadius = Math.pow(Math.pow(radialRatio, 4) + Math.pow(verticalRatio, 4), 0.25);
  return (fourthPowerRadius - 1) * Math.min(radius, halfHeight);
}

function pillarSdf(pillar: SkinScaffoldPillar, x: number, y: number, z: number): number {
  const dx = x - pillar.x;
  const dy = y - pillar.y;
  const radial = Math.hypot(dx, dy);
  const baseTopZ = Math.min(pillar.topZ, pillar.plateZ + Math.max(pillar.baseHeight, 1e-6));
  const tipCenterZ = pillar.topZ - pillar.tipRadius;
  const shaftAnchorZ = Math.min(baseTopZ, pillar.plateZ + pillar.shaftRadius);
  const shaftStartZ = Math.min(shaftAnchorZ, tipCenterZ);
  const shaftEndZ = Math.max(baseTopZ, tipCenterZ);
  const shaftZ = Math.max(shaftStartZ, Math.min(shaftEndZ, z));
  const shaft = Math.hypot(radial, z - shaftZ) - pillar.shaftRadius;
  const base = broadFootSdf(radial, z, pillar.plateZ, baseTopZ, pillar.baseRadius);
  // The foot needs a broad collar to survive the final ~0.5 mm sampling grid,
  // while the removable BODY contact must stay no wider than the shaft. A
  // shared collar radius made the top contact unnecessarily hard to remove.
  const baseJunctionRadius = Math.min(
    pillar.baseRadius,
    pillar.shaftRadius * 1.5,
    Math.max(1e-6, baseTopZ - pillar.plateZ),
  );
  const tipJunctionRadius = Math.max(pillar.tipRadius, pillar.shaftRadius);
  const baseCollar = Math.hypot(radial, z - baseTopZ) - baseJunctionRadius;
  const tip = Math.hypot(radial, z - tipCenterZ) - tipJunctionRadius;
  return Math.min(base, shaft, baseCollar, tip);
}

function key(x: number, y: number): string { return `${x}:${y}`; }

function expandBoundsWithRadius(
  bounds: Bounds,
  pillars: SkinScaffoldPillar[],
  radiusFor: (pillar: SkinScaffoldPillar) => number,
): Bounds {
  if (pillars.length === 0) return bounds;
  let minX = bounds.min.x; let minY = bounds.min.y; let minZ = bounds.min.z;
  let maxX = bounds.max.x; let maxY = bounds.max.y; let maxZ = bounds.max.z;
  for (const pillar of pillars) {
    const radius = radiusFor(pillar);
    const verticalPadding = Math.max(pillar.shaftRadius, pillar.tipRadius) * 1.5;
    minX = Math.min(minX, pillar.x - radius); maxX = Math.max(maxX, pillar.x + radius);
    minY = Math.min(minY, pillar.y - radius); maxY = Math.max(maxY, pillar.y + radius);
    minZ = Math.min(minZ, pillar.plateZ - verticalPadding); maxZ = Math.max(maxZ, pillar.topZ + verticalPadding);
  }
  const min = { x: minX, y: minY, z: minZ };
  const max = { x: maxX, y: maxY, z: maxZ };
  const size = { x: maxX - minX, y: maxY - minY, z: maxZ - minZ };
  return { min, max, size, longest: Math.max(size.x, size.y, size.z) };
}

export function expandBoundsWithScaffold(bounds: Bounds, pillars: SkinScaffoldPillar[]): Bounds {
  return expandBoundsWithRadius(
    bounds,
    pillars,
    (pillar) => Math.max(pillar.baseRadius, pillar.shaftRadius, pillar.tipRadius),
  );
}

export interface ScaffoldSamplingGrid {
  bounds: Bounds;
  resolution: number;
  step: number;
}

/** Extend the original BODY grid without changing its voxel pitch or phase. */
export function expandScaffoldSamplingGrid(
  bounds: Bounds,
  pillars: SkinScaffoldPillar[],
  resolutionValue: number,
): ScaffoldSamplingGrid {
  const baseResolution = Math.max(8, Math.round(resolutionValue));
  if (pillars.length === 0) {
    return { bounds, resolution: baseResolution, step: bounds.longest / baseResolution };
  }
  // v0.65's proven one-component grid used only the contact/shaft radius.
  // Keep that exact pitch and phase; the broader v0.66 first-layer pad only
  // appends cells outside it and cannot resample BODY or the contact tips.
  const contactBounds = expandBoundsWithRadius(
    bounds,
    pillars,
    (pillar) => Math.max(pillar.shaftRadius, pillar.tipRadius),
  );
  const step = contactBounds.longest / baseResolution;
  if (!(step > 0)) return { bounds: contactBounds, resolution: baseResolution, step };
  const expanded = expandBoundsWithScaffold(bounds, pillars);
  const alignAxis = (baseMin: number, rawMin: number, rawMax: number): [number, number] => {
    const lowerCells = Math.max(0, Math.ceil((baseMin - rawMin) / step - 1e-9));
    const min = baseMin - lowerCells * step;
    const cells = Math.max(1, Math.ceil((rawMax - min) / step - 1e-9));
    return [min, min + cells * step];
  };
  const [minX, maxX] = alignAxis(contactBounds.min.x, expanded.min.x, expanded.max.x);
  const [minY, maxY] = alignAxis(contactBounds.min.y, expanded.min.y, expanded.max.y);
  const [minZ, maxZ] = alignAxis(contactBounds.min.z, expanded.min.z, expanded.max.z);
  const min = { x: minX, y: minY, z: minZ };
  const max = { x: maxX, y: maxY, z: maxZ };
  const size = { x: maxX - minX, y: maxY - minY, z: maxZ - minZ };
  const longest = Math.max(size.x, size.y, size.z);
  return {
    bounds: { min, max, size, longest },
    resolution: Math.max(baseResolution, Math.round(longest / step)),
    step,
  };
}

/** Spatially indexed analytic pillar SDF. Far-field values are deliberately
 * capped positive; only the zero neighbourhood is used by the union. */
export function combineWithScaffoldSdf(
  bodySdf: (x: number, y: number, z: number) => number,
  pillars: SkinScaffoldPillar[],
): (x: number, y: number, z: number) => number {
  if (pillars.length === 0) return bodySdf;
  const maxRadius = Math.max(...pillars.map((pillar) => Math.max(pillar.baseRadius, pillar.shaftRadius, pillar.tipRadius)));
  const cellSize = Math.max(maxRadius * 3, 1e-4);
  const grid = new Map<string, SkinScaffoldPillar[]>();
  for (const pillar of pillars) {
    const gridKey = key(Math.floor(pillar.x / cellSize), Math.floor(pillar.y / cellSize));
    const bucket = grid.get(gridKey);
    if (bucket) bucket.push(pillar); else grid.set(gridKey, [pillar]);
  }
  const blend = Math.max(1e-6, Math.min(...pillars.map((pillar) => pillar.tipRadius)) * 0.5);
  return (x, y, z) => {
    let scaffold = cellSize;
    const gx = Math.floor(x / cellSize);
    const gy = Math.floor(y / cellSize);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const bucket = grid.get(key(gx + dx, gy + dy));
      if (!bucket) continue;
      for (const pillar of bucket) scaffold = Math.min(scaffold, pillarSdf(pillar, x, y, z));
    }
    return smoothMin(bodySdf(x, y, z), scaffold, blend);
  };
}

export interface FusedScaffoldPlateAnchorReport {
  ok: boolean;
  pillarCount: number;
  meshMinZMm: number;
  plateZMm: number;
  plateSpreadMm: number;
  plateClearanceMm: number;
  firstLayerHeightMm: number;
  initialLineWidthMm: number;
  minimumPrintableTracks: number;
  minimumBaseDiameterMm: number;
  minimumBaseHeightMm: number;
  minimumFirstLayerFootprintMm: number;
  requiredBaseDiameterMm: number;
}

export interface FusedScaffoldPlateNormalizationReport {
  correctedVertexCount: number;
  correctionMm: number;
}

/** Marching tetrahedra can interpolate a rounded scaffold foot a fraction of
 * a layer below its analytic plate plane. Clamp only that bounded sampling
 * overshoot to the common plate plane before the exact saved-mesh checks. */
export function normalizeFusedScaffoldPlatePlane(
  mesh: Pick<MeshBuildResult, "triangles" | "scaleMmPerUnit">,
  pillars: SkinScaffoldPillar[],
  maxCorrectionMm = 0.2,
  toleranceMm = 0.05,
): FusedScaffoldPlateNormalizationReport {
  if (pillars.length === 0) return { correctedVertexCount: 0, correctionMm: 0 };
  const plateZ = Math.min(...pillars.map((pillar) => pillar.plateZ));
  let meshMinZ = Infinity;
  for (const triangle of mesh.triangles) {
    meshMinZ = Math.min(meshMinZ, triangle.a.z, triangle.b.z, triangle.c.z);
  }
  const correctionMm = (plateZ - meshMinZ) * mesh.scaleMmPerUnit;
  if (!(correctionMm > toleranceMm)) return { correctedVertexCount: 0, correctionMm };
  if (!Number.isFinite(correctionMm) || correctionMm > maxCorrectionMm) {
    throw new Error("Fail closed: fused scaffold plate overshoot is too large to normalize (" + correctionMm.toFixed(3) + " mm)");
  }
  let correctedVertexCount = 0;
  for (const triangle of mesh.triangles) {
    for (const point of [triangle.a, triangle.b, triangle.c]) {
      if (point.z < plateZ) {
        point.z = plateZ;
        correctedVertexCount++;
      }
    }
  }
  return { correctedVertexCount, correctionMm };
}

/** Fail-closed check for the exact final fused mesh. A single connected mesh
 * is not enough: the common pillar plane must itself define the saved mesh's
 * lowest Z, otherwise Bambu can place a BODY extremum on the plate and start
 * all columns on layer 2 or 3. */
export function inspectFusedScaffoldPlateAnchoring(
  mesh: Pick<MeshBuildResult, "triangles" | "scaleMmPerUnit">,
  pillars: SkinScaffoldPillar[],
  firstLayerHeightMm = 0.2,
  initialLineWidthMm = 0.5,
  minimumPrintableTracks = 3,
): FusedScaffoldPlateAnchorReport {
  let meshMinZ = Infinity;
  for (const triangle of mesh.triangles) {
    meshMinZ = Math.min(meshMinZ, triangle.a.z, triangle.b.z, triangle.c.z);
  }
  const plateValues = pillars.map((pillar) => pillar.plateZ * mesh.scaleMmPerUnit);
  const plateZMm = plateValues.length > 0 ? Math.min(...plateValues) : Infinity;
  const plateMaxMm = plateValues.length > 0 ? Math.max(...plateValues) : -Infinity;
  const meshMinZMm = meshMinZ * mesh.scaleMmPerUnit;
  const plateSpreadMm = plateMaxMm - plateZMm;
  const plateClearanceMm = plateZMm - meshMinZMm;
  const toleranceMm = Math.min(0.05, firstLayerHeightMm * 0.25);
  const minimumBaseDiameterMm = pillars.length > 0
    ? Math.min(...pillars.map((pillar) => pillar.baseRadius * 2 * mesh.scaleMmPerUnit))
    : 0;
  const minimumBaseHeightMm = pillars.length > 0
    ? Math.min(...pillars.map((pillar) => pillar.baseHeight * mesh.scaleMmPerUnit))
    : 0;
  const minimumFirstLayerFootprintMm = pillars.length > 0
    ? Math.min(...pillars.map((pillar) => {
      const baseHeightMm = pillar.baseHeight * mesh.scaleMmPerUnit;
      if (!(baseHeightMm > firstLayerHeightMm * 0.5)) return 0;
      const verticalRatio = Math.abs(firstLayerHeightMm * 0.5 - baseHeightMm * 0.5) / (baseHeightMm * 0.5);
      const radialRatio = Math.pow(Math.max(0, 1 - Math.pow(verticalRatio, 4)), 0.25);
      return pillar.baseRadius * 2 * mesh.scaleMmPerUnit * radialRatio;
    }))
    : 0;
  const requiredBaseDiameterMm = initialLineWidthMm * minimumPrintableTracks;
  return {
    ok: pillars.length > 0
      && Number.isFinite(meshMinZMm + plateZMm + plateSpreadMm + plateClearanceMm
        + minimumBaseDiameterMm + minimumBaseHeightMm + minimumFirstLayerFootprintMm + requiredBaseDiameterMm)
      && plateSpreadMm <= 0.001
      && plateClearanceMm >= -toleranceMm
      && plateClearanceMm <= toleranceMm
      && minimumFirstLayerFootprintMm >= requiredBaseDiameterMm
      && minimumBaseHeightMm >= firstLayerHeightMm,
    pillarCount: pillars.length,
    meshMinZMm,
    plateZMm,
    plateSpreadMm,
    plateClearanceMm,
    firstLayerHeightMm,
    initialLineWidthMm,
    minimumPrintableTracks,
    minimumBaseDiameterMm,
    minimumBaseHeightMm,
    minimumFirstLayerFootprintMm,
    requiredBaseDiameterMm,
  };
}
