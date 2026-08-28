import type { OverhangAssignmentEntry } from "./overhangSupportPolicy.ts";
import type { InternalStructureGraph } from "./voronoi.ts";

/**
 * Katachi-native FDM support forest.
 *
 * Behavioural references only:
 * - PrusaSlicer SLA branching supports (tree topology; AGPL code not copied)
 * - meshy tree supports (binary joins, downstream-length widening and fine tips;
 *   MIT code not copied)
 *
 * This implementation is independent, deterministic TypeScript operating on
 * millimetre-space Support Paint output.
 */

export type SupportForestMode = "vertical" | "branching";
export type SupportLeafKind = "outside" | "cradle";
export type SupportMemberKind = "tip" | "branch" | "trunk" | "brace" | "raft" | "retained-vertical";

export interface SupportLeaf {
  id: string;
  xMm: number;
  yMm: number;
  zMm: number;
  kind: SupportLeafKind;
}

export interface SupportForestOptions {
  mode: SupportForestMode;
  plateZMm: number;
  objectLiftMm: number;
  tipRadiusMm: number;
  trunkMinimumRadiusMm: number;
  loadWidening: number;
  maximumUnsupportedLengthMm: number;
  branchAngleDeg: number;
  footRadiusMm: number;
  raftRadiusMm: number;
}

export interface SupportMember {
  id: string;
  kind: SupportMemberKind;
  start: { xMm: number; yMm: number; zMm: number };
  end: { xMm: number; yMm: number; zMm: number };
  startRadiusMm: number;
  endRadiusMm: number;
  downstreamLengthMm: number;
  leafCount: number;
}

export interface SupportJunction {
  id: string;
  xMm: number;
  yMm: number;
  zMm: number;
  radiusMm: number;
  leafCount: number;
}

export interface SupportForest {
  leaves: SupportLeaf[];
  members: SupportMember[];
  junctions: SupportJunction[];
  roots: SupportJunction[];
  stats: {
    leafCount: number;
    cradleLeafCount: number;
    branchCount: number;
    trunkCount: number;
    braceCount: number;
    raftCount: number;
    rootCount: number;
    maximumMemberLengthMm: number;
    maximumBranchAngleDeg: number;
    unsupportedLengthViolationCount: number;
  };
}

interface ActiveBranch {
  id: string;
  point: { xMm: number; yMm: number; zMm: number };
  radiusMm: number;
  downstreamLengthMm: number;
  leafCount: number;
}

const EPSILON = 1e-6;

function distance(a: { xMm: number; yMm: number; zMm: number }, b: { xMm: number; yMm: number; zMm: number }): number {
  return Math.hypot(a.xMm - b.xMm, a.yMm - b.yMm, a.zMm - b.zMm);
}

function horizontalDistance(a: { xMm: number; yMm: number }, b: { xMm: number; yMm: number }): number {
  return Math.hypot(a.xMm - b.xMm, a.yMm - b.yMm);
}

function branchAngleDeg(member: Pick<SupportMember, "start" | "end">): number {
  const horizontal = horizontalDistance(member.start, member.end);
  const vertical = Math.abs(member.end.zMm - member.start.zMm);
  return Math.atan2(horizontal, Math.max(vertical, EPSILON)) * 180 / Math.PI;
}

function validateOptions(options: SupportForestOptions): SupportForestOptions {
  const finite = Object.values(options).every((value) => typeof value === "string" || Number.isFinite(value));
  if (!finite || options.objectLiftMm < 0 || options.objectLiftMm > 3 || options.tipRadiusMm <= 0
    || options.trunkMinimumRadiusMm < options.tipRadiusMm || options.loadWidening < 0
    || options.maximumUnsupportedLengthMm <= 0 || options.branchAngleDeg <= 0 || options.branchAngleDeg > 50
    || options.footRadiusMm < options.trunkMinimumRadiusMm || options.raftRadiusMm <= 0) {
    throw new Error("Support forest options are invalid");
  }
  return { ...options };
}

function widenedRadius(options: SupportForestOptions, downstreamLengthMm: number): number {
  return options.trunkMinimumRadiusMm + options.loadWidening * Math.sqrt(Math.max(0, downstreamLengthMm));
}

function supportFloorZ(options: SupportForestOptions): number {
  // The plate foot is a flattened pad centred slightly above the plate, not
  // a full sphere whose complete radius must sit below every first branch.
  return options.plateZMm + options.footRadiusMm * 0.45;
}

function member(
  id: string,
  kind: SupportMemberKind,
  start: SupportMember["start"],
  end: SupportMember["end"],
  startRadiusMm: number,
  endRadiusMm: number,
  downstreamLengthMm: number,
  leafCount: number,
): SupportMember {
  return { id, kind, start: { ...start }, end: { ...end }, startRadiusMm, endRadiusMm, downstreamLengthMm, leafCount };
}

function splitLongMember(input: SupportMember, maximumLengthMm: number): SupportMember[] {
  const length = distance(input.start, input.end);
  const pieces = Math.max(1, Math.ceil(length / maximumLengthMm));
  return Array.from({ length: pieces }, (_, index) => {
    const from = index / pieces;
    const to = (index + 1) / pieces;
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    return member(
      pieces === 1 ? input.id : input.id + ":" + index,
      input.kind,
      {
        xMm: lerp(input.start.xMm, input.end.xMm, from),
        yMm: lerp(input.start.yMm, input.end.yMm, from),
        zMm: lerp(input.start.zMm, input.end.zMm, from),
      },
      {
        xMm: lerp(input.start.xMm, input.end.xMm, to),
        yMm: lerp(input.start.yMm, input.end.yMm, to),
        zMm: lerp(input.start.zMm, input.end.zMm, to),
      },
      lerp(input.startRadiusMm, input.endRadiusMm, from),
      lerp(input.startRadiusMm, input.endRadiusMm, to),
      input.downstreamLengthMm,
      input.leafCount,
    );
  });
}

function mergeFitsAngle(a: ActiveBranch, b: ActiveBranch, options: SupportForestOptions): boolean {
  const totalLeaves = a.leafCount + b.leafCount;
  const weightedX = (a.point.xMm * a.leafCount + b.point.xMm * b.leafCount) / totalLeaves;
  const weightedY = (a.point.yMm * a.leafCount + b.point.yMm * b.leafCount) / totalLeaves;
  const horizontal = Math.max(
    Math.hypot(a.point.xMm - weightedX, a.point.yMm - weightedY),
    Math.hypot(b.point.xMm - weightedX, b.point.yMm - weightedY),
  );
  const requiredDrop = horizontal / Math.tan(options.branchAngleDeg * Math.PI / 180);
  return Math.min(a.point.zMm, b.point.zMm) - supportFloorZ(options) >= requiredDrop - EPSILON;
}

function nearbyPairs(active: ActiveBranch[], maximumHorizontalMm: number, options: SupportForestOptions): {
  pairs: Array<[ActiveBranch, ActiveBranch]>;
  unpaired: ActiveBranch[];
} {
  const cellSize = Math.max(maximumHorizontalMm, EPSILON);
  const key = (x: number, y: number) => x + ":" + y;
  const buckets = new Map<string, number[]>();
  for (const [index, branch] of active.entries()) {
    const x = Math.floor(branch.point.xMm / cellSize);
    const y = Math.floor(branch.point.yMm / cellSize);
    const bucketKey = key(x, y);
    const bucket = buckets.get(bucketKey);
    if (bucket) bucket.push(index); else buckets.set(bucketKey, [index]);
  }
  const used = new Set<number>();
  const pairs: Array<[ActiveBranch, ActiveBranch]> = [];
  for (let index = 0; index < active.length; index++) {
    if (used.has(index)) continue;
    const branch = active[index];
    const cellX = Math.floor(branch.point.xMm / cellSize);
    const cellY = Math.floor(branch.point.yMm / cellSize);
    let best = -1;
    let bestDistance = Infinity;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      for (const candidate of buckets.get(key(cellX + dx, cellY + dy)) ?? []) {
        if (candidate === index || used.has(candidate)) continue;
        const d = horizontalDistance(branch.point, active[candidate].point);
        if (d <= maximumHorizontalMm + EPSILON && mergeFitsAngle(branch, active[candidate], options) && (d < bestDistance - EPSILON
          || (Math.abs(d - bestDistance) <= EPSILON && active[candidate].id < (best >= 0 ? active[best].id : "~")))) {
          best = candidate;
          bestDistance = d;
        }
      }
    }
    if (best >= 0) {
      used.add(index);
      used.add(best);
      pairs.push([branch, active[best]]);
    }
  }
  return { pairs, unpaired: active.filter((_, index) => !used.has(index)) };
}

function mergePair(
  a: ActiveBranch,
  b: ActiveBranch,
  stage: number,
  options: SupportForestOptions,
  members: SupportMember[],
  junctions: SupportJunction[],
): ActiveBranch {
  const totalLeaves = a.leafCount + b.leafCount;
  const weightedX = (a.point.xMm * a.leafCount + b.point.xMm * b.leafCount) / totalLeaves;
  const weightedY = (a.point.yMm * a.leafCount + b.point.yMm * b.leafCount) / totalLeaves;
  const horizontal = Math.max(
    Math.hypot(a.point.xMm - weightedX, a.point.yMm - weightedY),
    Math.hypot(b.point.xMm - weightedX, b.point.yMm - weightedY),
  );
  const angleRadians = options.branchAngleDeg * Math.PI / 180;
  const requiredDrop = horizontal / Math.tan(angleRadians);
  const stageDrop = Math.max(2, options.maximumUnsupportedLengthMm * 0.72, requiredDrop);
  const parentZ = Math.max(supportFloorZ(options), Math.min(a.point.zMm, b.point.zMm) - stageDrop);
  const point = { xMm: weightedX, yMm: weightedY, zMm: parentZ };
  const lenA = distance(point, a.point);
  const lenB = distance(point, b.point);
  const downstreamLengthMm = a.downstreamLengthMm + b.downstreamLengthMm + lenA + lenB;
  const radiusMm = widenedRadius(options, downstreamLengthMm);
  members.push(...splitLongMember(
    member("branch:" + stage + ":" + a.id, "branch", point, a.point, radiusMm, a.radiusMm, downstreamLengthMm, a.leafCount),
    options.maximumUnsupportedLengthMm,
  ));
  members.push(...splitLongMember(
    member("branch:" + stage + ":" + b.id, "branch", point, b.point, radiusMm, b.radiusMm, downstreamLengthMm, b.leafCount),
    options.maximumUnsupportedLengthMm,
  ));
  const id = "junction:" + stage + ":" + a.id + "+" + b.id;
  junctions.push({ id, ...point, radiusMm: radiusMm * 1.15, leafCount: totalLeaves });
  return { id, point, radiusMm, downstreamLengthMm, leafCount: totalLeaves };
}

function descendOne(
  branch: ActiveBranch,
  stage: number,
  options: SupportForestOptions,
  members: SupportMember[],
): ActiveBranch {
  const nextZ = Math.max(supportFloorZ(options), branch.point.zMm - options.maximumUnsupportedLengthMm);
  if (nextZ >= branch.point.zMm - EPSILON) return branch;
  const point = { xMm: branch.point.xMm, yMm: branch.point.yMm, zMm: nextZ };
  const lengthMm = branch.point.zMm - nextZ;
  const downstreamLengthMm = branch.downstreamLengthMm + lengthMm;
  const radiusMm = widenedRadius(options, downstreamLengthMm);
  members.push(member("trunk:" + stage + ":" + branch.id, "trunk", point, branch.point, radiusMm, branch.radiusMm, downstreamLengthMm, branch.leafCount));
  return { ...branch, id: "trunk:" + stage + ":" + branch.id, point, radiusMm, downstreamLengthMm };
}

function addSharedRaft(
  roots: ActiveBranch[],
  options: SupportForestOptions,
  members: SupportMember[],
  junctions: SupportJunction[],
  connectRoots: boolean,
): SupportJunction[] {
  const rootJunctions: SupportJunction[] = [];
  for (const [index, root] of roots.entries()) {
    const foot = { xMm: root.point.xMm, yMm: root.point.yMm, zMm: supportFloorZ(options) };
    const downstreamLengthMm = root.downstreamLengthMm + distance(foot, root.point);
    const radiusMm = widenedRadius(options, downstreamLengthMm);
    members.push(...splitLongMember(
      member("foot:" + index, "trunk", foot, root.point, Math.max(options.footRadiusMm, radiusMm), root.radiusMm, downstreamLengthMm, root.leafCount),
      options.maximumUnsupportedLengthMm,
    ));
    const junction = { id: "foot:" + index, ...foot, radiusMm: options.footRadiusMm, leafCount: root.leafCount };
    junctions.push(junction);
    rootJunctions.push(junction);
  }
  if (!connectRoots) return rootJunctions;
  // A plate-supported row network is deterministic and linearithmic. The
  // earlier exact all-pairs MST became cubic when a real Case A left many
  // legitimate roots near the plate, blocking the authoring viewport.
  const rowSize = Math.max(options.maximumUnsupportedLengthMm, options.footRadiusMm * 4);
  const rows = new Map<number, Array<{ index: number; node: SupportJunction }>>();
  rootJunctions.forEach((node, index) => {
    const row = Math.round(node.yMm / rowSize);
    const bucket = rows.get(row);
    const item = { index, node };
    if (bucket) bucket.push(item); else rows.set(row, [item]);
  });
  const rowAnchors: Array<{ index: number; node: SupportJunction }> = [];
  const connect = (a: { index: number; node: SupportJunction }, b: { index: number; node: SupportJunction }) => {
    const length = horizontalDistance(a.node, b.node);
    members.push(member(
      "raft:" + a.index + ":" + b.index, "raft", a.node, b.node,
      options.raftRadiusMm, options.raftRadiusMm, length, a.node.leafCount + b.node.leafCount,
    ));
  };
  for (const [, row] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    row.sort((a, b) => a.node.xMm - b.node.xMm || a.index - b.index);
    for (let index = 1; index < row.length; index++) connect(row[index - 1], row[index]);
    if (row.length > 0) rowAnchors.push(row[Math.floor(row.length / 2)]);
  }
  for (let index = 1; index < rowAnchors.length; index++) connect(rowAnchors[index - 1], rowAnchors[index]);
  return rootJunctions;
}

export function buildSupportForest(rawLeaves: readonly SupportLeaf[], rawOptions: SupportForestOptions): SupportForest {
  const options = validateOptions(rawOptions);
  const leaves = rawLeaves
    .filter((leaf) => [leaf.xMm, leaf.yMm, leaf.zMm].every(Number.isFinite))
    .map((leaf) => ({ ...leaf, zMm: leaf.zMm + options.objectLiftMm }))
    .sort((a, b) => a.zMm - b.zMm || a.xMm - b.xMm || a.yMm - b.yMm || a.id.localeCompare(b.id));
  const members: SupportMember[] = [];
  const junctions: SupportJunction[] = [];
  let active: ActiveBranch[] = leaves.map((leaf) => {
    const point = { xMm: leaf.xMm, yMm: leaf.yMm, zMm: leaf.zMm };
    const below = { ...point, zMm: Math.min(point.zMm, Math.max(supportFloorZ(options), point.zMm - Math.min(2.4, options.maximumUnsupportedLengthMm * 0.35))) };
    const downstreamLengthMm = distance(below, point);
    const radiusMm = widenedRadius(options, downstreamLengthMm);
    // Keep the whole short BODY-contact neck fine. The load-bearing branch
    // begins at `below` with its widened radius, so only this removable neck
    // owns the tip dimension.
    members.push(member("tip:" + leaf.id, "tip", below, point, options.tipRadiusMm, options.tipRadiusMm, downstreamLengthMm, 1));
    return { id: leaf.id, point: below, radiusMm, downstreamLengthMm, leafCount: 1 };
  });

  if (options.mode === "vertical") {
    active = active.map((branch, index) => {
      const point = { xMm: branch.point.xMm, yMm: branch.point.yMm, zMm: supportFloorZ(options) };
      const lengthMm = distance(point, branch.point);
      const radiusMm = widenedRadius(options, branch.downstreamLengthMm + lengthMm);
      members.push(member(
        "vertical:" + index, "trunk", point, branch.point,
        radiusMm, branch.radiusMm, branch.downstreamLengthMm + lengthMm, 1,
      ));
      return { ...branch, id: "vertical-root:" + index, point, radiusMm, downstreamLengthMm: branch.downstreamLengthMm + lengthMm };
    });
  } else {
    let stage = 0;
    while (active.some((branch) => branch.point.zMm > supportFloorZ(options) + EPSILON)) {
      const next: ActiveBranch[] = [];
      const verticalDrop = options.maximumUnsupportedLengthMm * 0.72;
      const maximumHorizontal = verticalDrop * Math.tan(options.branchAngleDeg * Math.PI / 180) * 2;
      const pairing = nearbyPairs(active, maximumHorizontal, options);
      for (const [a, b] of pairing.pairs) next.push(mergePair(a, b, stage, options, members, junctions));
      for (const branch of pairing.unpaired) next.push(descendOne(branch, stage, options, members));
      active = next;
      stage++;
      if (stage > 10_000) throw new Error("Support forest did not converge");
    }

    if (active.length === 1 && leaves.length === 1) {
      const root = active[0];
      const spread = Math.max(options.footRadiusMm * 2.5, options.maximumUnsupportedLengthMm * 0.2);
      const footZ = supportFloorZ(options);
      const halfSpread = spread * 0.5;
      const braceHeight = halfSpread / Math.tan(options.branchAngleDeg * Math.PI / 180);
      // Join the bipod to the already-generated vertical trunk high enough
      // for both diagonals to remain inside the selected FDM angle. Joining
      // at the final low root would create a steep, non-self-supporting V.
      const bracePoint = {
        xMm: root.point.xMm,
        yMm: root.point.yMm,
        zMm: footZ + braceHeight,
      };
      const feet = [-1, 1].map((sign) => ({ xMm: root.point.xMm + sign * spread * 0.5, yMm: root.point.yMm, zMm: footZ }));
      for (const [index, foot] of feet.entries()) {
        members.push(...splitLongMember(
          member("single-bipod:" + index, "brace", foot, bracePoint, options.footRadiusMm, root.radiusMm, root.downstreamLengthMm, 1),
          options.maximumUnsupportedLengthMm,
        ));
        junctions.push({ id: "single-foot:" + index, ...foot, radiusMm: options.footRadiusMm, leafCount: 1 });
      }
      junctions.push({ id: "single-brace-junction", ...bracePoint, radiusMm: root.radiusMm * 1.15, leafCount: 1 });
      members.push(member("single-raft", "raft", feet[0], feet[1], options.raftRadiusMm, options.raftRadiusMm, spread, 1));
      active = [];
    }
  }

  const roots = addSharedRaft(active, options, members, junctions, options.mode === "branching");
  const structural = members.filter((item) => item.kind !== "raft");
  return {
    leaves,
    members,
    junctions,
    roots,
    stats: {
      leafCount: leaves.length,
      cradleLeafCount: leaves.filter((leaf) => leaf.kind === "cradle").length,
      branchCount: members.filter((item) => item.kind === "branch").length,
      trunkCount: members.filter((item) => item.kind === "trunk").length,
      braceCount: members.filter((item) => item.kind === "brace").length,
      raftCount: members.filter((item) => item.kind === "raft").length,
      rootCount: roots.length || junctions.filter((item) => item.id.startsWith("single-foot:")).length,
      maximumMemberLengthMm: structural.reduce((max, item) => Math.max(max, distance(item.start, item.end)), 0),
      maximumBranchAngleDeg: structural.reduce((max, item) => Math.max(max, branchAngleDeg(item)), 0),
      unsupportedLengthViolationCount: structural.filter((item) => distance(item.start, item.end) > options.maximumUnsupportedLengthMm + 1e-5).length,
    },
  };
}

export function outsideLeavesFromAssignments(entries: readonly OverhangAssignmentEntry[]): SupportLeaf[] {
  return entries.flatMap((entry): SupportLeaf[] => entry.classification === "outside" && !entry.duplicateOf && entry.positionMm
    ? [{ id: entry.id, ...entry.positionMm, kind: "outside" }]
    : []);
}

export interface SupportForestPreviewLeafSelection {
  leaves: SupportLeaf[];
  eligibleOutsideLeafCount: number;
  limited: boolean;
}

/**
 * Selects a bounded, deterministic display sample without changing the exact
 * assignment ledger. The first pass counts eligible leaves; the second pass
 * samples stable ordinals without materialising the full leaf array.
 */
export function selectSupportForestPreviewLeaves(
  entries: readonly OverhangAssignmentEntry[],
  maximumLeaves = 2_000,
): SupportForestPreviewLeafSelection {
  if (!Number.isSafeInteger(maximumLeaves) || maximumLeaves < 1) {
    throw new Error("Support forest preview leaf limit is invalid");
  }
  const eligible = (entry: OverhangAssignmentEntry) =>
    entry.classification === "outside" && !entry.duplicateOf && Boolean(entry.positionMm);
  let eligibleOutsideLeafCount = 0;
  for (const entry of entries) if (eligible(entry)) eligibleOutsideLeafCount++;

  const targetCount = Math.min(maximumLeaves, eligibleOutsideLeafCount);
  const leaves: SupportLeaf[] = [];
  if (targetCount === 0) return { leaves, eligibleOutsideLeafCount, limited: false };

  let eligibleOrdinal = 0;
  let nextSelectedOrdinal = 0;
  for (const entry of entries) {
    if (!eligible(entry)) continue;
    if (eligibleOrdinal === nextSelectedOrdinal && leaves.length < targetCount) {
      const position = entry.positionMm!;
      leaves.push({ id: entry.id, ...position, kind: "outside" });
      const nextSelectionIndex = leaves.length;
      if (nextSelectionIndex < targetCount) {
        nextSelectedOrdinal = targetCount === 1
          ? 0
          : Math.round(nextSelectionIndex * (eligibleOutsideLeafCount - 1) / (targetCount - 1));
      }
    }
    eligibleOrdinal++;
  }
  return {
    leaves,
    eligibleOutsideLeafCount,
    limited: eligibleOutsideLeafCount > targetCount,
  };
}

export function uniformLowestSurfaceLeaves(
  positionsMm: Float32Array,
  spacingMm: number,
  bandMm = 1,
): SupportLeaf[] {
  if (positionsMm.length % 9 !== 0 || !(spacingMm > 0) || !(bandMm >= 0)) throw new Error("Lowest-surface support input is invalid");
  let minimumZ = Infinity;
  for (let offset = 2; offset < positionsMm.length; offset += 3) minimumZ = Math.min(minimumZ, positionsMm[offset]);
  const cells = new Map<string, SupportLeaf>();
  for (let offset = 0; offset < positionsMm.length; offset += 9) {
    const xMm = (positionsMm[offset] + positionsMm[offset + 3] + positionsMm[offset + 6]) / 3;
    const yMm = (positionsMm[offset + 1] + positionsMm[offset + 4] + positionsMm[offset + 7]) / 3;
    const zMm = (positionsMm[offset + 2] + positionsMm[offset + 5] + positionsMm[offset + 8]) / 3;
    if (zMm > minimumZ + bandMm) continue;
    const key = Math.round(xMm / spacingMm) + ":" + Math.round(yMm / spacingMm);
    const previous = cells.get(key);
    if (!previous || zMm < previous.zMm) cells.set(key, { id: "cradle:" + key, xMm, yMm, zMm, kind: "cradle" });
  }
  return [...cells.values()].sort((a, b) => a.xMm - b.xMm || a.yMm - b.yMm);
}

export function retainedVerticalMembers(
  entries: readonly OverhangAssignmentEntry[],
  radiusMm: number,
  spacingMm = 2,
): SupportMember[] {
  const selected = new Map<string, OverhangAssignmentEntry>();
  for (const entry of entries) {
    if (entry.classification !== "inside" || !entry.positionMm || !entry.nearestLowerSurfaceDistanceMm || entry.nearestLowerSurfaceDistanceMm <= 0) continue;
    const key = Math.round(entry.positionMm.xMm / spacingMm) + ":" + Math.round(entry.positionMm.yMm / spacingMm);
    const previous = selected.get(key);
    if (!previous || (entry.nearestLowerSurfaceDistanceMm ?? 0) > (previous.nearestLowerSurfaceDistanceMm ?? 0)) selected.set(key, entry);
  }
  return [...selected.values()].map((entry, index) => {
    const top = entry.positionMm!;
    const bottom = { ...top, zMm: top.zMm - entry.nearestLowerSurfaceDistanceMm! };
    return member("retained:" + index, "retained-vertical", bottom, top, radiusMm, radiusMm, entry.nearestLowerSurfaceDistanceMm!, 1);
  });
}

export function reinforceDryWebGraph(
  graph: InternalStructureGraph | null,
  scaleMmPerUnit: number,
  minimumDiameterMm: number,
  maximumUnreinforcedLengthMm: number,
): InternalStructureGraph | null {
  if (!graph || graph.edges.length === 0) return graph;
  if (!(scaleMmPerUnit > 0) || !(minimumDiameterMm > 0) || !(maximumUnreinforcedLengthMm > 0)) throw new Error("Dry Web reinforcement options are invalid");
  const nodes = graph.nodes.map((node) => ({ ...node, position: { ...node.position } }));
  const edges: InternalStructureGraph["edges"] = [];
  const minimumRadius = minimumDiameterMm * 0.5 / scaleMmPerUnit;
  for (const source of graph.edges) {
    const start = nodes[source.start];
    const end = nodes[source.end];
    if (!start || !end) continue;
    const lengthMm = Math.hypot(
      start.position.x - end.position.x,
      start.position.y - end.position.y,
      start.position.z - end.position.z,
    ) * scaleMmPerUnit;
    const pieces = Math.max(1, Math.ceil(lengthMm / maximumUnreinforcedLengthMm));
    const step = Math.max(0, pieces - 1);
    const radius = Math.max(source.radius, minimumRadius) * (1 + step * 0.2);
    let previous = source.start;
    for (let piece = 1; piece < pieces; piece++) {
      const t = piece / pieces;
      const id = nodes.length;
      nodes.push({
        id,
        position: {
          x: start.position.x + (end.position.x - start.position.x) * t,
          y: start.position.y + (end.position.y - start.position.y) * t,
          z: start.position.z + (end.position.z - start.position.z) * t,
        },
        radius: radius * 1.25,
      });
      edges.push({ id: edges.length, start: previous, end: id, radius });
      previous = id;
    }
    edges.push({ id: edges.length, start: previous, end: source.end, radius });
  }
  const incidentRadius = new Array(nodes.length).fill(minimumRadius);
  for (const edge of edges) {
    incidentRadius[edge.start] = Math.max(incidentRadius[edge.start], edge.radius);
    incidentRadius[edge.end] = Math.max(incidentRadius[edge.end], edge.radius);
  }
  nodes.forEach((node, index) => { node.radius = Math.max(node.radius, incidentRadius[index] * 1.25); });
  return { ...graph, nodes, edges, stats: { ...graph.stats, gridNodeCount: nodes.length, gridEdgeCount: edges.length } };
}
