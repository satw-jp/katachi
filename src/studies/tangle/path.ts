export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface TangleParams {
  seed: number;
  pathCount: number;
  curvature: number;
  fusion: number;
  spacing: number;
  boundaryFreedom: number;
  pathLength: number;
  tubeRadius: number;
  fillPriority: number;
}

export const DEFAULT_TANGLE_PARAMS: TangleParams = {
  seed: 260729,
  pathCount: 18,
  curvature: 0.68,
  fusion: 0.58,
  spacing: 0.12,
  boundaryFreedom: 0.15,
  pathLength: 9,
  tubeRadius: 0.031,
  fillPriority: 0.82,
};

export interface VoxelDomain {
  size: number;
  extent: number;
  inside: Uint8Array;
  distanceToSurface: Uint8Array;
}

export interface ContainedPathStats {
  requestedPaths: number;
  grownPaths: number;
  points: number;
  insideVoxels: number;
  coveredVoxels: number;
  coverage: number;
  reachCoverage: number;
  rejectedOutside: number;
  rejectedSelfIntersection: number;
  outsidePoints: number;
  targetLength: number;
  totalLength: number;
  averageLength: number;
  effectiveSelfSpacing: number;
}

export interface ContainedPathResult {
  paths: Point3[][];
  stats: ContainedPathStats;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function mixSeed(seed: number, pathIndex: number): number {
  let value = (seed ^ Math.imul(pathIndex + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  return (value ^ (value >>> 16)) >>> 0;
}

interface Harmonic {
  frequency: number;
  amplitude: number;
  phase: number;
}

function makeAxisHarmonics(rng: () => number, curvature: number): Harmonic[] {
  const baseFrequency = 1 + Math.floor(rng() * 2);
  const harmonics: Harmonic[] = [
    {
      frequency: baseFrequency,
      amplitude: 0.72 + rng() * 0.24,
      phase: rng() * Math.PI * 2,
    },
  ];
  for (let order = 2; order <= 4; order++) {
    harmonics.push({
      frequency: baseFrequency + order - 1 + Math.floor(rng() * 2),
      amplitude: curvature * (0.58 / order) * (0.65 + rng() * 0.7),
      phase: rng() * Math.PI * 2,
    });
  }
  return harmonics;
}

function sampleAxis(harmonics: Harmonic[], theta: number): number {
  let value = 0;
  for (const harmonic of harmonics) {
    value += harmonic.amplitude * Math.sin(harmonic.frequency * theta + harmonic.phase);
  }
  return value;
}

/**
 * Closed Fourier trajectories. Each axis is a sum of integer-frequency
 * harmonics, so t=0 and t=1 meet exactly. The whole set is normalized only
 * once, preserving the relative position of paths inside the common sphere.
 */
export function generateTanglePaths(params: TangleParams, samples = 64): Point3[][] {
  const count = Math.max(1, Math.round(params.pathCount));
  const sampleCount = Math.max(16, Math.round(samples));
  const rawPaths: Point3[][] = [];

  for (let pathIndex = 0; pathIndex < count; pathIndex++) {
    const rng = mulberry32(mixSeed(Math.trunc(params.seed), pathIndex));
    const xHarmonics = makeAxisHarmonics(rng, params.curvature);
    const yHarmonics = makeAxisHarmonics(rng, params.curvature);
    const zHarmonics = makeAxisHarmonics(rng, params.curvature);
    const offset = {
      x: (rng() * 2 - 1) * 0.12,
      y: (rng() * 2 - 1) * 0.12,
      z: (rng() * 2 - 1) * 0.12,
    };
    const path: Point3[] = [];
    for (let sample = 0; sample < sampleCount; sample++) {
      const theta = (sample / sampleCount) * Math.PI * 2;
      path.push({
        x: sampleAxis(xHarmonics, theta) + offset.x,
        y: sampleAxis(yHarmonics, theta) + offset.y,
        z: sampleAxis(zHarmonics, theta) + offset.z,
      });
    }
    rawPaths.push(path);
  }

  let maxRadius = 1e-6;
  for (const path of rawPaths) {
    for (const point of path) {
      maxRadius = Math.max(maxRadius, Math.hypot(point.x, point.y, point.z));
    }
  }
  const scale = 0.78 / maxRadius;
  return rawPaths.map((path) =>
    path.map((point) => ({
      x: point.x * scale,
      y: point.y * scale,
      z: point.z * scale,
    })),
  );
}

function add(a: Point3, b: Point3): Point3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subtract(a: Point3, b: Point3): Point3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(point: Point3, amount: number): Point3 {
  return { x: point.x * amount, y: point.y * amount, z: point.z * amount };
}

function dot(a: Point3, b: Point3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function lengthSquared(point: Point3): number {
  return dot(point, point);
}

function normalize(point: Point3): Point3 {
  const length = Math.sqrt(lengthSquared(point));
  return length > 1e-9 ? scale(point, 1 / length) : { x: 1, y: 0, z: 0 };
}

function randomDirection(rng: () => number): Point3 {
  const z = rng() * 2 - 1;
  const angle = rng() * Math.PI * 2;
  const radius = Math.sqrt(Math.max(0, 1 - z * z));
  return { x: Math.cos(angle) * radius, y: z, z: Math.sin(angle) * radius };
}

function voxelIndexForPoint(domain: VoxelDomain, point: Point3): number {
  const coordinate = (value: number) =>
    Math.round((value / (domain.extent * 2) + 0.5) * (domain.size - 1));
  const x = coordinate(point.x);
  const y = coordinate(point.y);
  const z = coordinate(point.z);
  if (x < 0 || x >= domain.size || y < 0 || y >= domain.size || z < 0 || z >= domain.size) return -1;
  return x + domain.size * (y + domain.size * z);
}

function pointForVoxel(domain: VoxelDomain, index: number): Point3 {
  const z = Math.floor(index / (domain.size * domain.size));
  const remainder = index - z * domain.size * domain.size;
  const y = Math.floor(remainder / domain.size);
  const x = remainder - y * domain.size;
  const coordinate = (value: number) =>
    (value / (domain.size - 1) - 0.5) * domain.extent * 2;
  return { x: coordinate(x), y: coordinate(y), z: coordinate(z) };
}

function isWithinGrowthBoundary(
  domain: VoxelDomain,
  point: Point3,
  clearanceVoxels: number,
  outsideAllowanceVoxels: number,
): boolean {
  const index = voxelIndexForPoint(domain, point);
  if (index < 0) return false;
  if (domain.inside[index] === 1) return domain.distanceToSurface[index] >= clearanceVoxels;
  return outsideAllowanceVoxels > 0 && domain.distanceToSurface[index] <= outsideAllowanceVoxels;
}

interface Segment {
  a: Point3;
  b: Point3;
  segmentIndex: number;
}

// Squared distance between two finite 3D segments (Ericson, Real-Time
// Collision Detection). Using segments rather than only sampled points is
// what prevents two coarse steps from crossing between their endpoints.
export function segmentDistanceSquared(p1: Point3, q1: Point3, p2: Point3, q2: Point3): number {
  const d1 = subtract(q1, p1);
  const d2 = subtract(q2, p2);
  const r = subtract(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const epsilon = 1e-10;
  let s = 0;
  let t = 0;
  if (a <= epsilon && e <= epsilon) return lengthSquared(r);
  if (a <= epsilon) {
    t = Math.min(1, Math.max(0, dot(d2, r) / e));
  } else {
    const c = dot(d1, r);
    if (e <= epsilon) {
      s = Math.min(1, Math.max(0, -c / a));
    } else {
      const b = dot(d1, d2);
      const denominator = a * e - b * b;
      if (denominator !== 0) s = Math.min(1, Math.max(0, (b * dot(d2, r) - c * e) / denominator));
      const tNumerator = b * s + dot(d2, r);
      if (tNumerator < 0) {
        t = 0;
        s = Math.min(1, Math.max(0, -c / a));
      } else if (tNumerator > e) {
        t = 1;
        s = Math.min(1, Math.max(0, (b - c) / a));
      } else {
        t = tNumerator / e;
      }
    }
  }
  const closest = subtract(add(p1, scale(d1, s)), add(p2, scale(d2, t)));
  return lengthSquared(closest);
}

function candidateSelfClearance(
  from: Point3,
  to: Point3,
  segments: Segment[],
  adjacentSegmentIndices: Set<number>,
): number {
  let minimumSquared = Infinity;
  for (const segment of segments) {
    // Adjacent segments necessarily meet. Only the three segments nearest
    // this growing end are exempt; every older part of the same line repels.
    if (adjacentSegmentIndices.has(segment.segmentIndex)) continue;
    minimumSquared = Math.min(minimumSquared, segmentDistanceSquared(from, to, segment.a, segment.b));
  }
  return Math.sqrt(minimumSquared);
}

function segmentStaysInside(
  domain: VoxelDomain,
  from: Point3,
  to: Point3,
  clearanceVoxels: number,
  outsideAllowanceVoxels: number,
  boundaryFreedom: number,
  outsideGate: number,
): boolean {
  let crossesOutside = false;
  for (const fraction of [0.25, 0.5, 0.75, 1]) {
    const point = add(from, scale(subtract(to, from), fraction));
    if (!isWithinGrowthBoundary(domain, point, clearanceVoxels, outsideAllowanceVoxels)) return false;
    const index = voxelIndexForPoint(domain, point);
    if (index >= 0 && domain.inside[index] !== 1) crossesOutside = true;
  }
  return !crossesOutside || outsideGate <= boundaryFreedom;
}

function countCoverage(domain: VoxelDomain, paths: Point3[][], radius: number): {
  insideVoxels: number;
  coveredVoxels: number;
} {
  let insideVoxels = 0;
  for (const value of domain.inside) if (value === 1) insideVoxels++;
  const covered = new Uint8Array(domain.inside.length);
  const voxelStep = (domain.extent * 2) / (domain.size - 1);
  const voxelRadius = Math.max(1, Math.ceil(radius / voxelStep));
  for (const path of paths) {
    for (const point of path) {
      const centerIndex = voxelIndexForPoint(domain, point);
      if (centerIndex < 0) continue;
      const center = pointForVoxel(domain, centerIndex);
      const centerZ = Math.floor(centerIndex / (domain.size * domain.size));
      const centerRemainder = centerIndex - centerZ * domain.size * domain.size;
      const centerY = Math.floor(centerRemainder / domain.size);
      const centerX = centerRemainder - centerY * domain.size;
      for (let dz = -voxelRadius; dz <= voxelRadius; dz++) {
        for (let dy = -voxelRadius; dy <= voxelRadius; dy++) {
          for (let dx = -voxelRadius; dx <= voxelRadius; dx++) {
            const x = centerX + dx;
            const y = centerY + dy;
            const z = centerZ + dz;
            if (x < 0 || x >= domain.size || y < 0 || y >= domain.size || z < 0 || z >= domain.size) continue;
            const index = x + domain.size * (y + domain.size * z);
            if (domain.inside[index] !== 1) continue;
            const voxelPoint = {
              x: center.x + dx * voxelStep,
              y: center.y + dy * voxelStep,
              z: center.z + dz * voxelStep,
            };
            if (lengthSquared(subtract(voxelPoint, point)) <= radius * radius) covered[index] = 1;
          }
        }
      }
    }
  }
  let coveredVoxels = 0;
  for (const value of covered) if (value === 1) coveredVoxels++;
  return { insideVoxels, coveredVoxels };
}

function measurePathLength(path: Point3[]): number {
  let total = 0;
  for (let index = 1; index < path.length; index++) {
    total += Math.sqrt(lengthSquared(subtract(path[index], path[index - 1])));
  }
  return total;
}

/**
 * Grow open, self-avoiding trajectories inside a voxelized host.
 *
 * Every candidate segment must:
 * - stay inside the host, or within the allowed outside boundary band;
 * - keep `params.spacing` from non-adjacent segments of the same path.
 *
 * Different paths may cross. A blocked path stops rather than crossing
 * itself or escaping the host. Same domain + params => same paths.
 */
function generateContainedPathsAttempt(
  params: TangleParams,
  domain: VoxelDomain,
): ContainedPathResult {
  const rng = mulberry32(mixSeed(Math.trunc(params.seed), 0x51f15e));
  const paths: Point3[][] = [];
  const allPoints: Point3[] = [];
  const eligibleVoxels: number[] = [];
  const voxelStep = (domain.extent * 2) / (domain.size - 1);
  const effectiveSelfSpacing = Math.max(params.spacing, params.tubeRadius * 2.1);
  const baseClearanceVoxels = Math.max(1, Math.ceil((effectiveSelfSpacing * 0.42) / voxelStep));
  const clearanceVoxels =
    params.boundaryFreedom >= 1
      ? 0
      : Math.max(0, Math.ceil(baseClearanceVoxels * (1 - params.boundaryFreedom)));
  const outsideAllowanceVoxels =
    params.boundaryFreedom > 0 ? Math.max(1, Math.ceil(params.boundaryFreedom * 3)) : 0;
  for (let index = 0; index < domain.inside.length; index++) {
    if (domain.inside[index] === 1 && domain.distanceToSurface[index] >= clearanceVoxels) eligibleVoxels.push(index);
  }

  let rejectedOutside = 0;
  let rejectedSelfIntersection = 0;
  const requestedPaths = Math.max(1, Math.round(params.pathCount));
  const fillPriority = requestedPaths === 1 ? Math.min(1, Math.max(0, params.fillPriority)) : 0;
  const stepSize = Math.max(voxelStep * 1.15, effectiveSelfSpacing * 0.48);
  const maxSteps = Math.max(8, Math.round(params.pathLength / stepSize));
  const candidateTrials = 22 + Math.round(params.curvature * 16);
  const planningVoxelRadius = Math.max(1, Math.ceil(0.13 / voxelStep));
  const planningOffsets: Array<{ dx: number; dy: number; dz: number }> = [];
  for (let dz = -planningVoxelRadius; dz <= planningVoxelRadius; dz++) {
    for (let dy = -planningVoxelRadius; dy <= planningVoxelRadius; dy++) {
      for (let dx = -planningVoxelRadius; dx <= planningVoxelRadius; dx++) {
        if (dx * dx + dy * dy + dz * dz <= planningVoxelRadius * planningVoxelRadius) {
          planningOffsets.push({ dx, dy, dz });
        }
      }
    }
  }

  for (let pathIndex = 0; pathIndex < requestedPaths; pathIndex++) {
    let seed: Point3 | null = null;
    let seedScore = -Infinity;
    for (let attempt = 0; attempt < 320 && eligibleVoxels.length > 0; attempt++) {
      const candidate = pointForVoxel(domain, eligibleVoxels[Math.floor(rng() * eligibleVoxels.length)]);
      let nearestSquared = Infinity;
      for (const point of allPoints) {
        nearestSquared = Math.min(nearestSquared, lengthSquared(subtract(candidate, point)));
      }
      const index = voxelIndexForPoint(domain, candidate);
      const surfaceDistance = domain.distanceToSurface[index] * voxelStep;
      const score = Math.min(Math.sqrt(nearestSquared), params.spacing * 6) + surfaceDistance * 0.04 + rng() * 0.02;
      if (score <= seedScore) continue;
      seedScore = score;
      seed = candidate;
    }
    if (!seed) break;

    const pathSegments: Segment[] = [];
    allPoints.push(seed);
    const visitedReach = new Uint8Array(domain.inside.length);
    const visitAround = (point: Point3, write: boolean): number => {
      const centerIndex = voxelIndexForPoint(domain, point);
      if (centerIndex < 0) return 0;
      const centerZ = Math.floor(centerIndex / (domain.size * domain.size));
      const centerRemainder = centerIndex - centerZ * domain.size * domain.size;
      const centerY = Math.floor(centerRemainder / domain.size);
      const centerX = centerRemainder - centerY * domain.size;
      let eligible = 0;
      let unvisited = 0;
      for (const offset of planningOffsets) {
        const x = centerX + offset.dx;
        const y = centerY + offset.dy;
        const z = centerZ + offset.dz;
        if (x < 0 || x >= domain.size || y < 0 || y >= domain.size || z < 0 || z >= domain.size) continue;
        const index = x + domain.size * (y + domain.size * z);
        if (domain.inside[index] !== 1) continue;
        eligible++;
        if (visitedReach[index] === 0) unvisited++;
        if (write) visitedReach[index] = 1;
      }
      return eligible > 0 ? unvisited / eligible : 0;
    };
    visitAround(seed, true);

    interface GrowthEnd {
      points: Point3[];
      direction: Point3;
      segmentIds: number[];
    }
    const initialDirection = randomDirection(rng);
    const forward: GrowthEnd = {
      points: [seed],
      direction: initialDirection,
      segmentIds: [],
    };
    const backward: GrowthEnd = {
      points: [seed],
      direction: scale(initialDirection, -1),
      segmentIds: [],
    };
    const ends = fillPriority > 0 ? [forward, backward] : [forward];

    const adjacentIndicesFor = (end: GrowthEnd): Set<number> => {
      const adjacent = new Set(end.segmentIds.slice(-3));
      if (ends.length === 1 || end.segmentIds.length >= 3) return adjacent;
      const other = end === forward ? backward : forward;
      const remaining = 3 - end.segmentIds.length;
      for (const id of other.segmentIds.slice(0, remaining)) adjacent.add(id);
      return adjacent;
    };

    const bestCandidateFor = (
      end: GrowthEnd,
    ): { point: Point3; direction: Point3; score: number } | null => {
      const from = end.points[end.points.length - 1];
      const adjacent = adjacentIndicesFor(end);
      let best: { point: Point3; direction: Point3; score: number } | null = null;
      for (let trial = 0; trial < candidateTrials; trial++) {
        const random = randomDirection(rng);
        const trialProgress = candidateTrials > 1 ? trial / (candidateTrials - 1) : 0;
        const legacyTurn =
          0.08 + params.curvature * 0.28 + trialProgress * trialProgress * 0.72;
        const plannedTurn =
          0.08 + params.curvature * 0.26 + trialProgress * trialProgress * 0.76;
        const turn =
          requestedPaths === 1
            ? Math.min(
                0.97,
                legacyTurn * (1 - fillPriority) + plannedTurn * fillPriority,
              )
            : 0.16 + params.curvature * 0.7;
        const candidateDirection = normalize(add(scale(end.direction, 1 - turn), scale(random, turn)));
        const candidate = add(from, scale(candidateDirection, stepSize));
        if (
          !segmentStaysInside(
            domain,
            from,
            candidate,
            clearanceVoxels,
            outsideAllowanceVoxels,
            params.boundaryFreedom,
            rng(),
          )
        ) {
          rejectedOutside++;
          continue;
        }
        const clearance = candidateSelfClearance(from, candidate, pathSegments, adjacent);
        if (clearance < effectiveSelfSpacing) {
          rejectedSelfIntersection++;
          continue;
        }
        const domainIndex = voxelIndexForPoint(domain, candidate);
        const surfaceDistance = domainIndex >= 0 ? domain.distanceToSurface[domainIndex] * voxelStep : 0;
        const straightness = dot(end.direction, candidateDirection);
        const unvisitedGain = fillPriority > 0 ? visitAround(candidate, false) : 0;
        const spreadCap =
          effectiveSelfSpacing * 3 + fillPriority * Math.max(0, 0.22 - effectiveSelfSpacing * 3);
        const score =
          Math.min(clearance, spreadCap) +
          surfaceDistance * 0.05 * (1 - fillPriority * 0.88) +
          straightness *
            (requestedPaths === 1 ? 0.32 * (1 - fillPriority * 0.5) : (1 - params.curvature) * 0.12) +
          unvisitedGain * fillPriority * 0.48 +
          rng() * 0.025;
        if (!best || score > best.score) best = { point: candidate, direction: candidateDirection, score };
      }
      return best;
    };

    for (let step = 0; step < maxSteps; step++) {
      const choices = ends
        .map((end) => ({ end, candidate: bestCandidateFor(end) }))
        .filter(
          (
            choice,
          ): choice is {
            end: GrowthEnd;
            candidate: { point: Point3; direction: Point3; score: number };
          } => choice.candidate !== null,
        );
      if (choices.length === 0) break;
      choices.sort((a, b) => b.candidate.score - a.candidate.score);
      const { end, candidate: best } = choices[0];
      const from = end.points[end.points.length - 1];
      const segment: Segment = {
        a: from,
        b: best.point,
        segmentIndex: pathSegments.length,
      };
      pathSegments.push(segment);
      end.segmentIds.push(segment.segmentIndex);
      end.points.push(best.point);
      allPoints.push(best.point);
      visitAround(best.point, true);
      end.direction = best.direction;
    }
    const path =
      ends.length === 2
        ? [...backward.points.slice(1).reverse(), ...forward.points]
        : forward.points;
    if (path.length >= 4) paths.push(path);
  }

  const materialRadius = params.tubeRadius * (1 + params.fusion * 5.5);
  const coverage = countCoverage(domain, paths, materialRadius);
  const reach = countCoverage(domain, paths, 0.13);
  let totalLength = 0;
  for (const path of paths) totalLength += measurePathLength(path);
  let outsidePoints = 0;
  for (const path of paths) {
    for (const point of path) {
      const index = voxelIndexForPoint(domain, point);
      if (index >= 0 && domain.inside[index] !== 1) outsidePoints++;
    }
  }
  return {
    paths,
    stats: {
      requestedPaths,
      grownPaths: paths.length,
      points: allPoints.length,
      insideVoxels: coverage.insideVoxels,
      coveredVoxels: coverage.coveredVoxels,
      coverage: coverage.insideVoxels > 0 ? coverage.coveredVoxels / coverage.insideVoxels : 0,
      reachCoverage: reach.insideVoxels > 0 ? reach.coveredVoxels / reach.insideVoxels : 0,
      rejectedOutside,
      rejectedSelfIntersection,
      outsidePoints,
      targetLength: params.pathLength,
      totalLength,
      averageLength: paths.length > 0 ? totalLength / paths.length : 0,
      effectiveSelfSpacing,
    },
  };
}

/**
 * A single long line is much more likely than a set of short lines to become
 * trapped by a narrow host feature or by its own earlier segment. Keep the
 * operation deterministic, but try several derived starts and retain the
 * longest valid result. Multi-line generation remains exactly one attempt.
 */
export function generateContainedPaths(
  params: TangleParams,
  domain: VoxelDomain,
): ContainedPathResult {
  if (Math.round(params.pathCount) !== 1) {
    return generateContainedPathsAttempt(params, domain);
  }

  let best: ContainedPathResult | null = null;
  const attempts = 48;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const candidate = generateContainedPathsAttempt(
      {
        ...params,
        seed: mixSeed(Math.trunc(params.seed), 0x713 + attempt),
      },
      domain,
    );
    if (
      !best ||
      candidate.stats.totalLength > best.stats.totalLength ||
      (candidate.stats.totalLength === best.stats.totalLength &&
        candidate.stats.coverage > best.stats.coverage)
    ) {
      best = candidate;
    }
  }
  return best!;
}
