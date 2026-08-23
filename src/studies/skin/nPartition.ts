// Generation-native N partition for Surface Patch Packing.
//
// The groups are chosen on the Patch adjacency graph before meshing. Each
// physical part then owns the region where its own group-composite field is
// lower than every other group's field. This is the N-way form of the
// existing A/B ownership field; no planar cutter is introduced.

import type { Ball } from "../cloud-sculpt/field.ts";
import { smoothMin } from "../cloud-sculpt/field.ts";
import {
  buildMeshesFromSharedField,
  computeSignedMeshVolume,
  inspectSavedStlTopology,
  orientMeshForSavedStl,
  rescaleMeshResult,
} from "../cloud-sculpt/meshExport.ts";
import type { MeshBuildResult, SavedStlTopologyReport } from "../cloud-sculpt/meshExport.ts";
import { compositeSdf, patchesSdf, shellSdf } from "./field.ts";
import type { Patch, PatchAdjacencyEdge, SkinMode } from "./field.ts";
import {
  computeSkinSamplingBounds,
  countConnectedComponents,
  reinforceQuadConnectionsForMesh,
} from "./meshExport.ts";
import type { PartitionOptions, PartitionProgress } from "./partition.ts";

export interface NPatchGroups {
  seedIds: number[];
  groups: number[][];
}

export interface NPartitionPartResult {
  index: number;
  patchIds: number[];
  mesh: MeshBuildResult;
  connectedComponents: number;
  signedVolumeMm3: number;
  volumeMm3: number;
  savedTopology: SavedStlTopologyReport;
}

export interface NPartitionResult {
  parts: NPartitionPartResult[];
  originalMesh: MeshBuildResult;
  originalSignedVolumeMm3: number;
  originalVolumeMm3: number;
  originalSavedTopology: SavedStlTopologyReport;
  volumeDiffMm3: number | null;
  scaleMmPerUnit: number;
  resolution: number;
  targetLongestMm: number;
  verification: {
    topologyOk: boolean;
    singleComponentParts: boolean;
    volumeRatio: number | null;
    volumeWithinTolerance: boolean;
    limitations: string[];
  };
}

type Point = { x: number; y: number; z: number };

function center(patch: Patch): Point {
  const authoredShapePoints = patch.points.filter((point) => point.role !== "bridge");
  const points = authoredShapePoints.length > 0 ? authoredShapePoints : patch.points;
  const n = Math.max(1, points.length);
  return points.reduce(
    (sum, point) => ({ x: sum.x + point.x / n, y: sum.y + point.y / n, z: sum.z + point.z / n }),
    { x: 0, y: 0, z: 0 },
  );
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Deterministic farthest-point seeds followed by multi-source graph
 * Dijkstra. Graph distance follows how packed patches touch; Euclidean
 * distance is used only across disconnected graph components and is kept
 * visible through the returned seed ids/groups rather than hidden. */
export function proposeNGroups(patches: Patch[], edges: PatchAdjacencyEdge[], requestedCount: number): NPatchGroups {
  const count = Math.max(2, Math.min(6, Math.round(requestedCount), patches.length));
  if (patches.length < 2) return { seedIds: [], groups: [] };
  const ordered = [...patches].sort((a, b) => a.id - b.id);
  const positions = new Map(ordered.map((patch) => [patch.id, center(patch)]));
  const pairDistance = (aId: number, bId: number) => distance(positions.get(aId)!, positions.get(bId)!);

  let farthest: [number, number, number] = [ordered[0].id, ordered[1].id, -1];
  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      const d = pairDistance(ordered[i].id, ordered[j].id);
      if (d > farthest[2]) farthest = [ordered[i].id, ordered[j].id, d];
    }
  }
  const seedIds = [farthest[0], farthest[1]];
  while (seedIds.length < count) {
    let bestId = ordered.find((patch) => !seedIds.includes(patch.id))!.id;
    let bestDistance = -1;
    for (const patch of ordered) {
      if (seedIds.includes(patch.id)) continue;
      const nearest = Math.min(...seedIds.map((seedId) => pairDistance(patch.id, seedId)));
      if (nearest > bestDistance || (nearest === bestDistance && patch.id < bestId)) {
        bestDistance = nearest;
        bestId = patch.id;
      }
    }
    seedIds.push(bestId);
  }

  const adjacency = new Map<number, Array<{ id: number; cost: number }>>();
  for (const patch of ordered) adjacency.set(patch.id, []);
  for (const edge of edges) {
    const cost = Math.max(1e-6, pairDistance(edge.aId, edge.bId));
    adjacency.get(edge.aId)?.push({ id: edge.bId, cost });
    adjacency.get(edge.bId)?.push({ id: edge.aId, cost });
  }
  const owner = new Map<number, number>();
  const best = new Map(ordered.map((patch) => [patch.id, Number.POSITIVE_INFINITY]));
  const pending: Array<{ id: number; group: number; cost: number }> = seedIds.map((id, group) => ({ id, group, cost: 0 }));
  while (pending.length > 0) {
    pending.sort((a, b) => a.cost - b.cost || a.group - b.group || a.id - b.id);
    const current = pending.shift()!;
    const known = best.get(current.id)!;
    if (current.cost > known) continue;
    if (current.cost === known && (owner.get(current.id) ?? Infinity) <= current.group) continue;
    best.set(current.id, current.cost);
    owner.set(current.id, current.group);
    for (const neighbor of adjacency.get(current.id) ?? []) {
      pending.push({ id: neighbor.id, group: current.group, cost: current.cost + neighbor.cost });
    }
  }
  // Disconnected patches have no graph path to a seed. Assign those by the
  // nearest representative point; the later real-mesh component count keeps
  // the physical consequence visible.
  for (const patch of ordered) {
    if (owner.has(patch.id)) continue;
    let group = 0;
    let nearest = Infinity;
    seedIds.forEach((seedId, index) => {
      const d = pairDistance(patch.id, seedId);
      if (d < nearest) { nearest = d; group = index; }
    });
    owner.set(patch.id, group);
  }
  const groups = Array.from({ length: count }, () => [] as number[]);
  for (const patch of ordered) groups[owner.get(patch.id)!].push(patch.id);
  return { seedIds, groups };
}

export function validateNGroups(patches: Patch[], groups: number[][]): void {
  if (groups.length < 2 || groups.length > 6) throw new Error("部品数は2〜6にしてください");
  if (groups.some((group) => group.length === 0)) throw new Error("空の部品群があります");
  const expected = new Set(patches.map((patch) => patch.id));
  const assigned = new Set<number>();
  for (const group of groups) {
    for (const id of group) {
      if (!expected.has(id)) throw new Error(`存在しないPatch #${id}が含まれています`);
      if (assigned.has(id)) throw new Error(`Patch #${id}が複数群に含まれています`);
      assigned.add(id);
    }
  }
  if (assigned.size !== expected.size) throw new Error("未割当のPatchがあります");
}

export function buildNPartitionMeshes(
  mode: SkinMode,
  host: Ball[],
  hostK: number,
  thickness: number,
  allPatches: Patch[],
  groups: number[][],
  roundK: number,
  options: PartitionOptions,
  coinBulge: number,
  quadMeshJoinWidth = 0,
  coinBulgeBalance = 0,
  onProgress?: PartitionProgress,
): NPartitionResult {
  if (host.length === 0) throw new Error("実体（ホスト）が空です");
  allPatches = reinforceQuadConnectionsForMesh(allPatches, quadMeshJoinWidth).patches;
  validateNGroups(allPatches, groups);
  const groupSets = groups.map((group) => new Set(group));
  const groupedPatches = groupSets.map((ids) => allPatches.filter((patch) => ids.has(patch.id)));
  const names = ["original", ...groups.map((_, index) => `part-${index + 1}`)] as string[];
  const bounds = computeSkinSamplingBounds(host, hostK, thickness, allPatches);
  // The realized geometry is authoritative. The UI connection toggle only
  // affects the NEXT Pack, so it must never reinterpret already-packed
  // bridge points or make the N source differ from the ordinary mesh.
  const hasFlowerOnlySurface = allPatches.some((patch) =>
    patch.shape === "flower" && patch.points.some((point) =>
      point.role === "bridge" ||
      ((point.fusionR ?? 0) > 0 && point.r > (point.baseR ?? point.r))));
  const sampleAll = (x: number, y: number, z: number): Record<string, number> => {
    const dComposite = compositeSdf(
      mode, host, hostK, thickness, allPatches, roundK, x, y, z, coinBulge, coinBulgeBalance,
    );
    // In plate mode the ordinary S-skin output is intentionally a set of
    // separate plates. That cannot become glueable N parts merely by adding
    // ownership boundaries. For N-part authoring we therefore keep a
    // continuous host shell underneath and let the packed patches act as the
    // boundary/detail design. Window mode is already a continuous shell, so
    // its authored composite remains the source shape.
    const dOriginal = mode === "plate" && !hasFlowerOnlySurface
      ? smoothMin(shellSdf(host, hostK, thickness, x, y, z), dComposite, Math.max(0, roundK * 0.25))
      : dComposite;
    // Ownership comes from the raw patch fields in BOTH modes. Using each
    // window-mode composite here would compare several near-identical full
    // shells rather than the authored patch packing.
    const dGroups = groupedPatches.map((patches) => patchesSdf(patches, roundK, x, y, z));
    const values: Record<string, number> = { original: dOriginal };
    for (let i = 0; i < groups.length; i++) {
      let bestOther = Infinity;
      for (let j = 0; j < groups.length; j++) if (i !== j) bestOther = Math.min(bestOther, dGroups[j]);
      values[`part-${i + 1}`] = Math.max(dOriginal, dGroups[i] - bestOther);
    }
    return values;
  };
  const built = buildMeshesFromSharedField(bounds, names, sampleAll, options, onProgress);
  const originalMesh = orientMeshForSavedStl(built.original);
  const canonicalScale = originalMesh.scaleMmPerUnit;
  const parts = groups.map((patchIds, index): NPartitionPartResult => {
    const mesh = orientMeshForSavedStl(rescaleMeshResult(built[`part-${index + 1}`], canonicalScale));
    const signedVolumeMm3 = computeSignedMeshVolume(mesh);
    const savedTopology = inspectSavedStlTopology(mesh.triangles, canonicalScale);
    return {
      index: index + 1,
      patchIds: [...patchIds],
      mesh,
      connectedComponents: countConnectedComponents(mesh.triangles),
      signedVolumeMm3,
      volumeMm3: Math.abs(signedVolumeMm3),
      savedTopology,
    };
  });
  const originalSignedVolumeMm3 = computeSignedMeshVolume(originalMesh);
  const originalVolumeMm3 = Math.abs(originalSignedVolumeMm3);
  const originalSavedTopology = inspectSavedStlTopology(originalMesh.triangles, canonicalScale);
  const topologyOk = originalSavedTopology.ok && parts.every((part) => part.savedTopology.ok);
  const volumeDiffMm3 = topologyOk
    ? Math.abs(parts.reduce((sum, part) => sum + part.signedVolumeMm3, 0) - originalSignedVolumeMm3)
    : null;
  const volumeRatio = volumeDiffMm3 === null || originalVolumeMm3 <= 0 ? null : volumeDiffMm3 / originalVolumeMm3;
  return {
    parts,
    originalMesh,
    originalSignedVolumeMm3,
    originalVolumeMm3,
    originalSavedTopology,
    volumeDiffMm3,
    scaleMmPerUnit: canonicalScale,
    resolution: options.resolution,
    targetLongestMm: options.targetLongestMm,
    verification: {
      topologyOk,
      singleComponentParts: parts.every((part) => part.connectedComponents === 1),
      volumeRatio,
      volumeWithinTolerance: volumeRatio !== null && volumeRatio <= 0.01,
      limitations: [
        "N部品はPatch群のcompositeSdf競合から生成し、平面では切っていない",
        mode === "plate"
          ? hasFlowerOnlySurface
            ? "花どうしを直接融合した実現点を分割元に使い、連続ホスト殻は追加していない"
            : "プレートモードのN分割は連続した検証用部品にするため、Surface Packingを境界設計として連続ホスト殻を下地に追加した"
          : "窓モードは現在の連続殻をそのまま分割元にした",
        "保存後Float32トポロジー・連結成分・符号付き体積差は実測した",
        "A/B版が持つ実三角形Monte Carlo重複/隙間ゲートはN版では未実装のため、出力は検証用",
        "印刷可能性・支持材不要・接着強度を保証しない",
      ],
    },
  };
}
