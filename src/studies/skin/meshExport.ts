// ---------------------------------------------------------------------------
// Skin's STL/OBJ export -- reuses cloud-sculpt/meshExport.ts's marching-
// tetrahedra mechanism (buildMeshFromField, computeSamplingBounds,
// encodeObj/encodeBinaryStl, meshSummary) with the mode-dependent composite
// SDF swapped in, instead of copying that mechanism. Same pattern as
// pack/meshExport.ts and foam/meshExport.ts.
//
// This file also owns countConnectedComponents: the AUTHORITATIVE "N個の
//分離した部品" number T10 完了条件3 asks for, computed from the actual
// triangle soup a build produced (union-find over shared vertices, same
// vertex-quantization convention cloud-sculpt's inspectWatertight uses for
// its own edge map) -- not the cheap patch-adjacency proxy field.ts exposes
// for the live-updating gauge panel. See field.ts's estimatePatchComponents
// doc comment for why the two can disagree and which one this Study's
// README cites for the actual claim.
// ---------------------------------------------------------------------------

import type { Ball } from "../cloud-sculpt/field.ts";
import { smoothMin } from "../cloud-sculpt/field.ts";
import {
  buildMeshFromField,
  buildMeshResultFromTriangles,
  buildMeshTrianglesFromFieldSlice,
  computeConnectedComponentsWithKey,
  computeSamplingBounds,
  encodeBinaryStl,
  encodeObj,
  meshSummary as baseMeshSummary,
  rescaleMeshResult,
} from "../cloud-sculpt/meshExport.ts";
import type { Bounds, MeshBuildResult, MeshVertex, Triangle } from "../cloud-sculpt/meshExport.ts";
import { createCompositeSdfEvaluator } from "./field.ts";
import type { Patch, SkinMode } from "./field.ts";
import type { SkinHistoryEntry } from "./history.ts";
import { serializeRecipe } from "./history.ts";
import type { InternalStructureGraph } from "./voronoi.ts";
import { internalGraphToPatchPoints } from "./voronoi.ts";
import { combineWithScaffoldSdf, expandScaffoldSamplingGrid } from "./scaffoldFusion.ts";
import type { SkinScaffoldPillar } from "./scaffoldFusion.ts";

export type { MeshBuildResult };

export interface SkinMeshOptions {
  resolution: number;
  targetLongestMm: number;
}

export interface SkinMeshFieldInput {
  mode: SkinMode;
  host: Ball[];
  hostK: number;
  thickness: number;
  patches: Patch[];
  roundK: number;
  options: SkinMeshOptions;
  coinBulge: number;
  quadMeshJoinWidth?: number;
  coinBulgeBalance?: number;
  internalGraph?: InternalStructureGraph | null;
  scaffoldPillars?: SkinScaffoldPillar[];
}

/** The exact field which represents finished artwork before optional
 * scaffold pillars are added.  Keep this input independent from sampling
 * options so support keep-out checks can use the same Surface + permanent
 * graph implementation as production BODY meshing. */
export type FinishedSkinBodySdfInput = Pick<
  SkinMeshFieldInput,
  "mode" | "host" | "hostK" | "thickness" | "patches" | "roundK" | "coinBulge"
    | "quadMeshJoinWidth" | "coinBulgeBalance" | "internalGraph"
>;

export interface SkinMeshSliceInput extends SkinMeshFieldInput {
  zStart: number;
  zEnd: number;
}

export interface SkinMeshSamplingGrid {
  bounds: Bounds;
  resolution: number;
  reinforcedConnectionPoints: number;
  internalEdgeCount: number;
}

export interface SkinMeshResult extends MeshBuildResult {
  connectedComponents: number;
  /** Number of old-recipe points that received the live non-destructive
   * QUAD mesh-join difference before sampling. */
  reinforcedConnectionPoints: number;
  /** Voronoi graph edges included in this exact mesh build. */
  internalEdgeCount: number;
}

export function reinforceQuadConnectionsForMesh(
  patches: Patch[],
  requestedWidth: number,
): { patches: Patch[]; reinforcedPointCount: number } {
  const width = Math.max(0, Math.min(0.25, requestedWidth));
  let reinforcedPointCount = 0;
  const reinforced = patches.map((patch) => ({
    ...patch,
    points: patch.points.map((point) => {
      if (patch.quadCellId === undefined || (point.fusionR ?? 0) <= 0) return { ...point };
      const current = point.meshJoinR ?? 0;
      const addition = Math.max(0, width - current);
      if (addition > 1e-9) reinforcedPointCount++;
      return { ...point, r: point.r + addition, meshJoinR: Math.max(current, width) };
    }),
  }));
  return { patches: reinforced, reinforcedPointCount };
}

/**
 * The sampling bounds every skin mesh build (full composite, or a partition
 * side -- see partition.ts) must use: the host's own bounds (shell never
 * reaches further out than host surface + thickness/2, mirrors pack/
 * meshExport.ts's host-vs-void reasoning) padded by every patch point's own
 * extent (立体リング patches can bulge well past thickness/2 -- T11's fix,
 * see prior inline comment history). Factored out of buildSkinMesh so
 * partition.ts's two per-side builds sample the EXACT same grid as the
 * original composite would, which is required for the shared A/B boundary
 * to close (T13 §3's "同一sampling bounds・同一resolutionでメッシュ化").
 */
export function computeSkinSamplingBounds(host: Ball[], hostK: number, thickness: number, patches: Patch[]): Bounds {
  const bounds = computeSamplingBounds(host, hostK);
  let min = { x: bounds.min.x - thickness / 2, y: bounds.min.y - thickness / 2, z: bounds.min.z - thickness / 2 };
  let max = { x: bounds.max.x + thickness / 2, y: bounds.max.y + thickness / 2, z: bounds.max.z + thickness / 2 };
  for (const patch of patches) {
    for (const pt of patch.points) {
      min = { x: Math.min(min.x, pt.x - pt.r), y: Math.min(min.y, pt.y - pt.r), z: Math.min(min.z, pt.z - pt.r) };
      max = { x: Math.max(max.x, pt.x + pt.r), y: Math.max(max.y, pt.y + pt.r), z: Math.max(max.z, pt.z + pt.r) };
    }
  }
  const size = { x: max.x - min.x, y: max.y - min.y, z: max.z - min.z };
  return { min, max, size, longest: Math.max(size.x, size.y, size.z) };
}

function internalStructurePatches(graph: InternalStructureGraph | null): Patch[] {
  if (!graph) return [];
  const points = internalGraphToPatchPoints(graph);
  return points.length > 0 ? [{ id: -1, shape: "ring3d", points }] : [];
}

function combineWithInternalStructure(
  surfaceSdf: (x: number, y: number, z: number) => number,
  graph: InternalStructureGraph | null,
  roundK: number,
): (x: number, y: number, z: number) => number {
  if (!graph || graph.edges.length === 0) return surfaceSdf;
  const primitives = graph.edges.flatMap((edge) => {
    const start = graph.nodes[edge.start]?.position;
    const end = graph.nodes[edge.end]?.position;
    return start && end && edge.radius > 0 ? [{ start, end, radius: edge.radius }] : [];
  });
  if (primitives.length === 0) return surfaceSdf;
  const radius = primitives.reduce((minimum, primitive) => Math.min(minimum, primitive.radius), Number.POSITIVE_INFINITY);
  const blend = Math.min(Math.max(0.005, roundK), radius * 0.75);
  // A graph edge is a real capsule, not a row of independent balls. Besides
  // removing thousands of repeated field primitives, this keeps the lower
  // side of a <=45-degree Stage 5B member at the authored printable angle;
  // sampled balls created scalloped downward hemispheres that Stage 7 quite
  // correctly diagnosed as new red faces.
  const evaluateInternal = (x: number, y: number, z: number): number => {
    let distance = Number.POSITIVE_INFINITY;
    for (let primitiveIndex = 0; primitiveIndex < primitives.length; primitiveIndex++) {
      const primitive = primitives[primitiveIndex];
      const dx = primitive.end.x - primitive.start.x;
      const dy = primitive.end.y - primitive.start.y;
      const dz = primitive.end.z - primitive.start.z;
      const denominator = dx * dx + dy * dy + dz * dz;
      const t = denominator > 1e-16
        ? Math.max(0, Math.min(1, (
          (x - primitive.start.x) * dx
          + (y - primitive.start.y) * dy
          + (z - primitive.start.z) * dz
        ) / denominator))
        : 0;
      const capsule = Math.hypot(
        x - (primitive.start.x + dx * t),
        y - (primitive.start.y + dy * t),
        z - (primitive.start.z + dz * t),
      ) - primitive.radius;
      distance = primitiveIndex === 0 ? capsule : smoothMin(distance, capsule, blend);
    }
    return distance;
  };
  return (x, y, z) => smoothMin(
    surfaceSdf(x, y, z),
    evaluateInternal(x, y, z),
    blend,
  );
}

/** Build the authoritative finished-BODY distance field used by both
 * production meshing and removable print-support keep-out checks.  Scaffold
 * pillars are intentionally outside this helper: they are a separate output
 * mode, while `internalGraph` is the permanent artwork (lattice plus any
 * reinforcement) that a removable support must avoid. */
export function createFinishedSkinBodySdfEvaluator(
  input: FinishedSkinBodySdfInput,
): (x: number, y: number, z: number) => number {
  const reinforced = reinforceQuadConnectionsForMesh(input.patches, input.quadMeshJoinWidth ?? 0);
  const surfaceSdf = createCompositeSdfEvaluator(
    input.mode,
    input.host,
    input.hostK,
    input.thickness,
    reinforced.patches,
    input.roundK,
    input.coinBulge,
    input.coinBulgeBalance ?? 0,
  );
  return combineWithInternalStructure(surfaceSdf, input.internalGraph ?? null, input.roundK);
}

function validateSkinMeshInput(input: SkinMeshFieldInput): void {
  if (input.host.length === 0) {
    throw new Error("実体（ホスト）が空です。まず育ててください。");
  }
  if (input.mode === "plate" && input.patches.length === 0) {
    throw new Error("プレート版は虚（パッチ）が無いと何も残りません。まず詰めてください。");
  }
}

function prepareSkinMeshField(input: SkinMeshFieldInput): {
  grid: SkinMeshSamplingGrid;
  sdf: (x: number, y: number, z: number) => number;
} {
  validateSkinMeshInput(input);
  const reinforced = reinforceQuadConnectionsForMesh(input.patches, input.quadMeshJoinWidth ?? 0);
  const internalGraph = input.internalGraph ?? null;
  const internalPatches = internalStructurePatches(internalGraph);
  const scaffoldPillars = input.scaffoldPillars ?? [];
  const samplingGrid = expandScaffoldSamplingGrid(
    computeSkinSamplingBounds(input.host, input.hostK, input.thickness, [...reinforced.patches, ...internalPatches]),
    scaffoldPillars,
    input.options.resolution,
  );
  const bodySdf = createFinishedSkinBodySdfEvaluator(input);
  return {
    grid: {
      bounds: samplingGrid.bounds,
      resolution: samplingGrid.resolution,
      reinforcedConnectionPoints: reinforced.reinforcedPointCount,
      internalEdgeCount: internalGraph?.edges.length ?? 0,
    },
    sdf: combineWithScaffoldSdf(bodySdf, scaffoldPillars),
  };
}

/** The authoritative expanded grid shared by serial and parallel SKIN
 * meshing. Workers divide only its global Z cube range. */
export function computeSkinMeshSamplingGrid(input: SkinMeshFieldInput): SkinMeshSamplingGrid {
  return prepareSkinMeshField(input).grid;
}

/** Polygonize one disjoint global-Z cube range. Concatenating ascending
 * ranges preserves buildSkinMesh's scalar field and global sampling grid. */
export function buildSkinMeshTrianglesSlice(input: SkinMeshSliceInput): Triangle[] {
  const prepared = prepareSkinMeshField(input);
  return buildMeshTrianglesFromFieldSlice(
    prepared.grid.bounds,
    prepared.sdf,
    prepared.grid.resolution,
    input.zStart,
    input.zEnd,
  );
}

export function buildSkinMesh(
  mode: SkinMode,
  host: Ball[],
  hostK: number,
  thickness: number,
  patches: Patch[],
  roundK: number,
  options: SkinMeshOptions,
  coinBulge: number,
  quadMeshJoinWidth = 0,
  coinBulgeBalance = 0,
  internalGraph: InternalStructureGraph | null = null,
  scaffoldPillars: SkinScaffoldPillar[] = [],
): SkinMeshResult {
  const prepared = prepareSkinMeshField({
    mode, host, hostK, thickness, patches, roundK, options, coinBulge,
    quadMeshJoinWidth, coinBulgeBalance, internalGraph, scaffoldPillars,
  });
  const result = buildMeshFromField(prepared.grid.bounds, prepared.sdf, {
    ...options,
    resolution: prepared.grid.resolution,
  });
  return {
    ...result,
    connectedComponents: countConnectedComponents(result.triangles),
    reinforcedConnectionPoints: prepared.grid.reinforcedConnectionPoints,
    internalEdgeCount: prepared.grid.internalEdgeCount,
  };
}

/** Display-only meshing range used by the preview Worker pool. Export and
 * inspection continue to call buildSkinMesh and its topology checks. */
export function buildSkinPreviewMeshSlice(
  mode: SkinMode,
  host: Ball[],
  hostK: number,
  thickness: number,
  patches: Patch[],
  roundK: number,
  resolution: number,
  coinBulge: number,
  quadMeshJoinWidth: number,
  zStart: number,
  zEnd: number,
  coinBulgeBalance = 0,
  internalGraph: InternalStructureGraph | null = null,
): Triangle[] {
  const reinforced = reinforceQuadConnectionsForMesh(patches, quadMeshJoinWidth);
  const internalPatches = internalStructurePatches(internalGraph);
  const bounds = computeSkinSamplingBounds(host, hostK, thickness, [...reinforced.patches, ...internalPatches]);
  const sdf = createFinishedSkinBodySdfEvaluator({
    mode,
    host,
    hostK,
    thickness,
    patches,
    roundK,
    coinBulge,
    coinBulgeBalance,
    quadMeshJoinWidth,
    internalGraph,
  });
  return buildMeshTrianglesFromFieldSlice(bounds, sdf, resolution, zStart, zEnd);
}

/**
 * Union-find over the mesh's own vertices (quantized the same way
 * inspectWatertight keys them) to count connected pieces of the ACTUAL
 * generated surface. This is what T10 完了条件3's "N 個の分離した部品"
 * cites -- not a topology guess, a count taken from the exported geometry
 * itself. O(triangles) with near-constant-time union-find.
 */
const CONNECTED_COMPONENTS_QUANTUM = 1e5;

export function countConnectedComponents(triangles: Triangle[]): number {
  const keyOf = (v: MeshVertex) =>
    `${Math.round(v.x * CONNECTED_COMPONENTS_QUANTUM)},${Math.round(v.y * CONNECTED_COMPONENTS_QUANTUM)},${Math.round(v.z * CONNECTED_COMPONENTS_QUANTUM)}`;
  return computeConnectedComponentsWithKey(triangles, keyOf);
}

export function meshSummary(result: SkinMeshResult): string {
  const reinforcement = result.reinforcedConnectionPoints > 0
    ? ` / 旧接合を補強 ${result.reinforcedConnectionPoints}点`
    : "";
  const internal = result.internalEdgeCount > 0
    ? ` / 内部Voronoi ${result.internalEdgeCount}辺`
    : "";
  return `${baseMeshSummary(result)} / 部品数 ${result.connectedComponents}${reinforcement}${internal}`;
}

/** T14: coinBulge>0 gets folded into the filename itself (0 keeps the old
 * name unchanged, per instruction §3.3 "0は従来名を維持してよい") so a
 * candidate's STL/OBJ/recipe files never collide with -- or get silently
 * confused with -- the value-0 baseline or a different candidate, without
 * relying on opening the recipe JSON to tell them apart. */
export function makeSkinExportBaseName(mode: SkinMode, coinBulge: number, coinBulgeBalance = 0): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const bulgeSuffix = coinBulge > 0 ? `-coin-bulge-${coinBulge.toFixed(3).replace(".", "p")}` : "";
  const clampedBalance = Math.max(-1, Math.min(1, coinBulgeBalance));
  const balanceSuffix = coinBulge > 0 && Math.abs(clampedBalance) > 1e-6
    ? `-${clampedBalance > 0 ? "front" : "back"}-${Math.abs(clampedBalance).toFixed(2).replace(".", "p")}`
    : "";
  return `yohaku-skin-${mode}${bulgeSuffix}${balanceSuffix}-${stamp}`;
}

/**
 * Downloads STL + OBJ + this Study's own recipe JSON. NOT an S1 or pack
 * recipe -- patches have no representation in either format, so this
 * bundle carries skin's own format (studyId "skin") instead.
 */
export function downloadSkinMeshBundle(
  result: SkinMeshResult,
  history: SkinHistoryEntry[],
  baseName: string,
): void {
  downloadSkinMeshArtifacts(
    encodeBinaryStl(result, baseName),
    encodeObj(result),
    serializeRecipe(history),
    baseName,
  );
}

/**
 * Build a small, closed cylinder mesh for the independently removable print
 * support Graph. Unlike BODY meshing this does not sample the full 3D field,
 * so tens of vertical support pillars take milliseconds rather than another
 * resolution^3 marching pass. The caller supplies BODY's scale so both STL
 * files retain exactly the same coordinate system.
 */
export function buildPrintSupportMesh(
  graph: InternalStructureGraph,
  scaleMmPerUnit: number,
  options: {
    radialSegments?: number;
    /** Exact BODY build-plate translation. This preserves the authored
     * support-to-artwork contacts in separate STL/OBJ/3MF parts. */
    sourceOffset?: MeshVertex;
    /** In the translated coordinate system, extend only the lower endpoint
     * of a vertical pillar to this plate Z. The upper artwork contact stays
     * fixed. */
    extendVerticalRootsToPlateZ?: number;
  } = {},
): MeshBuildResult {
  if (!(scaleMmPerUnit > 0) || !Number.isFinite(scaleMmPerUnit)) throw new Error("print support scale is invalid");
  const segments = Math.max(8, Math.min(32, Math.round(options.radialSegments ?? 12)));
  const sourceOffset = options.sourceOffset ?? { x: 0, y: 0, z: 0 };
  if (![sourceOffset.x, sourceOffset.y, sourceOffset.z].every(Number.isFinite)) {
    throw new Error("print support source offset is invalid");
  }
  const triangles: Triangle[] = [];
  const normalize = (value: MeshVertex): MeshVertex => {
    const magnitude = Math.hypot(value.x, value.y, value.z);
    if (!(magnitude > 1e-12)) throw new Error("print support contains a zero-length edge");
    return { x: value.x / magnitude, y: value.y / magnitude, z: value.z / magnitude };
  };
  const cross = (a: MeshVertex, b: MeshVertex): MeshVertex => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  });
  const add = (a: MeshVertex, b: MeshVertex): MeshVertex => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
  const multiply = (value: MeshVertex, amount: number): MeshVertex => ({ x: value.x * amount, y: value.y * amount, z: value.z * amount });
  for (const edge of graph.edges) {
    const sourceStart = graph.nodes[edge.start]?.position;
    const sourceEnd = graph.nodes[edge.end]?.position;
    if (!sourceStart || !sourceEnd || !(edge.radius > 0)) throw new Error("print support graph edge is invalid");
    let start = add(sourceStart, sourceOffset);
    let end = add(sourceEnd, sourceOffset);
    const plateZ = options.extendVerticalRootsToPlateZ;
    if (plateZ !== undefined) {
      if (!Number.isFinite(plateZ)) throw new Error("print support plate Z is invalid");
      const vertical = Math.hypot(end.x - start.x, end.y - start.y) <= 1e-8;
      if (vertical) {
        if (start.z <= end.z) start = { ...start, z: plateZ };
        else end = { ...end, z: plateZ };
      }
    }
    const axis = normalize({ x: end.x - start.x, y: end.y - start.y, z: end.z - start.z });
    const reference = Math.abs(axis.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
    const u = normalize(cross(reference, axis));
    const v = cross(axis, u);
    const startRing: MeshVertex[] = [];
    const endRing: MeshVertex[] = [];
    for (let index = 0; index < segments; index++) {
      const angle = index * Math.PI * 2 / segments;
      const radial = add(multiply(u, Math.cos(angle) * edge.radius), multiply(v, Math.sin(angle) * edge.radius));
      startRing.push(add(start, radial));
      endRing.push(add(end, radial));
    }
    for (let index = 0; index < segments; index++) {
      const next = (index + 1) % segments;
      const a0 = startRing[index]; const a1 = startRing[next];
      const b0 = endRing[index]; const b1 = endRing[next];
      triangles.push(
        { a: a0, b: a1, c: b1 },
        { a: a0, b: b1, c: b0 },
        { a: start, b: a1, c: a0 },
        { a: end, b: b0, c: b1 },
      );
    }
  }
  if (triangles.length === 0) throw new Error("print support graph is empty");
  return rescaleMeshResult(buildMeshResultFromTriangles(triangles, 1), scaleMmPerUnit);
}

/** Convert the exact binary STL bytes accepted by the Internal Print Gate to
 * an OBJ without rebuilding the implicit field. STL coordinates are already
 * in millimetres, so the cached export keeps an identity scale. */
export function encodeObjFromBinaryStl(stl: ArrayBuffer): string {
  if (stl.byteLength < 84) throw new Error("cached binary STL is truncated");
  const view = new DataView(stl);
  const triangleCount = view.getUint32(80, true);
  const expectedBytes = 84 + triangleCount * 50;
  if (expectedBytes !== stl.byteLength) throw new Error("cached binary STL size is invalid");
  const lines = [
    "# Yohaku SKIN cached STL OBJ",
    `# triangles ${triangleCount}`,
    "# scale 1 mm/source-unit",
  ];
  const format = (value: number): string => {
    if (!Number.isFinite(value)) throw new Error("cached binary STL contains a non-finite coordinate");
    const fixed = value.toFixed(6).replace(/(?:\.0+|(?:(\.\d*?)0+))$/, "$1");
    return fixed === "-0" ? "0" : fixed;
  };
  let offset = 84;
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    offset += 12; // stored normal; OBJ recomputes it from the face winding
    for (let vertex = 0; vertex < 3; vertex++) {
      const x = view.getFloat32(offset, true);
      const y = view.getFloat32(offset + 4, true);
      const z = view.getFloat32(offset + 8, true);
      lines.push(`v ${format(x)} ${format(y)} ${format(z)}`);
      offset += 12;
    }
    offset += 2;
  }
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const base = triangle * 3 + 1;
    lines.push(`f ${base} ${base + 1} ${base + 2}`);
  }
  return `${lines.join("\n")}\n`;
}

/** Download already-computed export artifacts. The interactive S-skin path
 * creates STL/OBJ inside a Worker and calls this lightweight main-thread
 * handoff so meshing and text encoding never block pointer/UI events. */
export function downloadSkinMeshArtifacts(
  stl: ArrayBuffer,
  obj: string,
  recipe: string,
  baseName: string,
  printSupport?: { stl: ArrayBuffer; obj: string },
  selection: { stl?: boolean; obj?: boolean; recipe?: boolean } = { stl: true, obj: true, recipe: true },
): void {
  if (selection.stl !== false) downloadBlob(new Blob([stl], { type: "model/stl" }), `${baseName}.stl`);
  if (selection.obj !== false) downloadBlob(new Blob([obj], { type: "text/plain" }), `${baseName}.obj`);
  if (printSupport) {
    if (selection.stl !== false) {
      downloadBlob(new Blob([printSupport.stl], { type: "model/stl" }), `${baseName}-print-support.stl`);
    }
    if (selection.obj !== false) {
      downloadBlob(new Blob([printSupport.obj], { type: "text/plain" }), `${baseName}-print-support.obj`);
    }
  }
  if (selection.recipe !== false) {
    downloadBlob(
      new Blob([recipe], { type: "application/json" }),
      `${baseName}.recipe.json`,
    );
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
