import type { Ball } from "../../cloud-sculpt/field.ts";
import { fieldSdf } from "../../cloud-sculpt/field.ts";
import {
  encodeBinaryStl,
  inspectSavedStlTopology,
  orientMeshForSavedStl,
  roundVertexToF32,
  type Bounds,
  type MeshBuildResult,
  type MeshVertex,
  type SavedStlTopologyReport,
  type Triangle,
} from "../../cloud-sculpt/meshExport.ts";
import type { Patch } from "../field.ts";
import { createCompositeSdfEvaluator, createPatchesSdfEvaluator, projectToSurface } from "../field.ts";
import {
  buildSkinMesh,
  countConnectedComponents,
  computeSkinSamplingBounds,
  type SkinMeshResult,
} from "../meshExport.ts";
import {
  findMotifLowestPoints,
  findMotifMeshLowestPoints,
} from "../motifLowestPoint.ts";
import {
  detectSkinRebuildOverhangRegions,
  type SkinRebuildOverhangDetection,
  type SkinRebuildOverhangSurfaceSample,
} from "./overhangRegions.ts";
import { surfaceOverhangAngleDeg } from "../surfaceAngleDiagnosis.ts";
import type { SurfaceAngleDiagnosisProgress } from "../surfaceAngleDiagnosis.ts";
import type {
  InternalStructureEdge,
  InternalStructureGraph,
  InternalStructureNode,
  Vector3Value,
} from "../voronoi.ts";

export const SKIN_REBUILD_ALGORITHM_VERSION = "skin-rebuild-first-print-v1";

export interface SkinRebuildSettings {
  /** Distance between the first and last metaball centres, in source units. */
  baseStretch: number;
  patternCount: number;
  strutDiameterMm: number;
  /** Diameter of removable build-plate support, kept separate from the
   * permanent spider lattice. */
  supportDiameterMm: number;
  targetLongestMm: number;
  surfaceThickness: number;
  patternRadius: number;
  roundK: number;
  overhangThresholdDeg: number;
  analysisResolution: number;
  exportResolution: number;
}

export const DEFAULT_SKIN_REBUILD_SETTINGS: SkinRebuildSettings = {
  baseStretch: 2.8,
  patternCount: 38,
  strutDiameterMm: 2.6,
  supportDiameterMm: 1.6,
  targetLongestMm: 80,
  surfaceThickness: 0.18,
  patternRadius: 0.27,
  roundK: 0.045,
  overhangThresholdDeg: 45,
  analysisResolution: 48,
  exportResolution: 68,
};

export interface SkinRebuildBase {
  kind: "metaball-capsule";
  host: Ball[];
  hostK: number;
}

export interface SkinRebuildPatternSide {
  patchId: number;
  surfacePosition: Vector3Value;
  outwardNormal: Vector3Value;
  insidePosition: Vector3Value;
  outsidePosition: Vector3Value;
  insideSignedDistance: number;
  outsideSignedDistance: number;
  baseSideIsInside: boolean;
}

export interface SkinRebuildLowestPoint {
  patchId: number;
  position: Vector3Value;
  normal: Vector3Value;
  overhangAngleDeg: number;
  plateContact: boolean;
  needsSupport: boolean;
  basis: "sourceSphere" | "finalMesh";
}

export interface SkinRebuildLowestPointOptions {
  onProgress?: (progress: SurfaceAngleDiagnosisProgress) => void;
}

export interface SkinRebuildLowestPointDiagnosis {
  mesh: SkinMeshResult;
  meshPositions: Float32Array;
  meshNormals: Float32Array;
  lowestPoints: SkinRebuildLowestPoint[];
  overhang: SkinRebuildOverhangDetection;
}

export interface SkinRebuildLatticeConnection {
  targetPatchId: number;
  opposingPatchId: number;
  rootPatchId: number;
  overhangAngleDeg: number;
  opposingNormalDot: number;
  maximumEdgeAngleDeg: number;
  segmentCount: number;
}

/** Sampled clearance of the complete cylindrical member radius against the
 * authored metaball Base. This is a geometric SDF screen, not a mechanical
 * strength or slicer guarantee. */
export interface SkinRebuildLatticeBaseContainment {
  contained: boolean;
  checkedEdgeCount: number;
  checkedSampleCount: number;
  outsideEdgeIds: number[];
  /** Positive means protrusion; negative means remaining inward clearance. */
  maximumExcessMm: number;
}

export interface SkinRebuildOverhangReinforcement {
  lattice: InternalStructureGraph;
  /** Standalone copy of only the accepted face-to-web members.  Keeping this
   * geometry separate from compacted lattice edge ids makes the cyan preview
   * stable even when a later face contact splits another permanent edge. */
  reinforcement: InternalStructureGraph;
  sourceEdgeId: number;
  /** Edge ids of the newly routed surface-to-web member in `lattice`.
   * The split source member is deliberately excluded. */
  reinforcementEdgeIds: number[];
  surfaceContact: Vector3Value;
  latticeContact: Vector3Value;
  /** Number of real red-face triangle contacts covered by the permanent
   * face-to-point buttress. */
  surfaceContactCount: number;
  /** Sample indices which still need another author pass. Successful geometry
   * is retained instead of discarding the complete region at the first hard
   * contact. */
  uncoveredSurfaceContactIndices: number[];
  segmentCount: number;
  maximumEdgeAngleDeg: number;
  containment: SkinRebuildLatticeBaseContainment;
}

export interface SkinRebuildOverhangReinforcementProgress {
  phase: "routing" | "containment" | "complete";
  completedContactCount: number;
  contactCount: number;
  candidateIndex: number;
  candidateCount: number;
}

export interface SkinRebuildOverhangReinforcementOptions {
  onProgress?: (progress: SkinRebuildOverhangReinforcementProgress) => void;
}

export interface SkinRebuildAudit {
  requestedPatternCount: number;
  realizedPatternCount: number;
  classifiedInsideCount: number;
  dryWebNodeCount: number;
  dryWebEdgeCount: number;
  lowestPointCount: number;
  overhangTargetCount: number;
  supportedTargetCount: number;
  unsupportedTargetCount: number;
  maximumLatticeAngleDeg: number;
}

export interface SkinRebuildProject {
  algorithmVersion: typeof SKIN_REBUILD_ALGORITHM_VERSION;
  settings: SkinRebuildSettings;
  base: SkinRebuildBase;
  patterns: Patch[];
  patternSides: SkinRebuildPatternSide[];
  dryWeb: InternalStructureGraph;
  lowestPoints: SkinRebuildLowestPoint[];
  lattice: InternalStructureGraph;
  /** Removable print support. It is never merged into finalGraph/BODY. */
  printSupport: InternalStructureGraph;
  latticeConnections: SkinRebuildLatticeConnection[];
  finalGraph: InternalStructureGraph;
  audit: SkinRebuildAudit;
}

export interface SkinRebuildRuntimeBuild {
  project: SkinRebuildProject;
  analysisMesh: MeshBuildResult;
}

export interface SkinRebuildStlArtifact {
  mesh: MeshBuildResult;
  topology: SavedStlTopologyReport;
  stl: ArrayBuffer;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const EPSILON = 1e-9;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}

function validateSettings(input: SkinRebuildSettings): SkinRebuildSettings {
  const settings = { ...input };
  finite(settings.baseStretch, "baseStretch");
  finite(settings.patternCount, "patternCount");
  finite(settings.strutDiameterMm, "strutDiameterMm");
  finite(settings.supportDiameterMm, "supportDiameterMm");
  finite(settings.targetLongestMm, "targetLongestMm");
  finite(settings.surfaceThickness, "surfaceThickness");
  finite(settings.patternRadius, "patternRadius");
  finite(settings.roundK, "roundK");
  finite(settings.overhangThresholdDeg, "overhangThresholdDeg");
  finite(settings.analysisResolution, "analysisResolution");
  finite(settings.exportResolution, "exportResolution");
  settings.baseStretch = clamp(settings.baseStretch, 1.8, 4.4);
  settings.patternCount = Math.round(clamp(settings.patternCount, 1, 2_000));
  settings.strutDiameterMm = clamp(settings.strutDiameterMm, 1.6, 4);
  settings.supportDiameterMm = clamp(settings.supportDiameterMm, 0.8, 4);
  settings.targetLongestMm = clamp(settings.targetLongestMm, 40, 160);
  settings.surfaceThickness = clamp(settings.surfaceThickness, 0.12, 0.32);
  settings.patternRadius = clamp(settings.patternRadius, 0.18, 0.38);
  settings.roundK = clamp(settings.roundK, 0.015, 0.09);
  settings.overhangThresholdDeg = clamp(settings.overhangThresholdDeg, 30, 65);
  settings.analysisResolution = Math.round(clamp(settings.analysisResolution, 32, 72));
  settings.exportResolution = Math.round(clamp(settings.exportResolution, 48, 128));
  return settings;
}

function length(a: Vector3Value, b: Vector3Value): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function horizontalDistance(a: Vector3Value, b: Vector3Value): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function dot(a: Vector3Value, b: Vector3Value): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function normalize(value: Vector3Value): Vector3Value {
  const magnitude = Math.hypot(value.x, value.y, value.z) || 1;
  return { x: value.x / magnitude, y: value.y / magnitude, z: value.z / magnitude };
}

function lerp(a: Vector3Value, b: Vector3Value, t: number): Vector3Value {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function tangentBasis(normal: Vector3Value): [Vector3Value, Vector3Value] {
  const reference = Math.abs(normal.z) < 0.88 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
  const first = normalize({
    x: normal.y * reference.z - normal.z * reference.y,
    y: normal.z * reference.x - normal.x * reference.z,
    z: normal.x * reference.y - normal.y * reference.x,
  });
  return [first, normalize({
    x: normal.y * first.z - normal.z * first.y,
    y: normal.z * first.x - normal.x * first.z,
    z: normal.x * first.y - normal.y * first.x,
  })];
}

export function createSkinRebuildBase(settingsInput: SkinRebuildSettings): SkinRebuildBase {
  const settings = validateSettings(settingsInput);
  // Match the original SKIN Stage 1 opening contract (12 host spheres) while
  // retaining the reviewed five-sphere printable outer silhouette. Seven
  // small interior host spheres remain editable in Stage 1 but do not create
  // an unsupported exterior lobe.
  const primaryCount = 5;
  const host: Ball[] = [];
  for (let index = 0; index < primaryCount; index++) {
    const t = index / (primaryCount - 1);
    const endBias = Math.abs(t - 0.5) * 2;
    host.push({
      id: index + 1,
      x: Math.sin(index * 1.7) * 0.035,
      y: Math.cos(index * 1.3) * 0.025,
      z: (t - 0.5) * settings.baseStretch,
      r: 0.82 - endBias * 0.04,
    });
  }
  for (let index = 0; index < 7; index++) {
    const t = (index + 1) / 8;
    host.push({
      id: primaryCount + index + 1,
      x: Math.sin(index * 2.1) * 0.04,
      y: Math.cos(index * 1.6) * 0.04,
      z: (t - 0.5) * settings.baseStretch * 0.72,
      r: 0.08,
    });
  }
  return { kind: "metaball-capsule", host, hostK: 0.3 };
}

function projectedPatternAnchors(
  base: SkinRebuildBase,
  settings: SkinRebuildSettings,
): Array<{ position: Vector3Value; normal: Vector3Value }> {
  const anchors: Array<{ position: Vector3Value; normal: Vector3Value }> = [];
  const extentZ = settings.baseStretch * 0.5 + 0.42;
  for (let index = 0; index < settings.patternCount; index++) {
    const y = 1 - (2 * (index + 0.5)) / settings.patternCount;
    const radial = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = index * GOLDEN_ANGLE;
    const direction = {
      x: Math.cos(angle) * radial,
      y: Math.sin(angle) * radial,
      z: y,
    };
    const projected = projectToSurface(
      base.host,
      base.hostK,
      direction.x * 0.42,
      direction.y * 0.42,
      direction.z * extentZ,
      32,
    );
    if (!projected) continue;
    const position = { x: projected.x, y: projected.y, z: projected.z };
    if (anchors.some((candidate) => length(candidate.position, position) < settings.patternRadius * 0.58)) continue;
    anchors.push({ position, normal: normalize({ x: projected.nx, y: projected.ny, z: projected.nz }) });
  }
  return anchors;
}

export function createSkinRebuildPatterns(
  base: SkinRebuildBase,
  settingsInput: SkinRebuildSettings,
): { patterns: Patch[]; patternSides: SkinRebuildPatternSide[] } {
  const settings = validateSettings(settingsInput);
  const anchors = projectedPatternAnchors(base, settings);
  const patterns: Patch[] = [];
  const patternSides: SkinRebuildPatternSide[] = [];
  const scaleMmPerUnit = estimatedScaleMmPerUnit(base, [], settings);
  const strutRadius = (settings.strutDiameterMm * 0.5) / scaleMmPerUnit;
  const innerDepth = Math.max(settings.surfaceThickness * 0.72, 0.13, strutRadius * 1.12);
  for (let index = 0; index < anchors.length; index++) {
    const anchor = anchors[index];
    const [tangentA, tangentB] = tangentBasis(anchor.normal);
    const phase = index * GOLDEN_ANGLE * 0.37;
    const points: Patch["points"] = [{
      ...anchor.position,
      r: settings.patternRadius * 0.62,
      role: "motif",
    }];
    for (let petal = 0; petal < 3; petal++) {
      const angle = phase + petal * (Math.PI * 2 / 3);
      const distanceFromAnchor = settings.patternRadius * (0.43 + 0.05 * Math.sin(index + petal));
      const seed = {
        x: anchor.position.x + tangentA.x * Math.cos(angle) * distanceFromAnchor + tangentB.x * Math.sin(angle) * distanceFromAnchor,
        y: anchor.position.y + tangentA.y * Math.cos(angle) * distanceFromAnchor + tangentB.y * Math.sin(angle) * distanceFromAnchor,
        z: anchor.position.z + tangentA.z * Math.cos(angle) * distanceFromAnchor + tangentB.z * Math.sin(angle) * distanceFromAnchor,
      };
      const projected = projectToSurface(base.host, base.hostK, seed.x, seed.y, seed.z, 12);
      points.push({
        x: projected?.x ?? seed.x,
        y: projected?.y ?? seed.y,
        z: projected?.z ?? seed.z,
        r: settings.patternRadius * (0.42 + petal * 0.025),
        role: "motif",
      });
    }
    const patchId = index + 1;
    patterns.push({ id: patchId, shape: "coin", motifPlacement: "surface", points });
    const insidePosition = {
      x: anchor.position.x - anchor.normal.x * innerDepth,
      y: anchor.position.y - anchor.normal.y * innerDepth,
      z: anchor.position.z - anchor.normal.z * innerDepth,
    };
    const outsidePosition = {
      x: anchor.position.x + anchor.normal.x * innerDepth,
      y: anchor.position.y + anchor.normal.y * innerDepth,
      z: anchor.position.z + anchor.normal.z * innerDepth,
    };
    const insideSignedDistance = fieldSdf(base.host, base.hostK, insidePosition.x, insidePosition.y, insidePosition.z);
    const outsideSignedDistance = fieldSdf(base.host, base.hostK, outsidePosition.x, outsidePosition.y, outsidePosition.z);
    patternSides.push({
      patchId,
      surfacePosition: { ...anchor.position },
      outwardNormal: { ...anchor.normal },
      insidePosition,
      outsidePosition,
      insideSignedDistance,
      outsideSignedDistance,
      baseSideIsInside: insideSignedDistance < 0 && outsideSignedDistance > 0,
    });
  }
  return { patterns, patternSides };
}

/** Classify already-authored SKIN Surface elements without replacing them.
 * The representative point is projected back to the current metaball host;
 * the host SDF then proves which normal side contains the Base Shape. */
export function classifySkinRebuildPatternSides(
  base: SkinRebuildBase,
  patterns: Patch[],
  settingsInput: SkinRebuildSettings,
): SkinRebuildPatternSide[] {
  const settings = validateSettings({ ...settingsInput, patternCount: patterns.length });
  const initialDepth = Math.max(settings.surfaceThickness * 0.72, 0.08);
  const scaleMmPerUnit = estimatedScaleMmPerUnit(base, patterns, settings);
  const strutRadius = (settings.strutDiameterMm * 0.5) / scaleMmPerUnit;
  const requiredBaseClearance = strutRadius * 1.04;
  const sourceVoxel = (settings.targetLongestMm / scaleMmPerUnit) / settings.exportResolution;
  const requiredFusionOverlap = Math.min(
    strutRadius * 0.45,
    Math.max(0.2 / scaleMmPerUnit, sourceVoxel * 0.35),
  );
  return patterns.map((patch) => {
    if (patch.points.length === 0) throw new Error(`Surface Pattern #${patch.id} has no realized points`);
    const inverseCount = 1 / patch.points.length;
    const seed = patch.points.reduce((sum, point) => ({
      x: sum.x + point.x * inverseCount,
      y: sum.y + point.y * inverseCount,
      z: sum.z + point.z * inverseCount,
    }), { x: 0, y: 0, z: 0 });
    type AcceptedSide = Omit<SkinRebuildPatternSide, "patchId" | "baseSideIsInside">;
    const physicallyTouchesPatch = (position: Vector3Value): boolean => patch.points.some((point) =>
      length(position, point) <= point.r + strutRadius - requiredFusionOverlap + EPSILON);
    const trySeed = (
      candidate: Vector3Value,
      baseDepth: number,
      requireFullBaseClearance = true,
    ): AcceptedSide | null => {
      const projected = projectToSurface(base.host, base.hostK, candidate.x, candidate.y, candidate.z, 36);
      if (!projected) return null;
      const surfacePosition = { x: projected.x, y: projected.y, z: projected.z };
      const projectedNormal = normalize({ x: projected.nx, y: projected.ny, z: projected.nz });
      for (const direction of [1, -1] as const) {
        const outwardNormal = direction === 1
          ? projectedNormal
          : { x: -projectedNormal.x, y: -projectedNormal.y, z: -projectedNormal.z };
        for (const multiplier of [1, 1.25, 1.5, 2, 3, 4, 6]) {
          const depth = baseDepth * multiplier;
          const insidePosition = {
            x: surfacePosition.x - outwardNormal.x * depth,
            y: surfacePosition.y - outwardNormal.y * depth,
            z: surfacePosition.z - outwardNormal.z * depth,
          };
          // Graph connectivity is not enough: the final SDF must overlap a
          // realized Pattern sphere by a mesh-resolvable margin.  This keeps
          // rings and flowers (whose centroid can be an actual hole) from
          // becoming closed but detached STL components.
          if (!physicallyTouchesPatch(insidePosition)) continue;
          const outsidePosition = {
            x: surfacePosition.x + outwardNormal.x * depth,
            y: surfacePosition.y + outwardNormal.y * depth,
            z: surfacePosition.z + outwardNormal.z * depth,
          };
          const insideSignedDistance = fieldSdf(base.host, base.hostK, insidePosition.x, insidePosition.y, insidePosition.z);
          const outsideSignedDistance = fieldSdf(base.host, base.hostK, outsidePosition.x, outsidePosition.y, outsidePosition.z);
          // The Pattern-back node is also the endpoint of a real cylinder.
          // Merely proving that its centre is inside still lets half of a
          // thick strut cross the Base boundary. Pick the first attachment
          // that remains fused to Pattern material and clears the complete
          // lattice radius (plus the same numeric guard used by Stage 5A).
          if ((requireFullBaseClearance
            ? insideSignedDistance <= -requiredBaseClearance
            : insideSignedDistance < 0) && outsideSignedDistance > 0) {
            return {
              surfacePosition,
              outwardNormal,
              insidePosition,
              outsidePosition,
              insideSignedDistance,
              outsideSignedDistance,
            };
          }
        }
      }
      return null;
    };

    // Preserve the historical centroid/back-centre placement whenever it
    // already touches material (coins and filled motifs stay byte-stable).
    let accepted = trySeed(seed, initialDepth);
    if (!accepted) {
      const attachmentDepth = Math.max(requiredFusionOverlap * 1.25, strutRadius * 0.3, 1e-4);
      const materialCandidates = [...patch.points].sort((first, second) =>
        length(first, seed) - length(second, seed) || second.r - first.r);
      for (const point of materialCandidates) {
        accepted = trySeed(point, attachmentDepth);
        if (accepted) break;
      }
      // A narrow ring or lace stroke may not overlap an anchor that is a
      // complete radius inside the Base. Preserve its physically fused
      // attachment as an explicit exception; filled coins and ordinary
      // motifs have already taken the stricter path above.
      if (!accepted) accepted = trySeed(seed, initialDepth, false);
      if (!accepted) {
        for (const point of materialCandidates) {
          accepted = trySeed(point, attachmentDepth, false);
          if (accepted) break;
        }
      }
    }
    if (!accepted) {
      throw new Error(`Surface Pattern #${patch.id} could not make a physical inside attachment to its realized material`);
    }
    return { patchId: patch.id, ...accepted, baseSideIsInside: true };
  });
}

class GraphBuilder {
  readonly nodes: InternalStructureNode[] = [];
  readonly edges: InternalStructureEdge[] = [];
  private readonly nodeKeys = new Map<string, number>();
  private readonly exactNodeKeys = new Map<string, number>();
  private readonly edgeKeys = new Set<string>();

  constructor(private readonly radius: number) {}

  private exactNodeKey(position: Vector3Value): string {
    return `${position.x.toPrecision(16)},${position.y.toPrecision(16)},${position.z.toPrecision(16)}`;
  }

  addNode(position: Vector3Value): number {
    const exactKey = this.exactNodeKey(position);
    const exactExisting = this.exactNodeKeys.get(exactKey);
    if (exactExisting !== undefined) return exactExisting;
    const quantum = Math.max(this.radius * 0.25, 1e-6);
    const key = `${Math.round(position.x / quantum)},${Math.round(position.y / quantum)},${Math.round(position.z / quantum)}`;
    const existing = this.nodeKeys.get(key);
    if (existing !== undefined) {
      this.exactNodeKeys.set(exactKey, existing);
      return existing;
    }
    const id = this.nodes.length;
    this.nodes.push({ id, position: { ...position }, radius: this.radius });
    this.nodeKeys.set(key, id);
    this.exactNodeKeys.set(exactKey, id);
    return id;
  }

  /** Route vertices must not snap to a merely-nearby vertex.  Such a snap can
   * turn an analytically printable 45-degree leg into a steeper actual edge.
   * Exact endpoints still reuse Pattern-back anchors and shared elbows. */
  addRouteNode(position: Vector3Value): number {
    const exactKey = this.exactNodeKey(position);
    const existing = this.exactNodeKeys.get(exactKey);
    if (existing !== undefined) return existing;
    const id = this.nodes.length;
    this.nodes.push({ id, position: { ...position }, radius: this.radius });
    this.exactNodeKeys.set(exactKey, id);
    return id;
  }

  addEdge(start: number, end: number): boolean {
    if (start === end || !this.nodes[start] || !this.nodes[end]) return false;
    const key = start < end ? `${start}:${end}` : `${end}:${start}`;
    if (this.edgeKeys.has(key)) return false;
    const id = this.edges.length;
    this.edges.push({ id, start, end, radius: this.radius });
    this.edgeKeys.add(key);
    return true;
  }

  appendGraph(graph: InternalStructureGraph): void {
    const remap = graph.nodes.map((node) => this.addRouteNode(node.position));
    for (const edge of graph.edges) {
      const start = remap[edge.start];
      const end = remap[edge.end];
      if (start !== undefined && end !== undefined) this.addEdge(start, end);
    }
  }

  checkpoint(): { nodeCount: number; edgeCount: number } {
    return { nodeCount: this.nodes.length, edgeCount: this.edges.length };
  }

  restore(checkpoint: { nodeCount: number; edgeCount: number }): void {
    this.nodes.length = checkpoint.nodeCount;
    this.edges.length = checkpoint.edgeCount;
    this.nodeKeys.clear();
    this.exactNodeKeys.clear();
    this.edgeKeys.clear();
    for (const node of this.nodes) this.exactNodeKeys.set(this.exactNodeKey(node.position), node.id);
    for (const edge of this.edges) {
      this.edgeKeys.add(edge.start < edge.end ? `${edge.start}:${edge.end}` : `${edge.end}:${edge.start}`);
    }
  }

  graph(kind: InternalStructureGraph["kind"] = "targetedGrid"): InternalStructureGraph {
    return {
      kind,
      nodes: this.nodes.map((node) => ({ ...node, position: { ...node.position } })),
      edges: this.edges.map((edge) => ({ ...edge })),
      stats: {
        inputPoints: this.nodes.length,
        delaunayTetrahedra: 0,
        candidateEdges: this.edges.length,
        clippedEdges: 0,
        removedShortEdges: 0,
        removedOutsideEdges: 0,
        removedIsolatedEdges: 0,
        requestedTargets: 0,
        connectedTargets: 0,
        gridNodeCount: this.nodes.length,
        gridEdgeCount: this.edges.length,
      },
    };
  }
}

function estimatedScaleMmPerUnit(base: SkinRebuildBase, patterns: Patch[], settings: SkinRebuildSettings): number {
  const bounds = computeSkinSamplingBounds(base.host, base.hostK, settings.surfaceThickness, patterns);
  return settings.targetLongestMm / Math.max(bounds.longest, EPSILON);
}

/** Radius-volume weighted centroid of the authored metaball Base. */
export function skinRebuildBaseCentroid(base: SkinRebuildBase): Vector3Value {
  let weightSum = 0;
  const weighted = { x: 0, y: 0, z: 0 };
  for (const ball of base.host) {
    const weight = Math.max(EPSILON, ball.r ** 3);
    weightSum += weight;
    weighted.x += ball.x * weight;
    weighted.y += ball.y * weight;
    weighted.z += ball.z * weight;
  }
  return weightSum > 0
    ? { x: weighted.x / weightSum, y: weighted.y / weightSum, z: weighted.z / weightSum }
    : { x: 0, y: 0, z: 0 };
}

/** The Pattern inside direction is the opposite of its Base-derived outward
 * normal.  The build plate is below the model, so a negative inside Z means
 * that a red face needs a permanent spider contact.  This local orientation
 * test replaces the former whole-model upper/lower centroid split. */
export function skinRebuildInwardNormalPointsTowardPlate(side: SkinRebuildPatternSide): boolean {
  return -side.outwardNormal.z < -1e-6;
}

export function skinRebuildRequiresSpiderSupport(
  point: SkinRebuildLowestPoint,
  side: SkinRebuildPatternSide | undefined,
): boolean {
  return point.needsSupport && side !== undefined && skinRebuildInwardNormalPointsTowardPlate(side);
}

export function skinRebuildSpiderSupportTargetIds(
  patternSides: readonly SkinRebuildPatternSide[],
  lowestPoints: readonly SkinRebuildLowestPoint[],
): number[] {
  const sideByPatch = new Map(patternSides.map((side) => [side.patchId, side]));
  return lowestPoints
    .filter((point) => skinRebuildRequiresSpiderSupport(point, sideByPatch.get(point.patchId)))
    .map((point) => point.patchId)
    .sort((first, second) => first - second);
}

function constrainRoutePointInsideBase(
  base: SkinRebuildBase,
  point: Vector3Value,
  clearance: number,
): Vector3Value {
  if (fieldSdf(base.host, base.hostK, point.x, point.y, point.z) <= -clearance) return point;

  // Prefer an inward correction on the same print layer.  Moving a route
  // point along Z after the 45-degree bridge was laid out can turn an
  // otherwise printable member horizontal.  A same-Z binary search keeps
  // that contract intact while pulling a protruding point back into the
  // authored metaball Base.
  const centroid = skinRebuildBaseCentroid(base);
  const sameLayerSeeds = [
    { x: centroid.x, y: centroid.y, z: point.z },
    ...base.host.map((ball) => ({ x: ball.x, y: ball.y, z: point.z })),
  ].map((candidate) => ({
    candidate,
    distance: fieldSdf(base.host, base.hostK, candidate.x, candidate.y, candidate.z),
  })).sort((first, second) => first.distance - second.distance);
  const insideSeed = sameLayerSeeds.find((candidate) => candidate.distance <= -clearance)?.candidate;
  if (insideSeed) {
    let inside = insideSeed;
    let outside = point;
    for (let iteration = 0; iteration < 36; iteration++) {
      const middle = lerp(inside, outside, 0.5);
      if (fieldSdf(base.host, base.hostK, middle.x, middle.y, middle.z) <= -clearance) inside = middle;
      else outside = middle;
    }
    return inside;
  }

  // A strongly tilted/imported Base may not intersect this exact print
  // layer. Fall back to the nearest surface normal instead of allowing the
  // member to remain outside; the caller still rechecks the final angle.
  const projected = projectToSurface(base.host, base.hostK, point.x, point.y, point.z, 36);
  if (!projected) return point;
  const normal = normalize({ x: projected.nx, y: projected.ny, z: projected.nz });
  return {
    x: projected.x - normal.x * clearance,
    y: projected.y - normal.y * clearance,
    z: projected.z - normal.z * clearance,
  };
}

interface SkinRebuildLatticeAttachmentSite {
  position: Vector3Value;
  patternSdf: (x: number, y: number, z: number) => number;
}

function skinRebuildLatticeAttachmentSites(
  patterns: readonly Patch[],
  patternSides: readonly SkinRebuildPatternSide[],
  roundK: number,
): SkinRebuildLatticeAttachmentSite[] {
  const patternById = new Map(patterns.map((pattern) => [pattern.id, pattern]));
  return patternSides.flatMap((side) => {
    const pattern = patternById.get(side.patchId);
    return pattern ? [{
      position: side.insidePosition,
      patternSdf: createPatchesSdfEvaluator([pattern], roundK),
    }] : [];
  });
}

function skinRebuildGraphPatternAttachmentSites(
  patterns: readonly Patch[],
  graph: InternalStructureGraph,
  roundK: number,
): SkinRebuildLatticeAttachmentSite[] {
  if (patterns.length === 0 || graph.nodes.length === 0) return [];
  const patternSdf = createPatchesSdfEvaluator(patterns, roundK);
  return graph.nodes.flatMap((node) => patternSdf(
    node.position.x,
    node.position.y,
    node.position.z,
  ) <= node.radius * 0.5 ? [{ position: node.position, patternSdf }] : []);
}

function sampledLatticeEdgeBaseExcess(
  base: SkinRebuildBase,
  nodes: readonly InternalStructureNode[],
  edge: InternalStructureEdge,
  attachmentSites: readonly SkinRebuildLatticeAttachmentSite[] = [],
): { maximumExcessSource: number; sampleCount: number } {
  const start = nodes[edge.start]?.position;
  const end = nodes[edge.end]?.position;
  if (!start || !end || !(edge.radius > 0)) {
    return { maximumExcessSource: Number.POSITIVE_INFINITY, sampleCount: 0 };
  }
  // Five samples per member radius catches a curved Base boundary between
  // route vertices without multiplying the graph used by Stage 6 meshing.
  const sampleStep = Math.max(edge.radius * 0.2, 1e-4);
  const intervals = Math.max(2, Math.min(512, Math.ceil(length(start, end) / sampleStep)));
  const incidentAttachments = attachmentSites.filter((site) =>
    length(site.position, start) <= 1e-6 || length(site.position, end) <= 1e-6);
  let maximumExcessSource = Number.NEGATIVE_INFINITY;
  for (let index = 0; index <= intervals; index++) {
    const point = lerp(start, end, index / intervals);
    const baseDistance = fieldSdf(base.host, base.hostK, point.x, point.y, point.z);
    // Only the short end of an edge that is actually incident to its own
    // classified Pattern-back anchor receives a fusion exemption. A nearby
    // unrelated Pattern cannot hide an exposed route. This is the distinction
    // missed by the former centreline-only screen in the reported lower leg.
    const attachmentAllowed = incidentAttachments.some((site) =>
      length(point, site.position) <= edge.radius * 1.25
      && site.patternSdf(point.x, point.y, point.z) <= edge.radius * 0.9);
    const containingExcess = attachmentAllowed
      ? Math.min(baseDistance + edge.radius, -EPSILON)
      : baseDistance + edge.radius;
    maximumExcessSource = Math.max(
      maximumExcessSource,
      containingExcess,
    );
  }
  return { maximumExcessSource, sampleCount: intervals + 1 };
}

/** Audit the visible cylinder, rather than only its centreline. */
export function auditSkinRebuildLatticeBaseContainment(
  base: SkinRebuildBase,
  patterns: Patch[],
  patternSides: SkinRebuildPatternSide[],
  graph: InternalStructureGraph,
  settingsInput: SkinRebuildSettings,
): SkinRebuildLatticeBaseContainment {
  const settings = validateSettings({ ...settingsInput, patternCount: patterns.length });
  const scaleMmPerUnit = estimatedScaleMmPerUnit(base, patterns, settings);
  const attachmentSites = [
    ...skinRebuildLatticeAttachmentSites(patterns, patternSides, settings.roundK),
    ...skinRebuildGraphPatternAttachmentSites(patterns, graph, settings.roundK),
  ];
  const outsideEdgeIds: number[] = [];
  let checkedSampleCount = 0;
  let maximumExcessSource = Number.NEGATIVE_INFINITY;
  for (const edge of graph.edges) {
    const sampled = sampledLatticeEdgeBaseExcess(base, graph.nodes, edge, attachmentSites);
    checkedSampleCount += sampled.sampleCount;
    maximumExcessSource = Math.max(maximumExcessSource, sampled.maximumExcessSource);
    if (sampled.maximumExcessSource > 1e-6) outsideEdgeIds.push(edge.id);
  }
  return {
    contained: outsideEdgeIds.length === 0,
    checkedEdgeCount: graph.edges.length,
    checkedSampleCount,
    outsideEdgeIds,
    maximumExcessMm: Number.isFinite(maximumExcessSource) ? maximumExcessSource * scaleMmPerUnit : 0,
  };
}

function builderEdgeRangeStaysInsideBase(
  base: SkinRebuildBase,
  builder: GraphBuilder,
  firstEdgeIndex: number,
  attachmentSites: readonly SkinRebuildLatticeAttachmentSite[],
): boolean {
  for (let index = firstEdgeIndex; index < builder.edges.length; index++) {
    if (sampledLatticeEdgeBaseExcess(base, builder.nodes, builder.edges[index], attachmentSites).maximumExcessSource > 1e-6) {
      return false;
    }
  }
  return true;
}

export function buildSkinRebuildDryWeb(
  base: SkinRebuildBase,
  patterns: Patch[],
  patternSides: SkinRebuildPatternSide[],
  settingsInput: SkinRebuildSettings,
): InternalStructureGraph {
  const settings = validateSettings(settingsInput);
  const scaleMmPerUnit = estimatedScaleMmPerUnit(base, patterns, settings);
  const strutRadius = (settings.strutDiameterMm * 0.5) / scaleMmPerUnit;
  const builder = new GraphBuilder(strutRadius);
  const nodeIds = patternSides.map((side) => builder.addNode(side.insidePosition));
  if (nodeIds.length <= 1) return builder.graph();

  // Deterministic Euclidean MST: one connected inner web before extra loops.
  const used = new Set<number>([0]);
  while (used.size < nodeIds.length) {
    let best: { from: number; to: number; distance: number } | null = null;
    for (const from of used) {
      for (let to = 0; to < nodeIds.length; to++) {
        if (used.has(to)) continue;
        const candidate = length(patternSides[from].insidePosition, patternSides[to].insidePosition);
        if (!best || candidate < best.distance - EPSILON
          || (Math.abs(candidate - best.distance) <= EPSILON && (from < best.from || (from === best.from && to < best.to)))) {
          best = { from, to, distance: candidate };
        }
      }
    }
    if (!best) break;
    builder.addEdge(nodeIds[best.from], nodeIds[best.to]);
    used.add(best.to);
  }

  // Add local loops so the inside reads and behaves as a web, not a tree.
  for (let index = 0; index < patternSides.length; index++) {
    const neighbours = patternSides
      .map((side, candidate) => ({ candidate, distance: length(patternSides[index].insidePosition, side.insidePosition) }))
      .filter(({ candidate }) => candidate !== index)
      .sort((a, b) => a.distance - b.distance || a.candidate - b.candidate)
      .slice(0, 3);
    for (const neighbour of neighbours) builder.addEdge(nodeIds[index], nodeIds[neighbour.candidate]);
  }
  return builder.graph();
}

function trianglesToBuffers(triangles: readonly Triangle[]): { positions: Float32Array; normals: Float32Array } {
  const positions = new Float32Array(triangles.length * 9);
  const normals = new Float32Array(triangles.length * 9);
  let offset = 0;
  for (const triangle of triangles) {
    const ab = { x: triangle.b.x - triangle.a.x, y: triangle.b.y - triangle.a.y, z: triangle.b.z - triangle.a.z };
    const ac = { x: triangle.c.x - triangle.a.x, y: triangle.c.y - triangle.a.y, z: triangle.c.z - triangle.a.z };
    const normal = normalize({
      x: ab.y * ac.z - ab.z * ac.y,
      y: ab.z * ac.x - ab.x * ac.z,
      z: ab.x * ac.y - ab.y * ac.x,
    });
    for (const point of [triangle.a, triangle.b, triangle.c]) {
      positions[offset] = point.x;
      positions[offset + 1] = point.y;
      positions[offset + 2] = point.z;
      normals[offset] = normal.x;
      normals[offset + 1] = normal.y;
      normals[offset + 2] = normal.z;
      offset += 3;
    }
  }
  return { positions, normals };
}

function analysisMesh(
  base: SkinRebuildBase,
  patterns: Patch[],
  dryWeb: InternalStructureGraph,
  settings: SkinRebuildSettings,
): SkinMeshResult {
  return buildSkinMesh(
    "plate",
    base.host,
    base.hostK,
    settings.surfaceThickness,
    patterns,
    settings.roundK,
    { resolution: settings.analysisResolution, targetLongestMm: settings.targetLongestMm },
    0,
    0,
    0,
    dryWeb,
  );
}

export function findSkinRebuildLowestPoints(
  base: SkinRebuildBase,
  patterns: Patch[],
  patternSides: SkinRebuildPatternSide[],
  dryWeb: InternalStructureGraph,
  settingsInput: SkinRebuildSettings,
  meshInput?: SkinMeshResult,
  options: SkinRebuildLowestPointOptions = {},
): SkinRebuildLowestPointDiagnosis {
  const settings = validateSettings(settingsInput);
  const mesh = meshInput ?? analysisMesh(base, patterns, dryWeb, settings);
  const oriented = orientMeshForSavedStl(mesh);
  const buffers = trianglesToBuffers(oriented.triangles);
  const meshStep = oriented.sourceBounds.longest / settings.analysisResolution;
  const finalMarkers = findMotifMeshLowestPoints(
    buffers.positions,
    patterns,
    dryWeb,
    meshStep,
    settings.roundK,
    buffers.normals,
    { onProgress: options.onProgress },
  );
  const sourceMarkers = findMotifLowestPoints(patterns, dryWeb, meshStep * 1.75);
  const sourceByPatch = new Map(sourceMarkers.map((marker) => [marker.patchId, marker]));
  const finalByPatch = new Map(finalMarkers.map((marker) => [marker.patchId, marker]));
  const sideByPatch = new Map(patternSides.map((side) => [side.patchId, side]));
  const allZ = [...finalMarkers, ...sourceMarkers].map((marker) => marker.position.z);
  const plateFloor = allZ.length > 0 ? Math.min(...allZ) : oriented.sourceBounds.min.z;
  const plateBand = Math.max(meshStep * 2.5, settings.patternRadius * 0.55);
  const lowestPoints: SkinRebuildLowestPoint[] = [];
  for (const patch of patterns) {
    const marker = finalByPatch.get(patch.id) ?? sourceByPatch.get(patch.id);
    const side = sideByPatch.get(patch.id);
    if (!marker || !side) continue;
    const normal = normalize(marker.normal ?? side.outwardNormal);
    const overhangAngleDeg = surfaceOverhangAngleDeg(normal);
    const plateContact = marker.position.z <= plateFloor + plateBand;
    lowestPoints.push({
      patchId: patch.id,
      position: { ...marker.position },
      normal,
      overhangAngleDeg,
      plateContact,
      needsSupport: !plateContact && overhangAngleDeg + 1e-6 >= settings.overhangThresholdDeg,
      basis: marker.basis,
    });
  }
  const overhang = detectSkinRebuildOverhangRegions(
    oriented.triangles,
    settings.overhangThresholdDeg,
    plateFloor,
    plateBand,
  );
  return {
    mesh,
    meshPositions: buffers.positions,
    meshNormals: buffers.normals,
    lowestPoints,
    overhang,
  };
}

function edgeAngleFromVerticalDeg(a: Vector3Value, b: Vector3Value): number {
  const vertical = Math.abs(b.z - a.z);
  return Math.atan2(horizontalDistance(a, b), Math.max(vertical, EPSILON)) * 180 / Math.PI;
}

function pathWithMaximumSegment(
  builder: GraphBuilder,
  start: Vector3Value,
  end: Vector3Value,
  maximumSegmentSource: number,
  constrainInterior?: (point: Vector3Value) => Vector3Value,
): { segments: number; maximumAngleDeg: number } {
  const total = length(start, end);
  // At least one interior waypoint is required when the Base constraint is
  // active; otherwise a short concave chord could leave the Base even though
  // both endpoints are valid inside anchors.
  const segments = Math.max(constrainInterior ? 2 : 1, Math.ceil(total / Math.max(maximumSegmentSource, EPSILON)));
  let previous = builder.addRouteNode(start);
  let maximumAngleDeg = 0;
  for (let index = 1; index <= segments; index++) {
    // Preserve the caller's exact endpoint identity.  The arithmetically
    // equivalent lerp(t=1) can differ by a few ulps and would otherwise form
    // a visually coincident but topologically separate final node.
    const rawPosition = index === segments ? end : lerp(start, end, index / segments);
    const position = index === segments || index === 0 || !constrainInterior
      ? rawPosition
      : constrainInterior(rawPosition);
    const next = builder.addRouteNode(position);
    builder.addEdge(previous, next);
    maximumAngleDeg = Math.max(maximumAngleDeg, edgeAngleFromVerticalDeg(builder.nodes[previous].position, builder.nodes[next].position));
    previous = next;
  }
  return { segments, maximumAngleDeg };
}

/** An explicit no-DryWeb input.  Keeping the ordinary graph shape means old
 * v1 .fkei readers can still round-trip a REBUILD project while the lattice
 * itself becomes the only permanent connector. */
export function createEmptySkinRebuildGraph(): InternalStructureGraph {
  return new GraphBuilder(0.01).graph();
}

function pathWithPrintableBridge(
  builder: GraphBuilder,
  start: Vector3Value,
  end: Vector3Value,
  maximumSegmentSource: number,
  webCenterZ: number,
  constrainInterior?: (point: Vector3Value) => Vector3Value,
  invertBridgeDirection = false,
): { segments: number; maximumAngleDeg: number } {
  const directAngle = edgeAngleFromVerticalDeg(start, end);
  if (directAngle <= 45 + 1e-6) {
    return pathWithMaximumSegment(builder, start, end, maximumSegmentSource, constrainInterior);
  }

  // Two 45-degree-safe legs meet toward the middle of the model.  Picking a
  // valley for the upper half and an apex for the lower half keeps the elbow
  // in the useful inner volume instead of always sending it above the model.
  const horizontal = horizontalDistance(start, end);
  const midpoint = {
    x: (start.x + end.x) * 0.5,
    y: (start.y + end.y) * 0.5,
    z: 0,
  };
  const preferValley = (start.z + end.z) * 0.5 >= webCenterZ;
  const useValley = invertBridgeDirection ? !preferValley : preferValley;
  midpoint.z = useValley
    ? Math.min(start.z, end.z) - horizontal * 0.56
    : Math.max(start.z, end.z) + horizontal * 0.56;
  const constrainedMidpoint = constrainInterior ? constrainInterior(midpoint) : midpoint;
  const first = pathWithMaximumSegment(builder, start, constrainedMidpoint, maximumSegmentSource, constrainInterior);
  const second = pathWithMaximumSegment(builder, constrainedMidpoint, end, maximumSegmentSource, constrainInterior);
  return {
    segments: first.segments + second.segments,
    maximumAngleDeg: Math.max(first.maximumAngleDeg, second.maximumAngleDeg),
  };
}

/** Retry only a geometrically difficult route with finer interior waypoints.
 * Ordinary members retain the 12 mm ceiling; a route rejected by the full
 * radius Base screen is locally refined down to 1.5 mm instead of weakening
 * containment or globally multiplying every Stage 6 field primitive. */
function pathWithContainedPrintableBridge(
  builder: GraphBuilder,
  base: SkinRebuildBase,
  attachmentSites: readonly SkinRebuildLatticeAttachmentSite[],
  start: Vector3Value,
  end: Vector3Value,
  maximumSegmentSource: number,
  webCenterZ: number,
  constrainInterior: (point: Vector3Value) => Vector3Value,
): { segments: number; maximumAngleDeg: number } | null {
  for (const refinement of [1, 0.5, 0.25, 0.125]) {
    // A lower bridge is natural in the upper half of the object and an upper
    // bridge in the lower half, but a concave Base can make that preferred
    // elbow leave the available inner volume. Try the mirrored elbow before
    // declaring the same pair impossible; this keeps every cylinder inside
    // without weakening the 45-degree contract.
    for (const invertBridgeDirection of [false, true]) {
      const checkpoint = builder.checkpoint();
      const route = pathWithPrintableBridge(
        builder,
        start,
        end,
        maximumSegmentSource * refinement,
        webCenterZ,
        constrainInterior,
        invertBridgeDirection,
      );
      if (route.maximumAngleDeg <= 45 + 1e-5
        && builderEdgeRangeStaysInsideBase(base, builder, checkpoint.edgeCount, attachmentSites)) {
        return route;
      }
      builder.restore(checkpoint);
    }
  }
  return null;
}

function graphComponentsContaining(
  nodeCount: number,
  edges: readonly InternalStructureEdge[],
  requiredNodeIds: readonly number[],
): number[][] {
  const neighbours = Array.from({ length: nodeCount }, () => [] as number[]);
  for (const edge of edges) {
    neighbours[edge.start]?.push(edge.end);
    neighbours[edge.end]?.push(edge.start);
  }
  const required = new Set(requiredNodeIds);
  const remaining = new Set(requiredNodeIds);
  const components: number[][] = [];
  while (remaining.size > 0) {
    const seed = Math.min(...remaining);
    const seen = new Set<number>([seed]);
    const queue = [seed];
    const component: number[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (required.has(current)) component.push(current);
      for (const next of neighbours[current] ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    for (const id of component) remaining.delete(id);
    components.push(component.sort((a, b) => a - b));
  }
  return components.sort((a, b) => b.length - a.length || a[0] - b[0]);
}

function graphNodeComponentIds(
  nodeCount: number,
  edges: readonly InternalStructureEdge[],
): Int32Array {
  const neighbours = Array.from({ length: nodeCount }, () => [] as number[]);
  for (const edge of edges) {
    if (!neighbours[edge.start] || !neighbours[edge.end]) continue;
    neighbours[edge.start].push(edge.end);
    neighbours[edge.end].push(edge.start);
  }
  const componentIds = new Int32Array(nodeCount).fill(-1);
  let componentId = 0;
  for (let seed = 0; seed < nodeCount; seed++) {
    if (componentIds[seed] >= 0) continue;
    componentIds[seed] = componentId;
    const queue = [seed];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of neighbours[current]) {
        if (componentIds[next] >= 0) continue;
        componentIds[next] = componentId;
        queue.push(next);
      }
    }
    componentId++;
  }
  return componentIds;
}

export function skinRebuildDisconnectedPatternIds(
  patternSides: SkinRebuildPatternSide[],
  graph: InternalStructureGraph,
): number[] {
  const anchorNodeByPatch = new Map<number, number>();
  for (const side of patternSides) {
    const node = graph.nodes.find((candidate) => length(candidate.position, side.insidePosition) <= 1e-6);
    if (node) anchorNodeByPatch.set(side.patchId, node.id);
  }
  const missing = patternSides.filter((side) => !anchorNodeByPatch.has(side.patchId)).map((side) => side.patchId);
  const components = graphComponentsContaining(graph.nodes.length, graph.edges, [...anchorNodeByPatch.values()]);
  const connected = new Set(components[0] ?? []);
  return [...missing, ...patternSides
    .filter((side) => {
      const nodeId = anchorNodeByPatch.get(side.patchId);
      return nodeId !== undefined && !connected.has(nodeId);
    })
    .map((side) => side.patchId)]
    .sort((first, second) => first - second);
}

export function buildSkinRebuildLattice(
  base: SkinRebuildBase,
  patterns: Patch[],
  patternSides: SkinRebuildPatternSide[],
  lowestPoints: SkinRebuildLowestPoint[],
  settingsInput: SkinRebuildSettings,
  options: {
    existingLattice?: InternalStructureGraph;
    existingConnections?: SkinRebuildLatticeConnection[];
    incremental?: boolean;
    /** Maximum logical routes emitted by this call. */
    maximumRoutes?: number;
    /** Restrict the support pass to these selected red-face Pattern ids. */
    targetPatchIds?: readonly number[];
    /** Prefer connectivity repair for components containing these Patterns. */
    preferredConnectivityPatchIds?: readonly number[];
    mode?: "auto" | "support-only" | "connectivity-only";
  } = {},
): {
  lattice: InternalStructureGraph;
  connections: SkinRebuildLatticeConnection[];
  containment: SkinRebuildLatticeBaseContainment;
  connectivityLoopCount: number;
  supportLoopCount: number;
  disconnectedPatternIds: number[];
  unsupportedTargetIds: number[];
  addedSupportCount: number;
  fallbackSupportCount: number;
  addedConnectivityCount: number;
} {
  const settings = validateSettings(settingsInput);
  const scaleMmPerUnit = estimatedScaleMmPerUnit(base, patterns, settings);
  const strutRadius = (settings.strutDiameterMm * 0.5) / scaleMmPerUnit;
  const attachmentSites = skinRebuildLatticeAttachmentSites(patterns, patternSides, settings.roundK);
  // The capsule SDF represents a long straight member exactly; five-mm
  // chopping only multiplied field primitives and Stage 6 voxel work. A
  // 12-mm ceiling still supplies interior waypoints for Base containment
  // while materially reducing the artwork mesh workload.
  const maximumSegmentSource = 12 / scaleMmPerUnit;
  const builder = new GraphBuilder(strutRadius);
  if (options.existingLattice) {
    const existingContainment = auditSkinRebuildLatticeBaseContainment(
      base,
      patterns,
      patternSides,
      options.existingLattice,
      settings,
    );
    if (!existingContainment.contained) {
      throw new Error(`既存ラティスの太さがBase外へ${existingContainment.outsideEdgeIds.length}線出ています。工程4から再生成してください`);
    }
    builder.appendGraph(options.existingLattice);
  }
  const sideByPatch = new Map(patternSides.map((side) => [side.patchId, side]));
  const connections: SkinRebuildLatticeConnection[] = [...(options.existingConnections ?? [])];
  const alreadySupported = new Set(connections.map((connection) => connection.targetPatchId));
  const mode = options.mode ?? "auto";
  const routeBudget = Math.max(0, Math.floor(options.maximumRoutes
    ?? (options.incremental ? 1 : Number.MAX_SAFE_INTEGER)));
  let routesAdded = 0;
  let addedSupportCount = 0;
  let fallbackSupportCount = 0;
  let addedConnectivityCount = 0;
  // The previous centreline-only allowance (at most 0.0005 source units)
  // let a 2.6 mm cylinder protrude through the authored Base even though its
  // axis itself was inside.  Erode the Base by the complete member radius,
  // plus a small numeric guard, so the visible cylinder is contained too.
  // Pattern-back anchors already overlap realized motif material; attachment
  // remains through those anchors rather than an exposed near-surface axis.
  const centerlineClearance = strutRadius * 1.04;
  const constrainInterior = (point: Vector3Value): Vector3Value =>
    constrainRoutePointInsideBase(base, point, centerlineClearance);
  const webCenterZ = patternSides.length > 0
    ? patternSides.reduce((sum, side) => sum + side.insidePosition.z, 0) / patternSides.length
    : 0;
  const anchorNodeByPatch = new Map(patternSides.map((side) => [side.patchId, builder.addRouteNode(side.insidePosition)]));

  // Unsupported targets are retried with a wider (but still genuinely
  // opposing) normal cone.  The loop is finite and stops when no target was
  // added, so malformed imported geometry can still be recorded honestly.
  const allPendingTargets = new Map(
    lowestPoints
      .filter((point) => skinRebuildRequiresSpiderSupport(point, sideByPatch.get(point.patchId))
        && !alreadySupported.has(point.patchId))
      .map((point) => [point.patchId, point]),
  );
  const selectedTargetIds = options.targetPatchIds ? new Set(options.targetPatchIds) : null;
  const pendingTargets = new Map([...allPendingTargets]
    .filter(([patchId]) => selectedTargetIds === null || selectedTargetIds.has(patchId)));
  let supportLoopCount = 0;
  let incrementalTargetAdded = false;
  for (const oppositionLimit of [-0.35, -0.12, 0.35, 1.01]) {
    if (mode === "connectivity-only" || pendingTargets.size === 0 || routesAdded >= routeBudget) break;
    supportLoopCount++;
    let progress = 0;
    for (const target of [...pendingTargets.values()].sort((a, b) => a.patchId - b.patchId)) {
    const targetSide = sideByPatch.get(target.patchId);
    if (!targetSide) continue;
    const targetInside = constrainInterior({
      x: target.position.x - target.normal.x * Math.max(strutRadius * 0.8, 0.04),
      y: target.position.y - target.normal.y * Math.max(strutRadius * 0.8, 0.04),
      z: target.position.z - target.normal.z * Math.max(strutRadius * 0.8, 0.04),
    });
    const opposingCandidates = patternSides
      .filter((side) => side.patchId !== target.patchId)
      .map((side) => ({
        side,
        normalDot: dot(targetSide.outwardNormal, side.outwardNormal),
        distance: length(targetInside, side.insidePosition),
      }))
      .filter((candidate) => candidate.normalDot <= oppositionLimit)
      .sort((a, b) => a.distance - b.distance || a.normalDot - b.normalDot || a.side.patchId - b.side.patchId);
      let accepted: {
        opposing: typeof opposingCandidates[number];
        targetBackLeg: { segments: number; maximumAngleDeg: number };
        opposingBackLeg: { segments: number; maximumAngleDeg: number };
        maximumEdgeAngleDeg: number;
        fallback: boolean;
      } | null = null;
      for (const opposing of opposingCandidates) {
        const checkpoint = builder.checkpoint();
        const targetBackLeg = pathWithContainedPrintableBridge(
          builder,
          base,
          attachmentSites,
          targetInside,
          targetSide.insidePosition,
          maximumSegmentSource,
          webCenterZ,
          constrainInterior,
        );
        const opposingBackLeg = targetBackLeg ? pathWithContainedPrintableBridge(
          builder,
          base,
          attachmentSites,
          targetSide.insidePosition,
          opposing.side.insidePosition,
          maximumSegmentSource,
          webCenterZ,
          constrainInterior,
        ) : null;
        if (!targetBackLeg || !opposingBackLeg) {
          builder.restore(checkpoint);
          continue;
        }
        const maximumEdgeAngleDeg = Math.max(targetBackLeg.maximumAngleDeg, opposingBackLeg.maximumAngleDeg);
        accepted = { opposing, targetBackLeg, opposingBackLeg, maximumEdgeAngleDeg, fallback: false };
        break;
      }
      if (!accepted && builder.edges.length > 0) {
        // A mature spider web can already connect every Pattern back even
        // though no new two-Pattern chord fits a deep concavity.  In that
        // case the physical support only needs to join the selected surface
        // contact to any point of a component that already contains another
        // Pattern back.  Retrying only Pattern anchors caused valid N-1/N
        // projects (including the author's Pattern #5) to remain blocked.
        //
        // Existing route nodes are useful candidates because long members
        // have already been subdivided at Base-safe points.  Every attempted
        // fallback still goes through the same <=45 degree bridge generator
        // and full-radius Base containment screen; this does not weaken the
        // print contract or add an outside-the-Base exception.
        const componentIds = graphNodeComponentIds(builder.nodes.length, builder.edges);
        const rootsByComponent = new Map<number, SkinRebuildPatternSide[]>();
        for (const side of patternSides) {
          if (side.patchId === target.patchId) continue;
          const anchorNode = anchorNodeByPatch.get(side.patchId);
          if (anchorNode === undefined) continue;
          const componentId = componentIds[anchorNode];
          if (componentId < 0) continue;
          const roots = rootsByComponent.get(componentId) ?? [];
          roots.push(side);
          rootsByComponent.set(componentId, roots);
        }
        const fallbackCandidates = builder.nodes.flatMap((node) => {
          const roots = rootsByComponent.get(componentIds[node.id]);
          if (!roots?.length || length(targetInside, node.position) <= 1e-7) return [];
          const rootSide = [...roots].sort((first, second) => {
            const firstDot = dot(targetSide.outwardNormal, first.outwardNormal);
            const secondDot = dot(targetSide.outwardNormal, second.outwardNormal);
            return firstDot - secondDot
              || length(node.position, first.insidePosition) - length(node.position, second.insidePosition)
              || first.patchId - second.patchId;
          })[0];
          return [{
            node,
            rootSide,
            normalDot: dot(targetSide.outwardNormal, rootSide.outwardNormal),
            distance: length(targetInside, node.position),
            belowTarget: node.position.z <= targetInside.z + EPSILON,
          }];
        }).sort((first, second) => {
          const firstBelow = first.belowTarget ? 0 : 1;
          const secondBelow = second.belowTarget ? 0 : 1;
          return firstBelow - secondBelow
            || first.distance - second.distance
            || first.normalDot - second.normalDot
            || first.node.id - second.node.id;
        }).slice(0, 192);
        for (const candidate of fallbackCandidates) {
          const checkpoint = builder.checkpoint();
          const route = pathWithContainedPrintableBridge(
            builder,
            base,
            attachmentSites,
            targetInside,
            candidate.node.position,
            maximumSegmentSource,
            webCenterZ,
            constrainInterior,
          );
          if (!route) {
            builder.restore(checkpoint);
            continue;
          }
          accepted = {
            opposing: {
              side: candidate.rootSide,
              normalDot: candidate.normalDot,
              distance: candidate.distance,
            },
            targetBackLeg: route,
            opposingBackLeg: { segments: 0, maximumAngleDeg: 0 },
            maximumEdgeAngleDeg: route.maximumAngleDeg,
            fallback: true,
          };
          break;
        }
      }
      if (!accepted) continue;
    connections.push({
      targetPatchId: target.patchId,
      opposingPatchId: accepted.opposing.side.patchId,
        rootPatchId: accepted.opposing.side.patchId,
      overhangAngleDeg: target.overhangAngleDeg,
      opposingNormalDot: accepted.opposing.normalDot,
      maximumEdgeAngleDeg: accepted.maximumEdgeAngleDeg,
        segmentCount: accepted.targetBackLeg.segments + accepted.opposingBackLeg.segments,
    });
      pendingTargets.delete(target.patchId);
      progress++;
      routesAdded++;
      addedSupportCount++;
      if (accepted.fallback) fallbackSupportCount++;
      incrementalTargetAdded = true;
      if (routesAdded >= routeBudget) break;
    }
    // No match in the strict cone is exactly when the next, wider cone must
    // be attempted.  The previous early break caused a permanent N-1/N
    // status no matter how many times the author clicked 5A.
    if (routesAdded >= routeBudget) break;
    if (progress === 0) continue;
  }

  // Connectivity is audited from the actual graph, not inferred from the
  // number of generated routes.  Each pass joins every remaining component
  // to the largest component through the best opposing/nearest pair, then
  // checks again.  This replaces the old implicit DryWeb connectivity.
  const sideByAnchorNode = new Map<number, SkinRebuildPatternSide>();
  for (const side of patternSides) {
    const nodeId = anchorNodeByPatch.get(side.patchId);
    if (nodeId !== undefined) sideByAnchorNode.set(nodeId, side);
  }
  let connectivityLoopCount = 0;
  let components = graphComponentsContaining(builder.nodes.length, builder.edges, [...sideByAnchorNode.keys()]);
  const maximumConnectivityLoops = Math.max(1, patternSides.length);
  // Incremental authoring emits one logical addition per click. A support
  // route already connects two Pattern backs, so the connectivity repair
  // waits for a later click instead of silently adding a second route.
  const allowConnectivityPass = mode !== "support-only"
    && routesAdded < routeBudget
    && (!options.incremental || !incrementalTargetAdded || mode === "connectivity-only");
  const preferredConnectivityPatchIds = new Set(options.preferredConnectivityPatchIds ?? []);
  while (allowConnectivityPass && components.length > 1 && connectivityLoopCount < maximumConnectivityLoops
    && routesAdded < routeBudget) {
    connectivityLoopCount++;
    const main = components[0];
    let progress = 0;
    const remainingComponents = components.slice(1).sort((first, second) => {
      const firstPreferred = first.some((nodeId) => preferredConnectivityPatchIds.has(sideByAnchorNode.get(nodeId)?.patchId ?? -1)) ? 0 : 1;
      const secondPreferred = second.some((nodeId) => preferredConnectivityPatchIds.has(sideByAnchorNode.get(nodeId)?.patchId ?? -1)) ? 0 : 1;
      return firstPreferred - secondPreferred || second.length - first.length || first[0] - second[0];
    });
    for (const component of remainingComponents) {
      const pairs = main.flatMap((mainNode) => component.map((otherNode) => {
        const first = sideByAnchorNode.get(mainNode)!;
        const second = sideByAnchorNode.get(otherNode)!;
        return {
          first,
          second,
          normalDot: dot(first.outwardNormal, second.outwardNormal),
          distance: length(first.insidePosition, second.insidePosition),
        };
      })).sort((a, b) => {
        const aOpposing = a.normalDot <= -0.12 ? 0 : 1;
        const bOpposing = b.normalDot <= -0.12 ? 0 : 1;
        return aOpposing - bOpposing || a.normalDot - b.normalDot || a.distance - b.distance
          || a.first.patchId - b.first.patchId || a.second.patchId - b.second.patchId;
      });
      let connected = false;
      for (const pair of pairs) {
        const checkpoint = builder.checkpoint();
        const route = pathWithContainedPrintableBridge(
          builder,
          base,
          attachmentSites,
          pair.first.insidePosition,
          pair.second.insidePosition,
          maximumSegmentSource,
          webCenterZ,
          constrainInterior,
        );
        if (!route) {
          builder.restore(checkpoint);
          continue;
        }
        connected = true;
        break;
      }
      if (!connected) continue;
      progress++;
      routesAdded++;
      addedConnectivityCount++;
      if (routesAdded >= routeBudget) break;
    }
    const next = graphComponentsContaining(builder.nodes.length, builder.edges, [...sideByAnchorNode.keys()]);
    if (progress === 0 || next.length >= components.length) {
      components = next;
      break;
    }
    components = next;
    if (routesAdded >= routeBudget) break;
  }

  // Add a restrained second set of opposing links.  These are real printable
  // graph edges and make the inside read as a web with alternate load paths,
  // rather than a single spanning tree.
  const addDecorativeLoops = mode === "auto" && !options.incremental && options.maximumRoutes === undefined;
  for (const side of addDecorativeLoops ? patternSides : []) {
    const opposing = patternSides
      .filter((candidate) => candidate.patchId !== side.patchId)
      .map((candidate) => ({
        side: candidate,
        normalDot: dot(side.outwardNormal, candidate.outwardNormal),
        distance: length(side.insidePosition, candidate.insidePosition),
      }))
      .filter((candidate) => candidate.normalDot <= -0.12)
      .sort((a, b) => a.distance - b.distance || a.normalDot - b.normalDot || a.side.patchId - b.side.patchId)[0];
    if (!opposing || side.patchId > opposing.side.patchId) continue;
    const checkpoint = builder.checkpoint();
    const route = pathWithContainedPrintableBridge(
      builder,
      base,
      attachmentSites,
      side.insidePosition,
      opposing.side.insidePosition,
      maximumSegmentSource,
      webCenterZ,
      constrainInterior,
    );
    if (!route) builder.restore(checkpoint);
  }
  const lattice = builder.graph();
  const containment = auditSkinRebuildLatticeBaseContainment(base, patterns, patternSides, lattice, settings);
  if (!containment.contained) {
    throw new Error(`ラティス半径を含むBase内包検査に失敗しました（外側${containment.outsideEdgeIds.length}線）`);
  }
  const requiredTargetIds = new Set(skinRebuildSpiderSupportTargetIds(patternSides, lowestPoints));
  const supportedRequiredTargetIds = new Set(connections
    .map((connection) => connection.targetPatchId)
    .filter((patchId) => requiredTargetIds.has(patchId)));
  lattice.stats.requestedTargets = requiredTargetIds.size;
  lattice.stats.connectedTargets = supportedRequiredTargetIds.size;
  components = graphComponentsContaining(lattice.nodes.length, lattice.edges, [...sideByAnchorNode.keys()]);
  const connectedAnchorNodes = new Set(components[0] ?? []);
  const disconnectedPatternIds = patternSides
    .filter((side) => !connectedAnchorNodes.has(anchorNodeByPatch.get(side.patchId) ?? -1))
    .map((side) => side.patchId)
    .sort((a, b) => a - b);
  return {
    lattice,
    connections,
    containment,
    connectivityLoopCount,
    supportLoopCount,
    disconnectedPatternIds,
    unsupportedTargetIds: [...requiredTargetIds]
      .filter((patchId) => !supportedRequiredTargetIds.has(patchId))
      .sort((a, b) => a - b),
    addedSupportCount,
    fallbackSupportCount,
    addedConnectivityCount,
  };
}

function closestPointOnSegment(
  point: Vector3Value,
  start: Vector3Value,
  end: Vector3Value,
): { point: Vector3Value; t: number; distance: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const denominator = dx * dx + dy * dy + dz * dz;
  const t = denominator > EPSILON
    ? clamp(((point.x - start.x) * dx + (point.y - start.y) * dy + (point.z - start.z) * dz) / denominator, 0, 1)
    : 0;
  const projected = { x: start.x + dx * t, y: start.y + dy * t, z: start.z + dz * t };
  return { point: projected, t, distance: length(point, projected) };
}

function splitSkinRebuildLatticeEdgeAt(
  graph: InternalStructureGraph,
  edgeId: number,
  contact: Vector3Value,
  t: number,
): { graph: InternalStructureGraph; contact: Vector3Value } | null {
  const source = graph.edges.find((edge) => edge.id === edgeId);
  if (!source) return null;
  const start = graph.nodes[source.start];
  const end = graph.nodes[source.end];
  if (!start || !end) return null;
  const nodes = graph.nodes.map((node) => ({ ...node, position: { ...node.position } }));
  const contactNodeId = t <= 1e-6
    ? source.start
    : t >= 1 - 1e-6
      ? source.end
      : nodes.length;
  if (contactNodeId === nodes.length) {
    nodes.push({ id: contactNodeId, position: { ...contact }, radius: source.radius });
  }
  const edges: InternalStructureEdge[] = [];
  for (const edge of graph.edges) {
    if (edge.id !== edgeId) {
      edges.push({ id: edges.length, start: edge.start, end: edge.end, radius: edge.radius });
      continue;
    }
    if (contactNodeId === source.start || contactNodeId === source.end) {
      edges.push({ id: edges.length, start: source.start, end: source.end, radius: source.radius });
    } else {
      edges.push({ id: edges.length, start: source.start, end: contactNodeId, radius: source.radius });
      edges.push({ id: edges.length, start: contactNodeId, end: source.end, radius: source.radius });
    }
  }
  return {
    graph: {
      ...graph,
      nodes,
      edges,
      stats: {
        ...graph.stats,
        inputPoints: nodes.length,
        candidateEdges: edges.length,
        gridNodeCount: nodes.length,
        gridEdgeCount: edges.length,
      },
    },
    contact: { ...nodes[contactNodeId].position },
  };
}

function reinforcementEdgePositionKey(
  graph: Pick<InternalStructureGraph, "nodes">,
  edge: Pick<InternalStructureEdge, "start" | "end">,
): string {
  const start = graph.nodes[edge.start]?.position;
  const end = graph.nodes[edge.end]?.position;
  if (!start || !end) return "";
  const pointKey = (point: Vector3Value): string =>
    `${point.x.toPrecision(16)},${point.y.toPrecision(16)},${point.z.toPrecision(16)}`;
  const first = pointKey(start);
  const second = pointKey(end);
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

function appendReinforcementPreviewEdges(
  preview: InternalStructureGraph,
  builder: GraphBuilder,
  firstEdgeIndex: number,
): void {
  for (let edgeIndex = firstEdgeIndex; edgeIndex < builder.edges.length; edgeIndex++) {
    const edge = builder.edges[edgeIndex];
    const start = builder.nodes[edge.start];
    const end = builder.nodes[edge.end];
    if (!start || !end) continue;
    const startId = preview.nodes.length;
    preview.nodes.push({ id: startId, position: { ...start.position }, radius: edge.radius });
    const endId = preview.nodes.length;
    preview.nodes.push({ id: endId, position: { ...end.position }, radius: edge.radius });
    preview.edges.push({
      id: preview.edges.length,
      start: startId,
      end: endId,
      radius: edge.radius,
    });
  }
  preview.stats.inputPoints = preview.nodes.length;
  preview.stats.candidateEdges = preview.edges.length;
  preview.stats.gridNodeCount = preview.nodes.length;
  preview.stats.gridEdgeCount = preview.edges.length;
}

/** Connect one selected red final-mesh region to the nearest viable point on
 * the permanent web. The existing member is split at the real contact, then
 * the sampled red face is covered by a connected face-to-point buttress. A
 * single centreline is not accepted as proof that the surrounding face was
 * changed; every supplied surface sample gets real permanent geometry. */
export function reinforceSkinRebuildOverhangRegion(
  base: SkinRebuildBase,
  patterns: Patch[],
  patternSides: SkinRebuildPatternSide[],
  lattice: InternalStructureGraph,
  surfacePoint: Vector3Value,
  surfaceNormal: Vector3Value,
  settingsInput: SkinRebuildSettings,
  surfaceSamplesInput: readonly SkinRebuildOverhangSurfaceSample[] = [],
  options: SkinRebuildOverhangReinforcementOptions = {},
): SkinRebuildOverhangReinforcement {
  if (lattice.edges.length === 0) throw new Error("先に工程5Aで蜘蛛ラティスを生成してください");
  for (const [label, point] of [["surfacePoint", surfacePoint], ["surfaceNormal", surfaceNormal]] as const) {
    if (![point.x, point.y, point.z].every(Number.isFinite)) throw new Error(`${label} must be finite`);
  }
  const settings = validateSettings({ ...settingsInput, patternCount: patterns.length });
  const scaleMmPerUnit = estimatedScaleMmPerUnit(base, patterns, settings);
  const strutRadius = (settings.strutDiameterMm * 0.5) / scaleMmPerUnit;
  const normal = normalize(surfaceNormal);
  if (Math.hypot(normal.x, normal.y, normal.z) <= EPSILON) throw new Error("選択赤面の法線を取得できませんでした");
  const centerlineClearance = strutRadius * 1.04;
  const constrainInterior = (point: Vector3Value): Vector3Value =>
    constrainRoutePointInsideBase(base, point, centerlineClearance);
  // Keep the face contacts shallow enough that the first descending capsule
  // actually replaces the diagnosed underside.  The former full-radius
  // erosion hid the route centre inside the Pattern and changed only a tiny
  // point, leaving the surrounding red triangles geometrically untouched.
  const surfaceContact = {
    x: surfacePoint.x - normal.x * Math.max(strutRadius * 0.28, 0.012),
    y: surfacePoint.y - normal.y * Math.max(strutRadius * 0.28, 0.012),
    z: surfacePoint.z - normal.z * Math.max(strutRadius * 0.28, 0.012),
  };
  const suppliedSamples = surfaceSamplesInput
    .filter((sample) => [
      sample.point.x, sample.point.y, sample.point.z,
      sample.normal.x, sample.normal.y, sample.normal.z,
    ].every(Number.isFinite))
    .slice(0, 256);
  const surfaceSamples = suppliedSamples.length > 0
    ? suppliedSamples
    : [{ point: { ...surfacePoint }, normal: { ...normal }, faceIndex: -1 }];
  const contactDepth = Math.max(strutRadius * 0.28, 0.012);
  const areaContactRoutes = surfaceSamples.map((sample) => {
    const sampleNormal = normalize(sample.normal);
    return {
      sample,
      normal: sampleNormal,
      contact: {
        x: sample.point.x - sampleNormal.x * contactDepth,
        y: sample.point.y - sampleNormal.y * contactDepth,
        z: sample.point.z - sampleNormal.z * contactDepth,
      },
    };
  });
  const areaContacts = areaContactRoutes.map((route) => route.contact);
  const maximumSegmentSource = 12 / scaleMmPerUnit;
  const webCenterZ = patternSides.length > 0
    ? patternSides.reduce((sum, side) => sum + side.insidePosition.z, 0) / patternSides.length
    : surfaceContact.z;
  const selectedPatternSdf = createPatchesSdfEvaluator(patterns, settings.roundK);
  const attachmentSites = [
    ...skinRebuildLatticeAttachmentSites(patterns, patternSides, settings.roundK),
    ...areaContacts.map((position) => ({ position, patternSdf: selectedPatternSdf })),
  ];

  // Route every real face contact independently. The former implementation
  // forced the complete selected area onto one shared web point; one distant
  // triangle could therefore reject an otherwise printable region. Accepted
  // members immediately become part of the working web, so later contacts can
  // join either the original spider lattice or the closest new branch.
  let workingLattice = lattice;
  const reinforcement = createEmptySkinRebuildGraph();
  let sourceEdgeId = -1;
  let firstLatticeContact: Vector3Value | null = null;
  let maximumEdgeAngleDeg = 0;
  let coveredContactCount = 0;
  const uncoveredSurfaceContactIndices: number[] = [];
  let lastFailureMessage = "";
  for (let contactIndex = 0; contactIndex < areaContactRoutes.length; contactIndex++) {
    const contactRoute = areaContactRoutes[contactIndex];
    const contact = contactIndex === 0 ? surfaceContact : contactRoute.contact;
    // Create a short, real neck through the selected Pattern material until
    // the member centre and radius are safely inside the Base. This is the
    // missing transition for outward Pattern bulges: asking the shallow face
    // point to jump directly to an interior web edge could leave the first
    // cylinder outside both solids even when a printable inward route exists.
    const neckContacts: Vector3Value[] = [contact];
    for (let step = 1; step <= 10; step++) {
      const depth = contactDepth + strutRadius * 0.52 * step;
      const next = {
        x: contactRoute.sample.point.x - contactRoute.normal.x * depth,
        y: contactRoute.sample.point.y - contactRoute.normal.y * depth,
        z: contactRoute.sample.point.z - contactRoute.normal.z * depth,
      };
      neckContacts.push(next);
      if (fieldSdf(base.host, base.hostK, next.x, next.y, next.z) <= -centerlineClearance) break;
    }
    const deepestNeck = neckContacts[neckContacts.length - 1];
    if (fieldSdf(base.host, base.hostK, deepestNeck.x, deepestNeck.y, deepestNeck.z) > -centerlineClearance) {
      const constrained = constrainInterior(deepestNeck);
      if (length(deepestNeck, constrained) > strutRadius * 0.15) neckContacts.push(constrained);
    }
    const verticalNeckContacts: Vector3Value[] = [contact];
    for (let step = 1; step <= 10; step++) {
      const next = {
        x: contact.x,
        y: contact.y,
        z: contact.z + strutRadius * 0.52 * step,
      };
      verticalNeckContacts.push(next);
      if (fieldSdf(base.host, base.hostK, next.x, next.y, next.z) <= -centerlineClearance) break;
    }
    const localAttachmentSites = [
      ...attachmentSites,
      ...neckContacts.map((position) => ({ position, patternSdf: selectedPatternSdf })),
    ];
    const reinforcementKeys = new Set(reinforcement.edges
      .map((edge) => reinforcementEdgePositionKey(reinforcement, edge))
      .filter(Boolean));
    const edgeCandidates = workingLattice.edges.flatMap((edge) => {
      // Do not split a previously accepted cyan member. Stable preview
      // segments also make final id recovery deterministic.
      if (reinforcementKeys.has(reinforcementEdgePositionKey(workingLattice, edge))) return [];
      const start = workingLattice.nodes[edge.start]?.position;
      const end = workingLattice.nodes[edge.end]?.position;
      if (!start || !end) return [];
      return [{ edge, ...closestPointOnSegment(contactRoute.sample.point, start, end) }];
    }).sort((first, second) => first.distance - second.distance || first.edge.id - second.edge.id)
      .slice(0, 24);
    const incidentEdgeByNode = new Map<number, number>();
    for (const edge of workingLattice.edges) {
      if (!incidentEdgeByNode.has(edge.start)) incidentEdgeByNode.set(edge.start, edge.id);
      if (!incidentEdgeByNode.has(edge.end)) incidentEdgeByNode.set(edge.end, edge.id);
    }
    const nodeCandidates = workingLattice.nodes
      .filter((node) => incidentEdgeByNode.has(node.id))
      .map((node) => ({
        node,
        distance: length(contactRoute.sample.point, node.position),
        sourceEdgeId: incidentEdgeByNode.get(node.id)!,
      }))
      .sort((first, second) => first.distance - second.distance || first.node.id - second.node.id)
      .slice(0, 24);
    const candidateCount = nodeCandidates.length + edgeCandidates.length;
    options.onProgress?.({
      phase: "routing",
      completedContactCount: contactIndex,
      contactCount: areaContacts.length,
      candidateIndex: 0,
      candidateCount,
    });
    let accepted = false;
    let rejectedNeckAngle = 0;
    let rejectedNeckContainment = 0;
    let rejectedWebRoute = 0;
    let rejectedEmptyRoute = 0;
    const tryRouteToTarget = (
      graph: InternalStructureGraph,
      target: Vector3Value,
    ): {
      builder: GraphBuilder;
      checkpoint: { nodeCount: number; edgeCount: number };
      maximumAngleDeg: number;
    } | null => {
      let builder = new GraphBuilder(strutRadius);
      builder.appendGraph(graph);
      let checkpoint = builder.checkpoint();
      let route = pathWithContainedPrintableBridge(
        builder,
        base,
        attachmentSites,
        contact,
        target,
        maximumSegmentSource,
        webCenterZ,
        constrainInterior,
      );
      let neckMaximumAngleDeg = 0;
      if (!route) {
        for (const candidateNeckContacts of [neckContacts, verticalNeckContacts]) {
          builder = new GraphBuilder(strutRadius);
          builder.appendGraph(graph);
          checkpoint = builder.checkpoint();
          neckMaximumAngleDeg = 0;
          let neckEndpoint = candidateNeckContacts[0];
          const candidateAttachmentSites = candidateNeckContacts === neckContacts
            ? localAttachmentSites
            : [
              ...attachmentSites,
              ...candidateNeckContacts.map((position) => ({ position, patternSdf: selectedPatternSdf })),
            ];
          for (let neckIndex = 1; neckIndex < candidateNeckContacts.length; neckIndex++) {
            const neckCheckpoint = builder.checkpoint();
            const neckRoute = pathWithMaximumSegment(
              builder,
              candidateNeckContacts[neckIndex - 1],
              candidateNeckContacts[neckIndex],
              Math.max(strutRadius * 0.7, 1e-5),
            );
            if (neckRoute.maximumAngleDeg > 45 + 1e-5) {
              rejectedNeckAngle++;
              builder.restore(neckCheckpoint);
              break;
            }
            if (!builderEdgeRangeStaysInsideBase(base, builder, neckCheckpoint.edgeCount, candidateAttachmentSites)) {
              rejectedNeckContainment++;
              builder.restore(neckCheckpoint);
              break;
            }
            neckMaximumAngleDeg = Math.max(neckMaximumAngleDeg, neckRoute.maximumAngleDeg);
            neckEndpoint = candidateNeckContacts[neckIndex];
          }
          route = pathWithContainedPrintableBridge(
            builder,
            base,
            candidateAttachmentSites,
            neckEndpoint,
            target,
            maximumSegmentSource,
            webCenterZ,
            constrainInterior,
          );
          if (route) break;
        }
      }
      if (!route) {
        rejectedWebRoute++;
        return null;
      }
      if (builder.edges.length === checkpoint.edgeCount) {
        rejectedEmptyRoute++;
        return null;
      }
      return {
        builder,
        checkpoint,
        maximumAngleDeg: Math.max(neckMaximumAngleDeg, route.maximumAngleDeg),
      };
    };
    for (let candidateIndex = 0; candidateIndex < candidateCount; candidateIndex++) {
      options.onProgress?.({
        phase: "routing",
        completedContactCount: contactIndex,
        contactCount: areaContacts.length,
        candidateIndex: candidateIndex + 1,
        candidateCount,
      });
      const nodeCandidate = candidateIndex < nodeCandidates.length
        ? nodeCandidates[candidateIndex]
        : null;
      const edgeCandidate = nodeCandidate ? null : edgeCandidates[candidateIndex - nodeCandidates.length];
      const split = edgeCandidate ? splitSkinRebuildLatticeEdgeAt(
        workingLattice,
        edgeCandidate.edge.id,
        edgeCandidate.point,
        edgeCandidate.t,
      ) : null;
      const target = nodeCandidate?.node.position ?? split?.contact ?? null;
      const sourceGraph = nodeCandidate ? workingLattice : split?.graph ?? null;
      if (!target || !sourceGraph || length(contact, target) <= strutRadius * 0.25) continue;
      const routed = tryRouteToTarget(sourceGraph, target);
      if (!routed) continue;
      appendReinforcementPreviewEdges(reinforcement, routed.builder, routed.checkpoint.edgeCount);
      workingLattice = routed.builder.graph();
      workingLattice.stats.requestedTargets = lattice.stats.requestedTargets ?? 0;
      workingLattice.stats.connectedTargets = lattice.stats.connectedTargets ?? 0;
      if (sourceEdgeId < 0) sourceEdgeId = nodeCandidate?.sourceEdgeId ?? edgeCandidate?.edge.id ?? -1;
      firstLatticeContact ??= { ...target };
      maximumEdgeAngleDeg = Math.max(maximumEdgeAngleDeg, routed.maximumAngleDeg);
      coveredContactCount++;
      accepted = true;
      break;
    }
    if (!accepted) {
      uncoveredSurfaceContactIndices.push(contactIndex);
      lastFailureMessage = `赤面の面接点 ${contactIndex + 1}/${areaContacts.length} からBase内の蜘蛛ラティスへ45°以内で届く経路を作れませんでした（面首角度${rejectedNeckAngle}・面首内包${rejectedNeckContainment}・蜘蛛経路${rejectedWebRoute}・空経路${rejectedEmptyRoute}）`;
    }
  }
  if (reinforcement.edges.length === 0) {
    throw new Error(lastFailureMessage || "選択赤面から蜘蛛ラティスへ補強経路を作れませんでした");
  }
  options.onProgress?.({
    phase: "containment",
    completedContactCount: areaContacts.length,
    contactCount: areaContacts.length,
    candidateIndex: 0,
    candidateCount: 0,
  });
  // Every new member has already passed a radius-aware local Base screen.
  // One final whole-graph audit replaces the previous repeated O(face×edge)
  // audits and catches any integration mistake without blocking each contact.
  const containment = auditSkinRebuildLatticeBaseContainment(
    base,
    patterns,
    patternSides,
    workingLattice,
    settings,
  );
  if (!containment.contained) {
    throw new Error(`補強後のBase内包検査に失敗しました（外側${containment.outsideEdgeIds.length}線）`);
  }
  const reinforcementKeys = new Set(reinforcement.edges
    .map((edge) => reinforcementEdgePositionKey(reinforcement, edge))
    .filter(Boolean));
  const reinforcementEdgeIds = workingLattice.edges
    .filter((edge) => reinforcementKeys.has(reinforcementEdgePositionKey(workingLattice, edge)))
    .map((edge) => edge.id);
  options.onProgress?.({
    phase: "complete",
    completedContactCount: areaContacts.length,
    contactCount: areaContacts.length,
    candidateIndex: 0,
    candidateCount: 0,
  });
  return {
    lattice: workingLattice,
    reinforcement,
    sourceEdgeId,
    reinforcementEdgeIds,
    surfaceContact,
    latticeContact: firstLatticeContact ?? surfaceContact,
    surfaceContactCount: coveredContactCount,
    uncoveredSurfaceContactIndices,
    segmentCount: reinforcement.edges.length,
    maximumEdgeAngleDeg,
    containment,
  };
}

export function mergeSkinRebuildGraphs(
  first: InternalStructureGraph,
  second: InternalStructureGraph,
): InternalStructureGraph {
  const nodes: InternalStructureNode[] = [];
  const edges: InternalStructureEdge[] = [];
  const nodeByPosition = new Map<string, number>();
  const edgeKeys = new Set<string>();
  const positionKey = (position: Vector3Value): string =>
    `${position.x.toPrecision(16)},${position.y.toPrecision(16)},${position.z.toPrecision(16)}`;
  const append = (graph: InternalStructureGraph): void => {
    const remap = graph.nodes.map((node) => {
      const key = positionKey(node.position);
      const existing = nodeByPosition.get(key);
      if (existing !== undefined) {
        nodes[existing].radius = Math.max(nodes[existing].radius, node.radius);
        return existing;
      }
      const id = nodes.length;
      nodes.push({ id, position: { ...node.position }, radius: node.radius });
      nodeByPosition.set(key, id);
      return id;
    });
    for (const edge of graph.edges) {
      const start = remap[edge.start];
      const end = remap[edge.end];
      if (start === undefined || end === undefined || start === end) continue;
      const key = start < end ? `${start}:${end}` : `${end}:${start}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      edges.push({ id: edges.length, start, end, radius: edge.radius });
    }
  };
  append(first);
  append(second);
  return {
    kind: "targetedGrid",
    nodes,
    edges,
    stats: {
      inputPoints: nodes.length,
      delaunayTetrahedra: 0,
      candidateEdges: edges.length,
      clippedEdges: 0,
      removedShortEdges: 0,
      removedOutsideEdges: 0,
      removedIsolatedEdges: 0,
      requestedTargets: second.stats.requestedTargets ?? 0,
      connectedTargets: second.stats.connectedTargets ?? 0,
      gridNodeCount: nodes.length,
      gridEdgeCount: edges.length,
    },
  };
}

/**
 * Merge removable support into the print-reachability graph while preserving
 * a real support contact that lands on the middle of an artwork member. The
 * BODY geometry is unchanged: the collinear split only gives the print gate
 * the physical junction that exists where the support cylinder intersects
 * the member.
 */
export function mergeSkinRebuildGraphsAtSupportContacts(
  artwork: InternalStructureGraph,
  support: InternalStructureGraph,
): InternalStructureGraph {
  if (support.nodes.length === 0 || support.edges.length === 0) return mergeSkinRebuildGraphs(artwork, support);
  const nodes = artwork.nodes.map((node) => ({ ...node, position: { ...node.position } }));
  const edges: InternalStructureEdge[] = [];
  const tolerance = 1e-7;
  for (const edge of artwork.edges) {
    const start = artwork.nodes[edge.start];
    const end = artwork.nodes[edge.end];
    if (!start || !end) continue;
    const dx = end.position.x - start.position.x;
    const dy = end.position.y - start.position.y;
    const dz = end.position.z - start.position.z;
    const squaredLength = dx * dx + dy * dy + dz * dz;
    const splits: Array<{ t: number; nodeId: number }> = [
      { t: 0, nodeId: start.id },
      { t: 1, nodeId: end.id },
    ];
    if (squaredLength > EPSILON) {
      for (const contact of support.nodes) {
        const px = contact.position.x - start.position.x;
        const py = contact.position.y - start.position.y;
        const pz = contact.position.z - start.position.z;
        const t = (px * dx + py * dy + pz * dz) / squaredLength;
        if (t <= tolerance || t >= 1 - tolerance) continue;
        const distanceToLine = Math.hypot(
          start.position.x + dx * t - contact.position.x,
          start.position.y + dy * t - contact.position.y,
          start.position.z + dz * t - contact.position.z,
        );
        if (distanceToLine > tolerance) continue;
        const existing = splits.find((candidate) => Math.abs(candidate.t - t) <= tolerance);
        if (existing) continue;
        const nodeId = nodes.length;
        nodes.push({ id: nodeId, position: { ...contact.position }, radius: Math.max(edge.radius, contact.radius) });
        splits.push({ t, nodeId });
      }
    }
    splits.sort((first, second) => first.t - second.t);
    for (let index = 1; index < splits.length; index++) {
      edges.push({
        id: edges.length,
        start: splits[index - 1].nodeId,
        end: splits[index].nodeId,
        radius: edge.radius,
      });
    }
  }
  const splitArtwork: InternalStructureGraph = {
    ...artwork,
    nodes,
    edges,
    stats: {
      ...artwork.stats,
      inputPoints: nodes.length,
      candidateEdges: edges.length,
      gridNodeCount: nodes.length,
      gridEdgeCount: edges.length,
    },
  };
  return mergeSkinRebuildGraphs(splitArtwork, support);
}

/** Author edit: remove one permanent member and compact unreferenced route
 * nodes. The following print gate remains responsible for proving that the
 * edited artwork is still one printable component. */
export function removeSkinRebuildLatticeEdge(
  graph: InternalStructureGraph,
  edgeId: number,
): InternalStructureGraph {
  const keptEdges = graph.edges.filter((edge) => edge.id !== edgeId);
  if (keptEdges.length === graph.edges.length) return graph;
  const used = new Set(keptEdges.flatMap((edge) => [edge.start, edge.end]));
  const nodeRemap = new Map<number, number>();
  const nodes = graph.nodes.filter((node) => used.has(node.id)).map((node, index) => {
    nodeRemap.set(node.id, index);
    return { ...node, id: index, position: { ...node.position } };
  });
  const edges = keptEdges.map((edge, index) => ({
    ...edge,
    id: index,
    start: nodeRemap.get(edge.start)!,
    end: nodeRemap.get(edge.end)!,
  }));
  return {
    ...graph,
    nodes,
    edges,
    stats: {
      ...graph.stats,
      inputPoints: nodes.length,
      candidateEdges: edges.length,
      gridNodeCount: nodes.length,
      gridEdgeCount: edges.length,
    },
  };
}

/** Keep only support claims whose target contact still reaches both its
 * Pattern back and the recorded opposing Pattern after an author deletes a
 * member. Alternate spider paths are accepted; a genuinely severed route is
 * returned to the next one-pass build queue. */
export function retainConnectedSkinRebuildLatticeConnections(
  base: SkinRebuildBase,
  patterns: Patch[],
  patternSides: SkinRebuildPatternSide[],
  lowestPoints: SkinRebuildLowestPoint[],
  graph: InternalStructureGraph,
  connections: SkinRebuildLatticeConnection[],
  settingsInput: SkinRebuildSettings,
): SkinRebuildLatticeConnection[] {
  if (graph.nodes.length === 0 || graph.edges.length === 0 || connections.length === 0) return [];
  const settings = validateSettings(settingsInput);
  const scaleMmPerUnit = estimatedScaleMmPerUnit(base, patterns, settings);
  const strutRadius = (settings.strutDiameterMm * 0.5) / scaleMmPerUnit;
  const centerlineClearance = strutRadius * 1.04;
  const sideByPatch = new Map(patternSides.map((side) => [side.patchId, side]));
  const targetByPatch = new Map(lowestPoints.map((point) => [point.patchId, point]));
  const neighbours = Array.from({ length: graph.nodes.length }, () => [] as number[]);
  for (const edge of graph.edges) {
    if (!neighbours[edge.start] || !neighbours[edge.end]) continue;
    neighbours[edge.start].push(edge.end);
    neighbours[edge.end].push(edge.start);
  }
  const component = new Int32Array(graph.nodes.length).fill(-1);
  let componentId = 0;
  for (let seed = 0; seed < graph.nodes.length; seed++) {
    if (component[seed] >= 0) continue;
    component[seed] = componentId;
    const queue = [seed];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const next of neighbours[current]) {
        if (component[next] >= 0) continue;
        component[next] = componentId;
        queue.push(next);
      }
    }
    componentId++;
  }
  const nodeAt = (position: Vector3Value): number => {
    let nearest = -1;
    let nearestDistance = Infinity;
    for (const [index, node] of graph.nodes.entries()) {
      const distance = length(position, node.position);
      if (distance < nearestDistance) {
        nearest = index;
        nearestDistance = distance;
      }
    }
    return nearestDistance <= 1e-6 ? nearest : -1;
  };
  return connections.filter((connection) => {
    const target = targetByPatch.get(connection.targetPatchId);
    const targetSide = sideByPatch.get(connection.targetPatchId);
    const opposingSide = sideByPatch.get(connection.opposingPatchId);
    if (!target || !targetSide || !opposingSide) return false;
    const targetInside = constrainRoutePointInsideBase(base, {
      x: target.position.x - target.normal.x * Math.max(strutRadius * 0.8, 0.04),
      y: target.position.y - target.normal.y * Math.max(strutRadius * 0.8, 0.04),
      z: target.position.z - target.normal.z * Math.max(strutRadius * 0.8, 0.04),
    }, centerlineClearance);
    const targetContactNode = nodeAt(targetInside);
    const targetBackNode = nodeAt(targetSide.insidePosition);
    const opposingBackNode = nodeAt(opposingSide.insidePosition);
    return targetContactNode >= 0 && targetBackNode >= 0 && opposingBackNode >= 0
      && component[targetContactNode] === component[targetBackNode]
      && component[targetBackNode] === component[opposingBackNode];
  });
}

/**
 * Build removable print support independently from the permanent spider web.
 * Every non-Surface local minimum in the lattice gets one vertical plate
 * pillar. Because every permanent edge is <=45 degrees, those roots are
 * sufficient to propagate layer-order reachability through the whole web.
 */
export function buildSkinRebuildPrintSupport(
  base: SkinRebuildBase,
  patterns: Patch[],
  patternSides: SkinRebuildPatternSide[],
  lowestPoints: SkinRebuildLowestPoint[],
  artwork: InternalStructureGraph,
  settingsInput: SkinRebuildSettings,
): InternalStructureGraph {
  const settings = validateSettings(settingsInput);
  const scaleMmPerUnit = estimatedScaleMmPerUnit(base, patterns, settings);
  const supportRadius = (settings.supportDiameterMm * 0.5) / scaleMmPerUnit;
  const builder = new GraphBuilder(supportRadius);
  const surfaceSdf = createCompositeSdfEvaluator(
    "plate", base.host, base.hostK, settings.surfaceThickness, patterns, settings.roundK, 0, 0,
  );
  const neighbours = Array.from({ length: artwork.nodes.length }, () => [] as Array<{ nodeId: number; printableAngle: boolean }>);
  for (const edge of artwork.edges) {
    if (neighbours[edge.start] && neighbours[edge.end]) {
      const start = artwork.nodes[edge.start].position;
      const end = artwork.nodes[edge.end].position;
      const edgeLength = length(start, end);
      const angleFromVerticalDeg = edgeLength > EPSILON
        ? Math.acos(Math.min(1, Math.abs(end.z - start.z) / edgeLength)) * 180 / Math.PI
        : 90;
      const printableAngle = angleFromVerticalDeg <= 45 + 1e-6;
      neighbours[edge.start].push({ nodeId: edge.end, printableAngle });
      neighbours[edge.end].push({ nodeId: edge.start, printableAngle });
    }
  }
  const overlapSource = 0.2 / scaleMmPerUnit;
  const patternFloor = patterns.flatMap((patch) => patch.points.map((point) => point.z - point.r));
  const plateSurfaceZ = lowestPoints.length > 0
    ? Math.min(...lowestPoints.map((point) => point.position.z))
    : Math.min(...patternFloor);
  const plateRootCenterZ = plateSurfaceZ + supportRadius;
  const pillarContactByColumn = new Map<string, Vector3Value>();
  const requestPillar = (contact: Vector3Value): void => {
    if (contact.z <= plateRootCenterZ + EPSILON) return;
    // The same Pattern-back point can also be a lattice local minimum. One
    // coincident vertical is sufficient; emitting both creates overlapping
    // closed cylinders and a non-manifold support STL.
    const key = `${Math.round(contact.x * 1e7)},${Math.round(contact.y * 1e7)}`;
    const current = pillarContactByColumn.get(key);
    if (!current || contact.z > current.z) pillarContactByColumn.set(key, { ...contact });
  };
  const sideByPatch = new Map(patternSides.map((side) => [side.patchId, side]));
  // Red faces whose local inside normal does not point down to the plate do
  // not need a permanent spider contact. They still require removable print
  // support after the artwork connectivity has been decided.
  for (const point of lowestPoints) {
    if (!point.needsSupport || skinRebuildRequiresSpiderSupport(point, sideByPatch.get(point.patchId))
      || point.position.z <= plateRootCenterZ + EPSILON) continue;
    requestPillar(point.position);
  }
  for (const [index, node] of artwork.nodes.entries()) {
    const surfaceAnchored = surfaceSdf(node.position.x, node.position.y, node.position.z)
      <= -Math.min(node.radius * 0.25, overlapSource);
    if (surfaceAnchored) continue;
    const hasLowerPrintableNeighbour = neighbours[index].some((neighbour) =>
      neighbour.printableAngle && artwork.nodes[neighbour.nodeId].position.z < node.position.z - EPSILON);
    if (hasLowerPrintableNeighbour || node.position.z <= plateRootCenterZ + EPSILON) continue;
    requestPillar(node.position);
  }
  // A support landing on the middle of a long shallow member is a genuine
  // physical bridge break. Add enough contacts that no unsupported interval
  // is longer than the conservative A1 mini 5 mm bridge allowance. The gate
  // later splits only its reachability graph at these exact contacts; BODY
  // geometry and its exported STL remain unchanged.
  const maximumBridgeSource = 4.8 / scaleMmPerUnit;
  for (const edge of artwork.edges) {
    const start = artwork.nodes[edge.start]?.position;
    const end = artwork.nodes[edge.end]?.position;
    if (!start || !end) continue;
    const edgeLength = length(start, end);
    if (edgeLength <= EPSILON) continue;
    const angleFromVerticalDeg = Math.acos(Math.min(1, Math.abs(end.z - start.z) / edgeLength)) * 180 / Math.PI;
    if (angleFromVerticalDeg <= 45 + 1e-6 || edgeLength <= maximumBridgeSource) continue;
    const intervals = Math.max(2, Math.ceil(edgeLength / maximumBridgeSource));
    for (let index = 1; index < intervals; index++) {
      const t = index / intervals;
      requestPillar({
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
        z: start.z + (end.z - start.z) * t,
      });
    }
  }
  const contacts = [...pillarContactByColumn.values()].sort((first, second) =>
    first.x - second.x || first.y - second.y || first.z - second.z);
  for (const point of contacts) {
    const root = builder.addRouteNode({ x: point.x, y: point.y, z: plateRootCenterZ });
    const contact = builder.addRouteNode(point);
    builder.addEdge(root, contact);
  }
  const graph = builder.graph();
  graph.stats.requestedTargets = contacts.length;
  graph.stats.connectedTargets = graph.edges.length;
  return graph;
}

export function assembleSkinRebuildProject(
  settingsInput: SkinRebuildSettings,
  base: SkinRebuildBase,
  patterns: Patch[],
  patternSides: SkinRebuildPatternSide[],
  dryWeb: InternalStructureGraph,
  lowestPoints: SkinRebuildLowestPoint[],
  lattice: InternalStructureGraph,
  connections: SkinRebuildLatticeConnection[],
  printSupport: InternalStructureGraph = createEmptySkinRebuildGraph(),
): SkinRebuildProject {
  const settings = validateSettings({ ...settingsInput, patternCount: patterns.length });
  if (patterns.length === 0 || patternSides.length !== patterns.length) throw new Error("Every Surface Pattern requires an inside/outside classification");
  if (patternSides.some((side) => !side.baseSideIsInside)) throw new Error("Base-side inside/outside classification failed");
  const requiredTargetIds = new Set(skinRebuildSpiderSupportTargetIds(patternSides, lowestPoints));
  const supportedTargetIds = new Set(connections
    .map((connection) => connection.targetPatchId)
    .filter((patchId) => requiredTargetIds.has(patchId)));
  const overhangTargetCount = requiredTargetIds.size;
  const maximumLatticeAngleDeg = connections.reduce((maximum, connection) => Math.max(maximum, connection.maximumEdgeAngleDeg), 0);
  return {
    algorithmVersion: SKIN_REBUILD_ALGORITHM_VERSION,
    settings,
    base: { kind: "metaball-capsule", host: base.host.map((ball) => ({ ...ball })), hostK: base.hostK },
    patterns: patterns.map((patch) => ({ ...patch, points: patch.points.map((point) => ({ ...point })) })),
    patternSides: patternSides.map((side) => ({
      ...side,
      surfacePosition: { ...side.surfacePosition },
      outwardNormal: { ...side.outwardNormal },
      insidePosition: { ...side.insidePosition },
      outsidePosition: { ...side.outsidePosition },
    })),
    dryWeb,
    lowestPoints: lowestPoints.map((point) => ({ ...point, position: { ...point.position }, normal: { ...point.normal } })),
    lattice,
    printSupport,
    latticeConnections: connections.map((connection) => ({ ...connection })),
    finalGraph: mergeSkinRebuildGraphs(dryWeb, lattice),
    audit: {
      requestedPatternCount: settings.patternCount,
      realizedPatternCount: patterns.length,
      classifiedInsideCount: patternSides.filter((side) => side.baseSideIsInside).length,
      dryWebNodeCount: dryWeb.nodes.length,
      dryWebEdgeCount: dryWeb.edges.length,
      lowestPointCount: lowestPoints.length,
      overhangTargetCount,
      supportedTargetCount: supportedTargetIds.size,
      unsupportedTargetCount: overhangTargetCount - supportedTargetIds.size,
      maximumLatticeAngleDeg,
    },
  };
}

export function buildSkinRebuildProject(
  settingsInput: SkinRebuildSettings = DEFAULT_SKIN_REBUILD_SETTINGS,
): SkinRebuildRuntimeBuild {
  const settings = validateSettings(settingsInput);
  const base = createSkinRebuildBase(settings);
  const { patterns, patternSides } = createSkinRebuildPatterns(base, settings);
  if (patterns.length < Math.max(12, Math.floor(settings.patternCount * 0.7))) {
    throw new Error(`Surface projection produced only ${patterns.length}/${settings.patternCount} patterns`);
  }
  if (patternSides.some((side) => !side.baseSideIsInside)) {
    throw new Error("Base-side inside/outside classification failed");
  }
  const dryWeb = createEmptySkinRebuildGraph();
  const diagnosed = findSkinRebuildLowestPoints(base, patterns, patternSides, dryWeb, settings);
  const { lattice, connections } = buildSkinRebuildLattice(base, patterns, patternSides, diagnosed.lowestPoints, settings);
  const printSupport = buildSkinRebuildPrintSupport(base, patterns, patternSides, diagnosed.lowestPoints, lattice, settings);
  const project = assembleSkinRebuildProject(
    settings,
    base,
    patterns,
    patternSides,
    dryWeb,
    diagnosed.lowestPoints,
    lattice,
    connections,
    printSupport,
  );
  return { project, analysisMesh: diagnosed.mesh };
}

function shiftBounds(bounds: Bounds, zOffset: number): Bounds {
  const min = { ...bounds.min, z: bounds.min.z + zOffset };
  const max = { ...bounds.max, z: bounds.max.z + zOffset };
  return { min, max, size: { ...bounds.size }, longest: bounds.longest };
}

export function dropSkinRebuildMeshToPlate(result: MeshBuildResult): MeshBuildResult {
  const zOffset = -result.sourceBounds.min.z;
  return {
    ...result,
    triangles: result.triangles.map((triangle) => ({
      a: { ...triangle.a, z: triangle.a.z + zOffset },
      b: { ...triangle.b, z: triangle.b.z + zOffset },
      c: { ...triangle.c, z: triangle.c.z + zOffset },
    })),
    sourceBounds: shiftBounds(result.sourceBounds, zOffset),
    mmBounds: shiftBounds(result.mmBounds, zOffset * result.scaleMmPerUnit),
    plateShiftSourceZ: (result.plateShiftSourceZ ?? 0) + zOffset,
  };
}

function removeTinyClosedSurfaceIslands(result: MeshBuildResult): MeshBuildResult {
  const triangles = result.triangles;
  if (triangles.length === 0) return result;
  const parent = Int32Array.from({ length: triangles.length }, (_, index) => index);
  const find = (value: number): number => {
    let root = value;
    while (parent[root] !== root) root = parent[root];
    while (parent[value] !== value) {
      const next = parent[value];
      parent[value] = root;
      value = next;
    }
    return root;
  };
  const unite = (first: number, second: number): void => {
    const a = find(first);
    const b = find(second);
    if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
  };
  const firstTriangleByVertex = new Map<string, number>();
  const vertexKey = (point: MeshVertex): string => `${Math.round(point.x * 1e8)},${Math.round(point.y * 1e8)},${Math.round(point.z * 1e8)}`;
  for (let index = 0; index < triangles.length; index++) {
    for (const point of [triangles[index].a, triangles[index].b, triangles[index].c]) {
      const key = vertexKey(point);
      const first = firstTriangleByVertex.get(key);
      if (first === undefined) firstTriangleByVertex.set(key, index);
      else unite(first, index);
    }
  }
  const sizeByRoot = new Map<number, number>();
  for (let index = 0; index < triangles.length; index++) {
    const root = find(index);
    sizeByRoot.set(root, (sizeByRoot.get(root) ?? 0) + 1);
  }
  if (sizeByRoot.size <= 1) return result;
  const ordered = [...sizeByRoot.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const keepRoot = ordered[0][0];
  const removedTriangleCount = triangles.length - ordered[0][1];
  // Marching tetrahedra can leave a minute closed inner bubble where several
  // smooth-union struts meet.  Removing only a tightly bounded sub-percent
  // closed surface is an explicit mesh repair; a real detached Pattern is
  // much larger and continues to fail the ordinary topology gate.
  const repairLimit = Math.max(128, Math.floor(triangles.length * 0.0025));
  if (removedTriangleCount > repairLimit) return result;
  return { ...result, triangles: triangles.filter((_, index) => find(index) === keepRoot) };
}

function removeClosedNegativeVolumeCavities(result: MeshBuildResult): MeshBuildResult {
  const triangles = result.triangles;
  if (triangles.length === 0) return result;
  const parent = Int32Array.from({ length: triangles.length }, (_, index) => index);
  const find = (value: number): number => {
    let root = value;
    while (parent[root] !== root) root = parent[root];
    while (parent[value] !== value) {
      const next = parent[value];
      parent[value] = root;
      value = next;
    }
    return root;
  };
  const unite = (first: number, second: number): void => {
    const a = find(first); const b = find(second);
    if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
  };
  const owner = new Map<string, number>();
  for (let index = 0; index < triangles.length; index++) {
    for (const point of [triangles[index].a, triangles[index].b, triangles[index].c]) {
      const saved = roundVertexToF32(point, result.scaleMmPerUnit);
      const key = `${saved.x},${saved.y},${saved.z}`;
      const first = owner.get(key);
      if (first === undefined) owner.set(key, index); else unite(first, index);
    }
  }
  const signedSixVolume = new Map<number, number>();
  for (let index = 0; index < triangles.length; index++) {
    const root = find(index);
    const { a, b, c } = triangles[index];
    const value = a.x * (b.y * c.z - b.z * c.y)
      - a.y * (b.x * c.z - b.z * c.x)
      + a.z * (b.x * c.y - b.y * c.x);
    signedSixVolume.set(root, (signedSixVolume.get(root) ?? 0) + value);
  }
  if (signedSixVolume.size <= 1) return result;
  const main = [...signedSixVolume].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
  const mainSign = Math.sign(main[1]);
  if (mainSign === 0) return result;
  const cavityRoots = new Set(
    [...signedSixVolume]
      .filter(([, volume]) => Math.sign(volume) !== 0 && Math.sign(volume) !== mainSign)
      .map(([root]) => root),
  );
  if (cavityRoots.size === 0) return result;
  return { ...result, triangles: triangles.filter((_, index) => !cavityRoots.has(find(index))) };
}

/**
 * Close one triangle-sized numerical boundary hole in the exact Float32-mm
 * coordinates written to STL. This is intentionally much narrower than a
 * general hole filler: a genuine authored opening, a larger crack, multiple
 * holes, or a mesh with any second topology defect still fails closed.
 */
function repairSingleTinySavedTriangleHole<T extends MeshBuildResult>(result: T): T {
  const before = inspectSavedStlTopology(result.triangles, result.scaleMmPerUnit);
  if (before.openEdges !== 3
    || before.connectedComponents !== 1
    || before.nonManifoldEdges !== 0
    || before.windingInconsistentEdges !== 0
    || before.degenerateTriangleCount !== 0
    || before.nonFiniteTriangleCount !== 0) return result;

  type SavedVertex = { source: MeshVertex; saved: MeshVertex };
  type EdgeUse = { from: string; to: string };
  const vertices = new Map<string, SavedVertex>();
  const edgeUses = new Map<string, EdgeUse[]>();
  for (const triangle of result.triangles) {
    const points = [triangle.a, triangle.b, triangle.c] as const;
    const keys = points.map((point) => {
      const saved = roundVertexToF32(point, result.scaleMmPerUnit);
      const key = `${saved.x},${saved.y},${saved.z}`;
      if (!vertices.has(key)) vertices.set(key, { source: point, saved });
      return key;
    });
    for (const [fromIndex, toIndex] of [[0, 1], [1, 2], [2, 0]] as const) {
      const from = keys[fromIndex];
      const to = keys[toIndex];
      const undirected = from < to ? `${from}|${to}` : `${to}|${from}`;
      const uses = edgeUses.get(undirected) ?? [];
      uses.push({ from, to });
      edgeUses.set(undirected, uses);
    }
  }
  const boundary = [...edgeUses.values()].filter((uses) => uses.length === 1).map((uses) => uses[0]);
  if (boundary.length !== 3) return result;
  const boundaryKeys = [...new Set(boundary.flatMap((edge) => [edge.from, edge.to]))];
  if (boundaryKeys.length !== 3) return result;
  const degree = new Map<string, number>();
  for (const edge of boundary) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }
  if (boundaryKeys.some((key) => degree.get(key) !== 2)) return result;

  // The new face must traverse every boundary edge in the direction opposite
  // to its surviving neighbour. Try the six possible vertex orders and keep
  // only that consistent winding.
  const existingDirections = new Set(boundary.map((edge) => `${edge.from}>${edge.to}`));
  let order: string[] | undefined;
  for (const first of boundaryKeys) {
    for (const second of boundaryKeys) {
      if (second === first) continue;
      const third = boundaryKeys.find((key) => key !== first && key !== second)!;
      const directed = [[first, second], [second, third], [third, first]] as const;
      if (directed.every(([from, to]) => existingDirections.has(`${to}>${from}`))) {
        order = [first, second, third];
        break;
      }
    }
    if (order) break;
  }
  if (!order) return result;

  const savedPoints = order.map((key) => vertices.get(key)!.saved);
  const distance = (first: MeshVertex, second: MeshVertex): number => Math.hypot(
    second.x - first.x,
    second.y - first.y,
    second.z - first.z,
  );
  const edgeLengthsMm = [
    distance(savedPoints[0], savedPoints[1]),
    distance(savedPoints[1], savedPoints[2]),
    distance(savedPoints[2], savedPoints[0]),
  ];
  const ab = {
    x: savedPoints[1].x - savedPoints[0].x,
    y: savedPoints[1].y - savedPoints[0].y,
    z: savedPoints[1].z - savedPoints[0].z,
  };
  const ac = {
    x: savedPoints[2].x - savedPoints[0].x,
    y: savedPoints[2].y - savedPoints[0].y,
    z: savedPoints[2].z - savedPoints[0].z,
  };
  const areaMm2 = Math.hypot(
    ab.y * ac.z - ab.z * ac.y,
    ab.z * ac.x - ab.x * ac.z,
    ab.x * ac.y - ab.y * ac.x,
  ) * 0.5;
  // At the automatic final resolution a marching-tetrahedra face is well
  // below these limits. Keeping a fixed physical bound prevents this repair
  // from silently sealing a deliberate Pattern window.
  if (Math.max(...edgeLengthsMm) > 2.5 || areaMm2 > 2.5 || areaMm2 <= 0) return result;

  const triangle: Triangle = {
    a: vertices.get(order[0])!.source,
    b: vertices.get(order[1])!.source,
    c: vertices.get(order[2])!.source,
  };
  const candidate = orientMeshForSavedStl({
    ...result,
    triangles: [...result.triangles, triangle],
    repairedSavedTriangleHoleCount: (result.repairedSavedTriangleHoleCount ?? 0) + 1,
  }) as T;
  const after = inspectSavedStlTopology(candidate.triangles, candidate.scaleMmPerUnit);
  return after.ok && after.connectedComponents === 1 ? candidate : result;
}

/** Apply the same narrowly bounded saved-mesh repairs in both the standalone
 * sample exporter and the original-editor Stage 6 Worker. A real detached
 * Pattern remains above the tiny-island limit and continues to fail. */
export function repairSkinRebuildFinalMesh<T extends MeshBuildResult>(result: T): T {
  const dropped = dropSkinRebuildMeshToPlate(
    removeTinyClosedSurfaceIslands(orientMeshForSavedStl(removeClosedNegativeVolumeCavities(result))),
  );
  // Translation to the exact build-plate origin changes the Float32 values
  // that STL stores. Normalize once more in those final saved coordinates so
  // a zero-area collinear face cannot survive solely because it was valid
  // before the plate shift.
  const repaired = repairSingleTinySavedTriangleHole(orientMeshForSavedStl(dropped) as T);
  // SkinMeshResult carries a cached component count from before the narrowly
  // bounded island/cavity repairs above. Recompute it so Stage 6 reports the
  // actual final triangle soup instead of a removed component.
  return "connectedComponents" in repaired
    ? { ...repaired, connectedComponents: countConnectedComponents(repaired.triangles) } as T
    : repaired;
}

export function buildSkinRebuildFinalMesh(
  project: SkinRebuildProject,
  resolution = project.settings.exportResolution,
): MeshBuildResult {
  const built = buildSkinMesh(
    "plate",
    project.base.host,
    project.base.hostK,
    project.settings.surfaceThickness,
    project.patterns,
    project.settings.roundK,
    { resolution, targetLongestMm: project.settings.targetLongestMm },
    0,
    0,
    0,
    project.finalGraph,
  );
  return repairSkinRebuildFinalMesh(built);
}

export function skinRebuildTopologyPass(report: SavedStlTopologyReport): boolean {
  return report.connectedComponents === 1
    && report.closed
    && report.openEdges === 0
    && report.nonManifoldEdges === 0
    && report.degenerateTriangleCount === 0
    && report.nonFiniteTriangleCount === 0
    && report.windingInconsistentEdges === 0;
}

export function exportSkinRebuildStl(
  project: SkinRebuildProject,
  filename = "skin-rebuild-first-print.stl",
  resolution = project.settings.exportResolution,
): SkinRebuildStlArtifact {
  const mesh = buildSkinRebuildFinalMesh(project, resolution);
  const topology = inspectSavedStlTopology(mesh.triangles, mesh.scaleMmPerUnit);
  if (!skinRebuildTopologyPass(topology)) {
    throw new Error(`STL topology gate failed: ${JSON.stringify(topology)}`);
  }
  return { mesh, topology, stl: encodeBinaryStl(mesh, filename) };
}

export function graphSegments(graph: InternalStructureGraph): Array<{ start: Vector3Value; end: Vector3Value; radius: number }> {
  return graph.edges.flatMap((edge) => {
    const start = graph.nodes[edge.start]?.position;
    const end = graph.nodes[edge.end]?.position;
    return start && end ? [{ start, end, radius: edge.radius }] : [];
  });
}

export function meshPositions(result: MeshBuildResult): Float32Array {
  const positions = new Float32Array(result.triangles.length * 9);
  let offset = 0;
  for (const triangle of result.triangles) {
    for (const point of [triangle.a, triangle.b, triangle.c] as MeshVertex[]) {
      positions[offset++] = point.x;
      positions[offset++] = point.y;
      positions[offset++] = point.z;
    }
  }
  return positions;
}
