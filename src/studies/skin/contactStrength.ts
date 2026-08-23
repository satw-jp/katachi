import type { ContactReinforcementMode, Patch, PatchPoint } from "./field.ts";

const TOUCH_EPS = 1e-5;

export interface PatchContactRow {
  id: number;
  partners: number[];
  count: number;
}

export interface ContactReport {
  rows: PatchContactRow[];
  edgeCount: number;
  componentCount: number;
  weakCount: number;
  counts: { zero: number; one: number; two: number; threeOrMore: number };
}

export interface ContactReinforcementOptions {
  target: number;
  maxGrowth: number;
  overlap: number;
  mode?: ContactReinforcementMode;
  wholeScaleMax?: number;
}

export interface ContactReinforcementResult {
  patches: Patch[];
  before: ContactReport;
  after: ContactReport;
  adjustedPointCount: number;
  adjustedPatchCount: number;
  addedEdges: number;
  maxAddition: number;
  unresolvedIds: number[];
  mode: ContactReinforcementMode;
}

interface PatchBound {
  cx: number;
  cy: number;
  cz: number;
  extent: number;
}

interface ClosestPair {
  ai: number;
  bi: number;
  clearance: number;
}

function distance(a: PatchPoint, b: PatchPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function boundOf(patch: Patch): PatchBound {
  if (patch.points.length === 0) return { cx: 0, cy: 0, cz: 0, extent: 0 };
  const inv = 1 / patch.points.length;
  const cx = patch.points.reduce((sum, p) => sum + p.x, 0) * inv;
  const cy = patch.points.reduce((sum, p) => sum + p.y, 0) * inv;
  const cz = patch.points.reduce((sum, p) => sum + p.z, 0) * inv;
  let extent = 0;
  for (const p of patch.points) {
    extent = Math.max(extent, Math.hypot(p.x - cx, p.y - cy, p.z - cz) + p.r);
  }
  return { cx, cy, cz, extent };
}

function boundsCouldMeet(a: PatchBound, b: PatchBound, reach: number): boolean {
  return Math.hypot(a.cx - b.cx, a.cy - b.cy, a.cz - b.cz) <= a.extent + b.extent + reach + TOUCH_EPS;
}

function closestPair(a: Patch, b: Patch): ClosestPair | null {
  let best: ClosestPair | null = null;
  for (let ai = 0; ai < a.points.length; ai++) {
    for (let bi = 0; bi < b.points.length; bi++) {
      const clearance = distance(a.points[ai], b.points[bi]) - a.points[ai].r - b.points[bi].r;
      if (!best || clearance < best.clearance) best = { ai, bi, clearance };
    }
  }
  return best;
}

function editableMotifPoint(point: PatchPoint): boolean {
  return point.role !== "bridge" && point.role !== "surfaceConnector";
}

function currentWholeScale(patch: Patch): number {
  return patch.points.reduce(
    (maximum, point) => editableMotifPoint(point) ? Math.max(maximum, point.contactScale ?? 0) : maximum,
    0,
  );
}

/** Scale a realized motif as one object. Relational bridge/connector points
 * stay fixed because they belong to a separate authored connection system. */
function scaleWholeMotifTo(patch: Patch, requestedScale: number): Patch {
  const editable = patch.points.filter(editableMotifPoint);
  if (editable.length === 0) return { ...patch, points: patch.points.map((point) => ({ ...point })) };
  const current = currentWholeScale(patch);
  const target = Math.max(current, requestedScale);
  const factor = (1 + target) / (1 + current);
  if (factor <= 1 + TOUCH_EPS) return { ...patch, points: patch.points.map((point) => ({ ...point })) };
  const inv = 1 / editable.length;
  const center = editable.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y, z: sum.z + point.z }),
    { x: 0, y: 0, z: 0 },
  );
  center.x *= inv; center.y *= inv; center.z *= inv;
  return {
    ...patch,
    points: patch.points.map((point) => {
      if (!editableMotifPoint(point)) return { ...point };
      return {
        ...point,
        x: center.x + (point.x - center.x) * factor,
        y: center.y + (point.y - center.y) * factor,
        z: center.z + (point.z - center.z) * factor,
        r: point.r * factor,
        contactScale: target,
      };
    }),
  };
}

class Components {
  private readonly parent: number[];
  constructor(size: number) { this.parent = Array.from({ length: size }, (_, i) => i); }
  find(i: number): number {
    let root = i;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[i] !== i) { const next = this.parent[i]; this.parent[i] = root; i = next; }
    return root;
  }
  union(a: number, b: number): void {
    const ar = this.find(a); const br = this.find(b);
    if (ar !== br) this.parent[br] = ar;
  }
  count(): number { return new Set(this.parent.map((_, i) => this.find(i))).size; }
}

/** Counts distinct neighbouring patches whose realized sphere sets touch.
 * This is a deterministic geometric proxy. It is not FEA, a slicer result,
 * a final-mesh connectivity test, or a print-strength guarantee. */
export function analyzePatchContacts(patches: Patch[], target = 3): ContactReport {
  const partners = patches.map(() => new Set<number>());
  const bounds = patches.map(boundOf);
  const components = new Components(patches.length);
  let edgeCount = 0;
  for (let i = 0; i < patches.length; i++) {
    for (let j = i + 1; j < patches.length; j++) {
      if (!boundsCouldMeet(bounds[i], bounds[j], 0)) continue;
      const closest = closestPair(patches[i], patches[j]);
      if (!closest || closest.clearance > TOUCH_EPS) continue;
      partners[i].add(patches[j].id);
      partners[j].add(patches[i].id);
      components.union(i, j);
      edgeCount++;
    }
  }
  const rows = patches.map((patch, i) => ({
    id: patch.id,
    partners: [...partners[i]].sort((a, b) => a - b),
    count: partners[i].size,
  }));
  const counts = {
    zero: rows.filter((row) => row.count === 0).length,
    one: rows.filter((row) => row.count === 1).length,
    two: rows.filter((row) => row.count === 2).length,
    threeOrMore: rows.filter((row) => row.count >= 3).length,
  };
  return {
    rows,
    edgeCount,
    componentCount: patches.length === 0 ? 0 : components.count(),
    weakCount: rows.filter((row) => row.count < target).length,
    counts,
  };
}

/** Enlarges only the closest realized sphere pair for weak motifs. Existing
 * points are cloned; inputs are never changed. Each point has an absolute
 * growth cap, even if it participates in several new contacts. */
export function reinforceWeakPatchContacts(
  input: Patch[],
  options: ContactReinforcementOptions,
): ContactReinforcementResult {
  if (options.mode === "wholeMotif") return reinforceWholeMotifContacts(input, options);
  const target = Math.max(1, Math.min(6, Math.round(options.target)));
  const maxGrowth = Math.max(0, options.maxGrowth);
  const overlap = Math.max(0, options.overlap);
  const patches = input.map((patch) => ({ ...patch, points: patch.points.map((point) => ({ ...point })) }));
  const before = analyzePatchContacts(patches, target);
  const degree = new Map(before.rows.map((row) => [row.id, row.count]));
  const existing = new Set<string>();
  for (const row of before.rows) {
    for (const partner of row.partners) existing.add(row.id < partner ? `${row.id}:${partner}` : `${partner}:${row.id}`);
  }
  const bounds = patches.map(boundOf);
  const candidates: Array<{ i: number; j: number; clearance: number }> = [];
  const reach = maxGrowth * 2;
  for (let i = 0; i < patches.length; i++) {
    for (let j = i + 1; j < patches.length; j++) {
      const key = patches[i].id < patches[j].id ? `${patches[i].id}:${patches[j].id}` : `${patches[j].id}:${patches[i].id}`;
      if (existing.has(key) || !boundsCouldMeet(bounds[i], bounds[j], reach)) continue;
      const closest = closestPair(patches[i], patches[j]);
      if (closest && closest.clearance <= reach + TOUCH_EPS) candidates.push({ i, j, clearance: closest.clearance });
    }
  }
  candidates.sort((a, b) => a.clearance - b.clearance || patches[a.i].id - patches[b.i].id || patches[a.j].id - patches[b.j].id);

  const changed = new Set<string>();
  const changedPatches = new Set<number>();
  let addedEdges = 0;
  let maxAddition = 0;
  for (const candidate of candidates) {
    const a = patches[candidate.i]; const b = patches[candidate.j];
    if ((degree.get(a.id) ?? 0) >= target && (degree.get(b.id) ?? 0) >= target) continue;
    const pair = closestPair(a, b);
    if (!pair) continue;
    const ap = a.points[pair.ai]; const bp = b.points[pair.bi];
    const aUsed = ap.contactR ?? 0;
    const bUsed = bp.contactR ?? 0;
    const aAvailable = Math.max(0, maxGrowth - aUsed);
    const bAvailable = Math.max(0, maxGrowth - bUsed);
    const needed = Math.max(0, pair.clearance) + overlap;
    if (needed > aAvailable + bAvailable + TOUCH_EPS) continue;
    let addA = Math.min(aAvailable, needed * 0.5);
    let addB = Math.min(bAvailable, needed - addA);
    if (addA + addB < needed) addA += Math.min(aAvailable - addA, needed - addA - addB);
    if (addA + addB + TOUCH_EPS < needed) continue;
    ap.r += addA; bp.r += addB;
    ap.contactR = (ap.contactR ?? 0) + addA;
    bp.contactR = (bp.contactR ?? 0) + addB;
    if (addA > TOUCH_EPS) changed.add(`${candidate.i}:${pair.ai}`);
    if (addB > TOUCH_EPS) changed.add(`${candidate.j}:${pair.bi}`);
    if (addA > TOUCH_EPS) changedPatches.add(candidate.i);
    if (addB > TOUCH_EPS) changedPatches.add(candidate.j);
    maxAddition = Math.max(maxAddition, ap.contactR ?? 0, bp.contactR ?? 0);
    degree.set(a.id, (degree.get(a.id) ?? 0) + 1);
    degree.set(b.id, (degree.get(b.id) ?? 0) + 1);
    addedEdges++;
  }
  const after = analyzePatchContacts(patches, target);
  return {
    patches,
    before,
    after,
    adjustedPointCount: changed.size,
    adjustedPatchCount: changedPatches.size,
    addedEdges,
    maxAddition,
    unresolvedIds: after.rows.filter((row) => row.count < target).map((row) => row.id),
    mode: "localPoints",
  };
}

function reinforceWholeMotifContacts(
  input: Patch[],
  options: ContactReinforcementOptions,
): ContactReinforcementResult {
  const target = Math.max(1, Math.min(6, Math.round(options.target)));
  const maxWholeScale = Math.max(0, Math.min(1, options.wholeScaleMax ?? 0.15));
  const overlap = Math.max(0, options.overlap);
  const patches = input.map((patch) => ({ ...patch, points: patch.points.map((point) => ({ ...point })) }));
  const before = analyzePatchContacts(patches, target);
  const degree = new Map(before.rows.map((row) => [row.id, row.count]));
  const existing = new Set<string>();
  for (const row of before.rows) {
    for (const partner of row.partners) existing.add(row.id < partner ? `${row.id}:${partner}` : `${partner}:${row.id}`);
  }

  const maximumBounds = patches.map((patch) => boundOf(scaleWholeMotifTo(patch, maxWholeScale)));
  const candidates: Array<{ i: number; j: number; clearance: number }> = [];
  for (let i = 0; i < patches.length; i++) {
    for (let j = i + 1; j < patches.length; j++) {
      const key = patches[i].id < patches[j].id ? `${patches[i].id}:${patches[j].id}` : `${patches[j].id}:${patches[i].id}`;
      if (existing.has(key)) continue;
      if (!boundsCouldMeet(maximumBounds[i], maximumBounds[j], 0)) continue;
      const closest = closestPair(patches[i], patches[j]);
      if (closest) candidates.push({ i, j, clearance: closest.clearance });
    }
  }
  candidates.sort((a, b) => a.clearance - b.clearance || patches[a.i].id - patches[b.i].id || patches[a.j].id - patches[b.j].id);

  const changedPatches = new Set<number>();
  let addedEdges = 0;
  let maxAddition = 0;
  for (const candidate of candidates) {
    const a = patches[candidate.i]; const b = patches[candidate.j];
    if ((degree.get(a.id) ?? 0) >= target && (degree.get(b.id) ?? 0) >= target) continue;
    let pair = closestPair(a, b);
    if (!pair) continue;
    if (pair.clearance > -overlap + TOUCH_EPS) {
      const aCurrent = currentWholeScale(a);
      const bCurrent = currentWholeScale(b);
      const aAtMaximum = scaleWholeMotifTo(a, maxWholeScale);
      const bAtMaximum = scaleWholeMotifTo(b, maxWholeScale);
      const maximumPair = closestPair(aAtMaximum, bAtMaximum);
      if (!maximumPair || maximumPair.clearance > -overlap + TOUCH_EPS) continue;
      let low = 0;
      let high = 1;
      for (let iteration = 0; iteration < 28; iteration++) {
        const fraction = (low + high) * 0.5;
        const aTrial = scaleWholeMotifTo(a, aCurrent + (maxWholeScale - aCurrent) * fraction);
        const bTrial = scaleWholeMotifTo(b, bCurrent + (maxWholeScale - bCurrent) * fraction);
        const trialPair = closestPair(aTrial, bTrial);
        if (trialPair && trialPair.clearance <= -overlap + TOUCH_EPS) high = fraction;
        else low = fraction;
      }
      const aTarget = aCurrent + (maxWholeScale - aCurrent) * high;
      const bTarget = bCurrent + (maxWholeScale - bCurrent) * high;
      const nextA = scaleWholeMotifTo(a, aTarget);
      const nextB = scaleWholeMotifTo(b, bTarget);
      patches[candidate.i] = nextA;
      patches[candidate.j] = nextB;
      if (aTarget > aCurrent + TOUCH_EPS) {
        changedPatches.add(candidate.i);
      }
      if (bTarget > bCurrent + TOUCH_EPS) {
        changedPatches.add(candidate.j);
      }
      maxAddition = Math.max(maxAddition, aTarget, bTarget);
      pair = closestPair(nextA, nextB);
    }
    if (!pair || pair.clearance > TOUCH_EPS) continue;
    degree.set(a.id, (degree.get(a.id) ?? 0) + 1);
    degree.set(b.id, (degree.get(b.id) ?? 0) + 1);
    addedEdges++;
  }

  // Whole-motif mode is also an explicit authoring operation: if a weak
  // motif cannot reach a neighbour within the cap, it must still visibly
  // enlarge to that cap instead of silently doing nothing. Motifs already
  // resolved by the minimal-contact pass stay at their smaller solved size.
  const unresolvedAfterContactPass = new Set(
    analyzePatchContacts(patches, target).rows.filter((row) => row.count < target).map((row) => row.id),
  );
  for (let index = 0; index < patches.length; index++) {
    const patch = patches[index];
    if (!unresolvedAfterContactPass.has(patch.id)) continue;
    const current = currentWholeScale(patch);
    if (current >= maxWholeScale - TOUCH_EPS) continue;
    patches[index] = scaleWholeMotifTo(patch, maxWholeScale);
    changedPatches.add(index);
    maxAddition = Math.max(maxAddition, maxWholeScale);
  }

  const after = analyzePatchContacts(patches, target);
  const adjustedPointCount = [...changedPatches].reduce(
    (sum, patchIndex) => sum + patches[patchIndex].points.filter(editableMotifPoint).length,
    0,
  );
  return {
    patches,
    before,
    after,
    adjustedPointCount,
    adjustedPatchCount: changedPatches.size,
    addedEdges: Math.max(0, after.edgeCount - before.edgeCount),
    maxAddition,
    unresolvedIds: after.rows.filter((row) => row.count < target).map((row) => row.id),
    mode: "wholeMotif",
  };
}
