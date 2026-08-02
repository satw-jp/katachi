import assert from "node:assert/strict";
import {
  DEFAULT_TANGLE_PARAMS,
  generateContainedPaths,
  segmentDistanceSquared,
  type Point3,
  type VoxelDomain,
} from "./path.ts";
import { generateWeavePatterns } from "./weavePatterns.ts";

function sphereDomain(size = 32, extent = 1): VoxelDomain {
  const inside = new Uint8Array(size ** 3);
  const distanceToSurface = new Uint8Array(size ** 3);
  const step = (extent * 2) / (size - 1);
  for (let z = 0; z < size; z++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const px = (x / (size - 1) - 0.5) * extent * 2;
        const py = (y / (size - 1) - 0.5) * extent * 2;
        const pz = (z / (size - 1) - 0.5) * extent * 2;
        const radius = Math.hypot(px, py, pz);
        const index = x + size * (y + size * z);
        if (radius <= 0.9) {
          inside[index] = 1;
          distanceToSurface[index] = Math.max(0, Math.min(255, Math.floor((0.9 - radius) / step)));
        }
      }
    }
  }
  return { size, extent, inside, distanceToSurface };
}

function voxelIndex(domain: VoxelDomain, point: Point3): number {
  const coordinate = (value: number) =>
    Math.round((value / (domain.extent * 2) + 0.5) * (domain.size - 1));
  const x = coordinate(point.x);
  const y = coordinate(point.y);
  const z = coordinate(point.z);
  return x + domain.size * (y + domain.size * z);
}

function assertSelfAvoiding(paths: Point3[][], minimumSpacing: number): void {
  for (const path of paths) {
    const segments = path.slice(0, -1).map((point, segmentIndex) => ({
      a: point,
      b: path[segmentIndex + 1],
      segmentIndex,
    }));
    for (let left = 0; left < segments.length; left++) {
      for (let right = left + 1; right < segments.length; right++) {
        if (Math.abs(left - right) <= 3) continue;
        const distance = Math.sqrt(
          segmentDistanceSquared(
            segments[left].a,
            segments[left].b,
            segments[right].a,
            segments[right].b,
          ),
        );
        assert.ok(
          distance >= minimumSpacing - 1e-8,
          `one path must keep its effective self-spacing (${distance} < ${minimumSpacing})`,
        );
      }
    }
  }
}

const params = {
  ...DEFAULT_TANGLE_PARAMS,
  seed: 729,
  pathCount: 8,
  spacing: 0.12,
  boundaryFreedom: 0,
};
const domain = sphereDomain();
const first = generateContainedPaths(params, domain);
const second = generateContainedPaths(params, domain);

assert.deepEqual(first, second, "same domain + params must reproduce exactly");
assert.ok(first.paths.length >= 2, "fixture should grow multiple paths");

for (const path of first.paths) {
  for (const point of path) {
    assert.equal(domain.inside[voxelIndex(domain, point)], 1, "every generated point must remain inside");
  }
}

const segments: Array<{ a: Point3; b: Point3; pathIndex: number; segmentIndex: number }> = [];
first.paths.forEach((path, pathIndex) => {
  for (let segmentIndex = 0; segmentIndex + 1 < path.length; segmentIndex++) {
    segments.push({ a: path[segmentIndex], b: path[segmentIndex + 1], pathIndex, segmentIndex });
  }
});
for (let left = 0; left < segments.length; left++) {
  for (let right = left + 1; right < segments.length; right++) {
    const a = segments[left];
    const b = segments[right];
    if (a.pathIndex !== b.pathIndex) continue;
    if (Math.abs(a.segmentIndex - b.segmentIndex) <= 3) continue;
    const distance = Math.sqrt(segmentDistanceSquared(a.a, a.b, b.a, b.b));
    assert.ok(
      distance >= params.spacing - 1e-8,
      `non-adjacent segments of one path must keep spacing (${distance} < ${params.spacing})`,
    );
  }
}

assert.ok(first.stats.coverage > 0, "coverage must be measured");
assert.ok(first.stats.reachCoverage > 0, "centerline reach must be measured");
assert.ok(first.stats.rejectedSelfIntersection > 0, "fixture must exercise self-intersection rejection");

let closestCrossPathDistance = Infinity;
for (let left = 0; left < segments.length; left++) {
  for (let right = left + 1; right < segments.length; right++) {
    const a = segments[left];
    const b = segments[right];
    if (a.pathIndex === b.pathIndex) continue;
    closestCrossPathDistance = Math.min(
      closestCrossPathDistance,
      Math.sqrt(segmentDistanceSquared(a.a, a.b, b.a, b.b)),
    );
  }
}
assert.ok(
  closestCrossPathDistance < params.spacing,
  "different paths must be allowed to approach or cross inside the self-spacing distance",
);

const looseBoundary = generateContainedPaths(
  { ...params, boundaryFreedom: 1 },
  domain,
);
assert.ok(
  looseBoundary.stats.outsidePoints > 0,
  "a fully loose boundary must allow trajectories to cross outside the host",
);

const shortSingle = generateContainedPaths(
  { ...params, pathCount: 1, pathLength: 2 },
  domain,
);
const longSingle = generateContainedPaths(
  { ...params, pathCount: 1, pathLength: 16 },
  domain,
);
assert.ok(
  longSingle.stats.totalLength > shortSingle.stats.totalLength,
  `a longer single-path target must permit a longer trajectory ` +
    `(${shortSingle.stats.totalLength.toFixed(2)} vs ${longSingle.stats.totalLength.toFixed(2)})`,
);
assert.ok(
  longSingle.stats.totalLength <= longSingle.stats.targetLength + 0.1,
  "the generated line must not materially exceed its target length",
);

const thinSingle = generateContainedPaths(
  { ...params, pathCount: 1, pathLength: 16, spacing: 0.015, tubeRadius: 0.01 },
  domain,
);
const thickSingle = generateContainedPaths(
  { ...params, pathCount: 1, pathLength: 16, spacing: 0.015, tubeRadius: 0.05 },
  domain,
);
assert.ok(Math.abs(thinSingle.stats.effectiveSelfSpacing - 0.021) < 1e-9);
assert.ok(Math.abs(thickSingle.stats.effectiveSelfSpacing - 0.105) < 1e-9);
assert.ok(
  thinSingle.stats.totalLength >= thickSingle.stats.totalLength,
  "a thinner tube must not shorten the available self-avoiding route in the sphere fixture",
);
assertSelfAvoiding(thinSingle.paths, thinSingle.stats.effectiveSelfSpacing);

const legacySingle = generateContainedPaths(
  { ...params, pathCount: 1, pathLength: 24, spacing: 0.015, tubeRadius: 0.025, fillPriority: 0 },
  domain,
);
const plannedSingle = generateContainedPaths(
  { ...params, pathCount: 1, pathLength: 24, spacing: 0.015, tubeRadius: 0.025, fillPriority: 1 },
  domain,
);
assert.ok(
  plannedSingle.stats.totalLength >= legacySingle.stats.totalLength,
  "two-ended coverage planning must not shorten the best route in the sphere fixture",
);
assert.ok(
  plannedSingle.stats.reachCoverage >= legacySingle.stats.reachCoverage,
  "coverage planning must not reduce centerline reach in the sphere fixture",
);
assertSelfAvoiding(plannedSingle.paths, plannedSingle.stats.effectiveSelfSpacing);

const weavePatterns = generateWeavePatterns(domain, plannedSingle.paths, 24);
assert.deepEqual(
  weavePatterns.map((pattern) => pattern.id),
  ["organic", "loop-knit", "tubular-braid", "hierarchical"],
  "comparison must preserve the four named weaving rules",
);
for (const pattern of weavePatterns) {
  assert.ok(pattern.paths.length > 0, `${pattern.id} must produce visible paths`);
  assert.ok(
    Math.abs(pattern.totalLength - 24) < 0.05,
    `${pattern.id} must use the shared material length (${pattern.totalLength})`,
  );
}
assert.equal(weavePatterns[0].paths.length, 1, "organic comparison must preserve one continuous line");
assert.equal(weavePatterns[1].paths.length, 1, "loop knit must preserve one continuous line");
assert.equal(weavePatterns[2].paths.length, 6, "tubular braid must expose its six strands");

console.log(
  `ok - contained paths deterministic, inside, self-avoiding, and mutually crossing ` +
    `(${first.paths.length} paths, ${first.stats.points} points, ${Math.round(first.stats.coverage * 100)}% coverage; ` +
    `${looseBoundary.stats.outsidePoints} outside points when loose; ` +
    `single path ${shortSingle.stats.totalLength.toFixed(1)} → ${longSingle.stats.totalLength.toFixed(1)})`,
);
