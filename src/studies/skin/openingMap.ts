// Resolution-bound estimate of uncovered regions on a host-offset surface.
// It is intentionally not represented as an exact CAD boolean curve.
import { fieldSdf } from "../cloud-sculpt/field.ts";
import { buildMeshFromField, computeSamplingBounds } from "../cloud-sculpt/meshExport.ts";
import { compositeSdf } from "./field.ts";
import { buildSkinMesh, reinforceQuadConnectionsForMesh } from "./meshExport.ts";
import type { OpeningMapRequest, OpeningMapResult, OpeningMeasurement } from "./openingMapWorkerProtocol.ts";

const PALETTE = ["#e76f51", "#2a9d8f", "#e9c46a", "#457b9d", "#9b5de5", "#f4a261", "#43aa8b", "#577590"];
const QUANTUM = 1e5;
type V = { x: number; y: number; z: number };
type MT = { a: V; b: V; c: V; centroid: V; normal: V; area: number; uncovered: boolean };
type Edge = { ids: number[]; a: V; b: V };
const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const mul = (a: V, f: number): V => ({ x: a.x * f, y: a.y * f, z: a.z * f });
const length = (a: V) => Math.hypot(a.x, a.y, a.z);
const unit = (a: V): V => { const d = length(a); return d > 1e-12 ? mul(a, 1 / d) : { x: 0, y: 1, z: 0 }; };
const cross = (a: V, b: V): V => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const vertexKey = (p: V) => `${Math.round(p.x * QUANTUM)},${Math.round(p.y * QUANTUM)},${Math.round(p.z * QUANTUM)}`;
const edgeKey = (a: V, b: V) => { const ka = vertexKey(a), kb = vertexKey(b); return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`; };

/** Central-difference outward normal of the host field; deterministic for a
 * given input snapshot and resolution. */
export function hostGradientNormal(host: OpeningMapRequest["host"], hostK: number, p: V, eps: number): V {
  const f = (x: number, y: number, z: number) => fieldSdf(host, hostK, x, y, z);
  return unit({ x: f(p.x + eps, p.y, p.z) - f(p.x - eps, p.y, p.z), y: f(p.x, p.y + eps, p.z) - f(p.x, p.y - eps, p.z), z: f(p.x, p.y, p.z + eps) - f(p.x, p.y, p.z - eps) });
}

/** Materialize the same non-destructive legacy QUAD join reinforcement that
 * buildSkinMesh applies.  Classification must use this field too, otherwise
 * a colored opening can disagree with the real depth-tested mesh. */
export function prepareOpeningMeasurementPatches(request: OpeningMapRequest) {
  return reinforceQuadConnectionsForMesh(request.patches, request.quadMeshJoinWidth).patches;
}

/** Detect the characteristic false "one opening" result produced when the
 * measurement surface is offset beyond the motif relief.  This is only a
 * diagnostic: the requested offset remains unchanged and is reported. */
export function likelyOffsetMergedRegion(offsetMm: number, rawRegionCount: number, uncoveredSurfaceFraction: number): boolean {
  return offsetMm > 0 && rawRegionCount === 1 && uncoveredSurfaceFraction >= 0.8;
}

/** Select the host-normal cross-section with the largest aggregate sphere
 * section. Flat motifs remain near 0; raised flowers and ring3d are measured
 * through their body instead of only through their tangent feet. */
export function estimateAutomaticOpeningOffsetUnits(request: OpeningMapRequest): number {
  const points = request.patches.flatMap((patch) => patch.points);
  if (points.length === 0 || request.host.length === 0) return 0;
  const samples = points.map((point) => ({
    h: fieldSdf(request.host, request.hostK, point.x, point.y, point.z),
    r: Math.max(1e-6, point.r),
  }));
  let min = 0;
  let max = 0;
  for (const sample of samples) {
    min = Math.min(min, sample.h);
    max = Math.max(max, sample.h);
  }
  if (max - min < 1e-9) return Math.abs(min) < 1e-9 ? 0 : min;
  let best = 0;
  let bestScore = -Infinity;
  const steps = 40;
  for (let index = 0; index <= steps; index++) {
    const candidate = min + (max - min) * index / steps;
    let score = 0;
    for (const sample of samples) {
      const distance = candidate - sample.h;
      score += Math.max(0, sample.r * sample.r - distance * distance);
    }
    if (score > bestScore + 1e-12 || (Math.abs(score - bestScore) <= 1e-12 && Math.abs(candidate) < Math.abs(best))) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

export function measureOpenings(request: OpeningMapRequest, report?: (stage: string) => void): OpeningMapResult {
  const options = { resolution: Math.max(8, Math.round(request.resolution)), targetLongestMm: request.targetLongestMm };
  report?.("現在の形状メッシュを生成中");
  const current = buildSkinMesh(
    request.mode, request.host, request.hostK, request.thickness, request.patches, request.roundK,
    options, request.coinBulge, request.quadMeshJoinWidth, request.coinBulgeBalance,
  );
  const measurementPatches = prepareOpeningMeasurementPatches(request);
  const scale = current.scaleMmPerUnit;
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("現在の形状の縮尺を求められませんでした。");
  report?.("ホスト表面をメッシュ化中");
  const bounds = computeSamplingBounds(request.host, request.hostK);
  const hostMesh = buildMeshFromField(bounds, (x, y, z) => fieldSdf(request.host, request.hostK, x, y, z), options);
  const eps = Math.max(bounds.longest / Math.max(128, request.resolution * 4), 1e-5);
  const automaticOffset = request.automaticOffset === true;
  const outward = automaticOffset ? estimateAutomaticOpeningOffsetUnits(request) : request.offsetMm / scale;
  const actualOffsetMm = outward * scale;
  report?.("計測面の被覆を分類中");
  const triangles: MT[] = hostMesh.triangles.map((t) => {
    const move = (p: V) => add(p, mul(hostGradientNormal(request.host, request.hostK, p, eps), outward));
    const a = move(t.a), b = move(t.b), c = move(t.c);
    const raw = cross(sub(b, a), sub(c, a));
    const centroid = mul(add(add(a, b), c), 1 / 3);
    return { a, b, c, centroid, normal: hostGradientNormal(request.host, request.hostK, centroid, eps), area: length(raw) / 2, uncovered: compositeSdf(request.mode, request.host, request.hostK, request.thickness, measurementPatches, request.roundK, centroid.x, centroid.y, centroid.z, request.coinBulge, request.coinBulgeBalance) > 0 };
  });
  report?.("空隙を連結・計測中");
  const parent = triangles.map((_, index) => index);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const join = (a: number, b: number) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
  const edgeMap = new Map<string, Edge>();
  triangles.forEach((t, id) => {
    for (const [a, b] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) {
      const k = edgeKey(a, b); const edge = edgeMap.get(k); if (edge) edge.ids.push(id); else edgeMap.set(k, { ids: [id], a, b });
    }
  });
  for (const edge of edgeMap.values()) for (let i = 1; i < edge.ids.length; i++) if (triangles[edge.ids[0]].uncovered && triangles[edge.ids[i]].uncovered) join(edge.ids[0], edge.ids[i]);
  const groups = new Map<number, number[]>();
  triangles.forEach((t, id) => { if (t.uncovered) { const root = find(id); const group = groups.get(root); if (group) group.push(id); else groups.set(root, [id]); } });
  const sampledSurfaceArea = triangles.reduce((sum, triangle) => sum + triangle.area, 0);
  const sampledUncoveredArea = triangles.reduce((sum, triangle) => sum + (triangle.uncovered ? triangle.area : 0), 0);
  const uncoveredSurfaceFraction = sampledUncoveredArea / Math.max(sampledSurfaceArea, 1e-12);
  const likelyMergedByOffset = likelyOffsetMergedRegion(actualOffsetMm, groups.size, uncoveredSurfaceFraction);
  const raw: Omit<OpeningMeasurement, "id" | "colorIndex" | "color">[] = [];
  for (const ids of groups.values()) {
    const member = new Set(ids); let area = 0, perimeter = 0; let centroid = { x: 0, y: 0, z: 0 }, normal = { x: 0, y: 0, z: 0 };
    for (const id of ids) { const t = triangles[id]; area += t.area; centroid = add(centroid, mul(t.centroid, t.area)); normal = add(normal, mul(t.normal, t.area)); }
    for (const edge of edgeMap.values()) {
      const uncoveredIds = edge.ids.filter((id) => member.has(id));
      if (uncoveredIds.length > 0 && (edge.ids.length === 1 || edge.ids.some((id) => !triangles[id].uncovered))) perimeter += length(sub(edge.b, edge.a));
    }
    const areaMm2 = area * scale ** 2;
    if (areaMm2 < request.minAreaMm2) continue;
    raw.push({ areaMm2, perimeterMm: perimeter * scale, shapeIndex: perimeter ** 2 / Math.max(4 * Math.PI * area, 1e-12), centroid: mul(centroid, 1 / Math.max(area, 1e-12)), averageNormal: unit(normal), triangles: ids.map((id) => ({ a: triangles[id].a, b: triangles[id].b, c: triangles[id].c })) });
  }
  raw.sort((a, b) => b.areaMm2 - a.areaMm2 || a.centroid.x - b.centroid.x || a.centroid.y - b.centroid.y || a.centroid.z - b.centroid.z);
  return { openings: raw.map((opening, i) => ({ ...opening, id: `O-${String(i + 1).padStart(3, "0")}`, colorIndex: i % PALETTE.length, color: PALETTE[i % PALETTE.length] })), meshTriangles: current.triangles, scaleMmPerUnit: scale, resolution: options.resolution, targetLongestMm: request.targetLongestMm, automaticOffset, requestedOffsetMm: request.offsetMm, offsetMm: actualOffsetMm, minAreaMm2: request.minAreaMm2, uncoveredSurfaceFraction, likelyMergedByOffset };
}
