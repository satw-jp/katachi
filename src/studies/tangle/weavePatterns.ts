import type { Point3, VoxelDomain } from "./path.ts";

export interface WeavePattern {
  id: "organic" | "loop-knit" | "tubular-braid" | "hierarchical";
  label: string;
  note: string;
  paths: Point3[][];
  totalLength: number;
}

function pointForVoxel(domain: VoxelDomain, x: number, y: number, z: number): Point3 {
  const coordinate = (value: number) =>
    (value / (domain.size - 1) - 0.5) * domain.extent * 2;
  return { x: coordinate(x), y: coordinate(y), z: coordinate(z) };
}

function voxelCoordinates(domain: VoxelDomain, point: Point3): [number, number, number] {
  const coordinate = (value: number) =>
    Math.round((value / (domain.extent * 2) + 0.5) * (domain.size - 1));
  return [coordinate(point.x), coordinate(point.y), coordinate(point.z)];
}

function isInside(domain: VoxelDomain, point: Point3): boolean {
  const [x, y, z] = voxelCoordinates(domain, point);
  if (x < 0 || x >= domain.size || y < 0 || y >= domain.size || z < 0 || z >= domain.size) {
    return false;
  }
  return domain.inside[x + domain.size * (y + domain.size * z)] === 1;
}

function distance(a: Point3, b: Point3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function measurePaths(paths: Point3[][]): number {
  let total = 0;
  for (const path of paths) {
    for (let index = 1; index < path.length; index++) {
      total += distance(path[index - 1], path[index]);
    }
  }
  return total;
}

function truncatePaths(paths: Point3[][], targetLength: number): Point3[][] {
  const result: Point3[][] = [];
  let remaining = Math.max(0, targetLength);
  for (const source of paths) {
    if (remaining <= 1e-8) break;
    if (source.length < 2) continue;
    const path: Point3[] = [source[0]];
    for (let index = 1; index < source.length; index++) {
      const previous = path[path.length - 1];
      const next = source[index];
      const segmentLength = distance(previous, next);
      if (segmentLength <= remaining) {
        path.push(next);
        remaining -= segmentLength;
        continue;
      }
      if (segmentLength > 1e-8 && remaining > 1e-8) {
        const fraction = remaining / segmentLength;
        path.push({
          x: previous.x + (next.x - previous.x) * fraction,
          y: previous.y + (next.y - previous.y) * fraction,
          z: previous.z + (next.z - previous.z) * fraction,
        });
        remaining = 0;
      }
      break;
    }
    if (path.length >= 2) result.push(path);
  }
  return result;
}

interface SliceProfile {
  x: number;
  centerY: number;
  centerZ: number;
  radiusY: number;
  radiusZ: number;
}

function sliceProfiles(domain: VoxelDomain): SliceProfile[] {
  const profiles: SliceProfile[] = [];
  for (let x = 0; x < domain.size; x++) {
    const points: Array<{ y: number; z: number }> = [];
    for (let z = 0; z < domain.size; z++) {
      for (let y = 0; y < domain.size; y++) {
        if (domain.inside[x + domain.size * (y + domain.size * z)] === 1) points.push({ y, z });
      }
    }
    if (points.length < 5) continue;
    const centerY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    const centerZ = points.reduce((sum, point) => sum + point.z, 0) / points.length;
    const radiusY = Math.max(1, Math.max(...points.map((point) => Math.abs(point.y - centerY))));
    const radiusZ = Math.max(1, Math.max(...points.map((point) => Math.abs(point.z - centerZ))));
    profiles.push({ x, centerY, centerZ, radiusY, radiusZ });
  }
  return profiles;
}

function profilePoint(
  domain: VoxelDomain,
  profile: SliceProfile,
  angle: number,
  radialScale: number,
): Point3 {
  const center = pointForVoxel(domain, profile.x, profile.centerY, profile.centerZ);
  for (let shrink = radialScale; shrink >= 0; shrink -= 0.06) {
    const point = pointForVoxel(
      domain,
      profile.x,
      profile.centerY + Math.cos(angle) * profile.radiusY * shrink,
      profile.centerZ + Math.sin(angle) * profile.radiusZ * shrink,
    );
    if (isInside(domain, point)) return point;
  }
  return center;
}

function generateLoopKnit(domain: VoxelDomain, targetLength: number): Point3[][] {
  const profiles = sliceProfiles(domain).filter((_, index) => index % 2 === 0);
  const path: Point3[] = [];
  const loopSamples = 14;
  [0.68, 0.54, 0.4, 0.26].forEach((radialScale, passIndex) => {
    const orderedProfiles = passIndex % 2 === 0 ? profiles : [...profiles].reverse();
    orderedProfiles.forEach((profile, profileIndex) => {
      const reverse = (profileIndex + passIndex) % 2 === 1;
      for (let sample = 0; sample <= loopSamples; sample++) {
        const progress = sample / loopSamples;
        const angle = (reverse ? 1 - progress : progress) * Math.PI * 2;
        path.push(profilePoint(domain, profile, angle, radialScale));
      }
    });
  });
  return truncatePaths([path], targetLength);
}

function generateTubularBraid(domain: VoxelDomain, targetLength: number): Point3[][] {
  const profiles = sliceProfiles(domain);
  if (profiles.length < 2) return [];
  const strandCount = 6;
  const build = (turns: number): Point3[][] => {
    const paths: Point3[][] = [];
    for (let strand = 0; strand < strandCount; strand++) {
      const direction = strand % 2 === 0 ? 1 : -1;
      const phase = (strand / strandCount) * Math.PI * 2;
      paths.push(
        profiles.map((profile, index) => {
          const progress = index / Math.max(1, profiles.length - 1);
          return profilePoint(
            domain,
            profile,
            phase + direction * progress * turns * Math.PI * 2,
            0.62,
          );
        }),
      );
    }
    return paths;
  };
  let lowerTurns = 0;
  let upperTurns = 4;
  for (let iteration = 0; iteration < 14; iteration++) {
    const middleTurns = (lowerTurns + upperTurns) / 2;
    if (measurePaths(build(middleTurns)) < targetLength) lowerTurns = middleTurns;
    else upperTurns = middleTurns;
  }
  return build(lowerTurns);
}

function morton3(x: number, y: number, z: number): number {
  let value = 0;
  for (let bit = 0; bit < 6; bit++) {
    value |= ((x >> bit) & 1) << (bit * 3);
    value |= ((y >> bit) & 1) << (bit * 3 + 1);
    value |= ((z >> bit) & 1) << (bit * 3 + 2);
  }
  return value >>> 0;
}

function segmentInside(domain: VoxelDomain, a: Point3, b: Point3): boolean {
  for (const fraction of [0.25, 0.5, 0.75]) {
    if (
      !isInside(domain, {
        x: a.x + (b.x - a.x) * fraction,
        y: a.y + (b.y - a.y) * fraction,
        z: a.z + (b.z - a.z) * fraction,
      })
    ) {
      return false;
    }
  }
  return true;
}

function generateHierarchicalTraversal(domain: VoxelDomain, targetLength: number): Point3[][] {
  const stride = 2;
  const voxelStep = (domain.extent * 2) / (domain.size - 1);
  const cells: Array<{ point: Point3; order: number }> = [];
  for (let z = 0; z < domain.size; z += stride) {
    for (let y = 0; y < domain.size; y += stride) {
      for (let x = 0; x < domain.size; x += stride) {
        const index = x + domain.size * (y + domain.size * z);
        if (domain.inside[index] !== 1) continue;
        const morton = morton3(x / stride, y / stride, z / stride);
        cells.push({ point: pointForVoxel(domain, x, y, z), order: morton ^ (morton >>> 1) });
      }
    }
  }
  cells.sort((a, b) => a.order - b.order);
  const raw: Point3[][] = [];
  let current: Point3[] = [];
  for (const cell of cells) {
    const previous = current[current.length - 1];
    const continuous =
      previous &&
      distance(previous, cell.point) <= voxelStep * stride * 2.2 &&
      segmentInside(domain, previous, cell.point);
    if (!continuous) {
      if (current.length >= 2) raw.push(current);
      current = [cell.point];
    } else {
      current.push(cell.point);
    }
  }
  if (current.length >= 2) raw.push(current);
  raw.sort((a, b) => measurePaths([b]) - measurePaths([a]));
  return truncatePaths(raw, targetLength);
}

export function generateWeavePatterns(
  domain: VoxelDomain,
  organicPaths: Point3[][],
  targetLength = 24,
): WeavePattern[] {
  const organic = truncatePaths(organicPaths, targetLength);
  const loopKnit = generateLoopKnit(domain, targetLength);
  const tubularBraid = generateTubularBraid(domain, targetLength);
  const hierarchical = generateHierarchicalTraversal(domain, targetLength);
  return [
    {
      id: "organic",
      label: "有機軌跡",
      note: "未訪問を読みながら一本で巡る",
      paths: organic,
      totalLength: measurePaths(organic),
    },
    {
      id: "loop-knit",
      label: "ループ編み",
      note: "断面ループを一本で連鎖",
      paths: loopKnit,
      totalLength: measurePaths(loopKnit),
    },
    {
      id: "tubular-braid",
      label: "管状ブレイド",
      note: "左右巻き6本で身体軸を包む",
      paths: tubularBraid,
      totalLength: measurePaths(tubularBraid),
    },
    {
      id: "hierarchical",
      label: "3D Hilbert近似",
      note: "内部セルを階層順に巡る",
      paths: hierarchical,
      totalLength: measurePaths(hierarchical),
    },
  ];
}
