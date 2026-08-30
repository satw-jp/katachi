import { fieldSdf } from "../../cloud-sculpt/field.ts";
import { FKEI_LIMITS, utf8ByteLength } from "../fkei.ts";
import type { Patch } from "../field.ts";
import type { InternalStructureGraph, Vector3Value } from "../voronoi.ts";
import {
  assembleSkinRebuildProject,
  buildSkinRebuildLattice,
  createEmptySkinRebuildGraph,
  retainConnectedSkinRebuildLatticeConnections,
  SKIN_REBUILD_ALGORITHM_VERSION,
  skinRebuildBaseCentroid,
  skinRebuildSpiderSupportTargetIds,
  type SkinRebuildAudit,
  type SkinRebuildBase,
  type SkinRebuildLatticeConnection,
  type SkinRebuildLowestPoint,
  type SkinRebuildPatternSide,
  type SkinRebuildProject,
  type SkinRebuildSettings,
} from "./model.ts";

export const SKIN_REBUILD_FKEI_SCHEMA = "katachi.skin-rebuild.fkei.v1" as const;

export interface SkinRebuildFkeiCompatibility {
  formatVersion: 1;
  app: "SKIN REBUILD";
  algorithmVersion: typeof SKIN_REBUILD_ALGORITHM_VERSION;
  appVersion?: string;
  generatorCommit?: string;
}

export interface SkinRebuildProjectSnapshot {
  algorithmVersion: typeof SKIN_REBUILD_ALGORITHM_VERSION;
  settings: SkinRebuildSettings;
  base: SkinRebuildBase;
  patterns: Patch[];
  patternSides: SkinRebuildPatternSide[];
  dryWeb: InternalStructureGraph;
  lowestPoints: SkinRebuildLowestPoint[];
  lattice: InternalStructureGraph;
  printSupport: InternalStructureGraph;
  latticeConnections: SkinRebuildLatticeConnection[];
  audit: SkinRebuildAudit;
}

export interface SkinRebuildFkeiDocument {
  schema: typeof SKIN_REBUILD_FKEI_SCHEMA;
  printApproval: false;
  savedAt: string;
  compatibility: SkinRebuildFkeiCompatibility;
  /** Exact original-editor operation history. New integrated saves include
   * this so Stage 1/2 controls and every authored motif remain editable. */
  shapeRecipe?: string;
  project: SkinRebuildProjectSnapshot;
}

export interface CaptureSkinRebuildFkeiOptions {
  savedAt?: string;
  appVersion?: string;
  generatorCommit?: string;
  shapeRecipe?: string;
}

function ownRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key === "__proto__" || key === "prototype" || key === "constructor") throw new Error(`${label} contains a dangerous key`);
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) throw new Error(`${label}.${key} must be own enumerable data`);
  }
  return record;
}

function onlyKeys(record: Record<string, unknown>, keys: readonly string[], label: string): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(record)) if (!allowed.has(key)) throw new Error(`${label} contains unknown field ${key}`);
}

function finite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}

function integer(value: unknown, label: string, minimum = 0): number {
  const number = finite(value, label);
  if (!Number.isSafeInteger(number) || number < minimum) throw new Error(`${label} must be a safe integer >= ${minimum}`);
  return number;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be non-empty text`);
  return value;
}

function array(value: unknown, label: string, maximum = 100_000): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`${label} must be a bounded array`);
  return value;
}

function vector(value: unknown, label: string): Vector3Value {
  const record = ownRecord(value, label);
  onlyKeys(record, ["x", "y", "z"], label);
  return { x: finite(record.x, `${label}.x`), y: finite(record.y, `${label}.y`), z: finite(record.z, `${label}.z`) };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function validateSettings(value: unknown): SkinRebuildSettings {
  const record = ownRecord(value, "project.settings");
  const legacyKeys = [
    "baseStretch", "patternCount", "strutDiameterMm", "targetLongestMm", "surfaceThickness",
    "patternRadius", "roundK", "overhangThresholdDeg", "analysisResolution", "exportResolution",
  ] as const;
  onlyKeys(record, [...legacyKeys, "supportDiameterMm"], "project.settings");
  const settings = {
    ...Object.fromEntries(legacyKeys.map((key) => [key, finite(record[key], `project.settings.${key}`)])),
    // v0.84 files did not have a separate support setting. They remain
    // readable and acquire the conservative new default on their next save.
    supportDiameterMm: record.supportDiameterMm === undefined
      ? 1.6
      : finite(record.supportDiameterMm, "project.settings.supportDiameterMm"),
  } as unknown as SkinRebuildSettings;
  if (!Number.isSafeInteger(settings.patternCount) || settings.patternCount < 1) throw new Error("project.settings.patternCount must be a positive integer");
  if (!Number.isSafeInteger(settings.analysisResolution) || !Number.isSafeInteger(settings.exportResolution)) throw new Error("mesh resolutions must be integers");
  if (!(settings.targetLongestMm > 0 && settings.surfaceThickness > 0 && settings.patternRadius > 0 && settings.strutDiameterMm > 0 && settings.supportDiameterMm > 0)) throw new Error("physical settings must be positive");
  if (!(settings.overhangThresholdDeg >= 0 && settings.overhangThresholdDeg <= 90)) throw new Error("overhang threshold is outside 0..90 degrees");
  return settings;
}

function validateBase(value: unknown): SkinRebuildBase {
  const record = ownRecord(value, "project.base");
  onlyKeys(record, ["kind", "host", "hostK"], "project.base");
  if (record.kind !== "metaball-capsule") throw new Error("project.base.kind is unsupported");
  const ids = new Set<number>();
  const host = array(record.host, "project.base.host", 64).map((item, index) => {
    const ball = ownRecord(item, `project.base.host[${index}]`);
    onlyKeys(ball, ["id", "x", "y", "z", "r"], `project.base.host[${index}]`);
    const id = integer(ball.id, `project.base.host[${index}].id`, 1);
    if (ids.has(id)) throw new Error("project.base.host has duplicate IDs");
    ids.add(id);
    const radius = finite(ball.r, `project.base.host[${index}].r`);
    if (!(radius > 0)) throw new Error("project.base host radius must be positive");
    return {
      id,
      x: finite(ball.x, `project.base.host[${index}].x`),
      y: finite(ball.y, `project.base.host[${index}].y`),
      z: finite(ball.z, `project.base.host[${index}].z`),
      r: radius,
    };
  });
  if (host.length === 0) throw new Error("project.base.host is empty");
  return { kind: "metaball-capsule", host, hostK: finite(record.hostK, "project.base.hostK") };
}

function validatePatterns(value: unknown): Patch[] {
  const ids = new Set<number>();
  return array(value, "project.patterns", 2_000).map((item, index) => {
    const patch = ownRecord(item, `project.patterns[${index}]`);
    onlyKeys(patch, ["id", "shape", "motifPlacement", "ringDiameter", "points"], `project.patterns[${index}]`);
    const id = integer(patch.id, `project.patterns[${index}].id`, 1);
    if (ids.has(id)) throw new Error("project.patterns has duplicate IDs");
    ids.add(id);
    if (patch.shape !== "coin" && patch.shape !== "flatRing" && patch.shape !== "ring3d" && patch.shape !== "flower") {
      throw new Error("SKIN REBUILD pattern shape is unsupported");
    }
    if (patch.motifPlacement !== undefined && patch.motifPlacement !== "surface" && patch.motifPlacement !== "center" && patch.motifPlacement !== "inside") {
      throw new Error("SKIN REBUILD motif placement is unsupported");
    }
    const ringDiameter = patch.ringDiameter === undefined ? undefined : finite(patch.ringDiameter, `project.patterns[${index}].ringDiameter`);
    if (ringDiameter !== undefined && !(ringDiameter > 0)) throw new Error("ring diameter must be positive");
    const points = array(patch.points, `project.patterns[${index}].points`, 512).map((pointValue, pointIndex) => {
      const point = ownRecord(pointValue, `project.patterns[${index}].points[${pointIndex}]`);
      onlyKeys(point, [
        "x", "y", "z", "r", "role", "baseR", "fusionBaseR", "fusionR", "meshJoinR",
        "contactR", "contactScale", "ringPrimary",
      ], `project.patterns[${index}].points[${pointIndex}]`);
      if (point.role !== undefined && point.role !== "motif" && point.role !== "bridge" && point.role !== "surfaceConnector") {
        throw new Error("SKIN REBUILD pattern point role is unsupported");
      }
      const role = point.role as Patch["points"][number]["role"];
      const radius = finite(point.r, `project.patterns[${index}].points[${pointIndex}].r`);
      if (!(radius > 0)) throw new Error("pattern point radius must be positive");
      const optionalNumber = (key: "baseR" | "fusionBaseR" | "fusionR" | "meshJoinR" | "contactR" | "contactScale") => {
        if (point[key] === undefined) return undefined;
        const result = finite(point[key], `project.patterns[${index}].points[${pointIndex}].${key}`);
        if (result < 0) throw new Error(`pattern point ${key} must be non-negative`);
        return result;
      };
      if (point.ringPrimary !== undefined && typeof point.ringPrimary !== "boolean") throw new Error("ringPrimary must be boolean");
      const baseR = optionalNumber("baseR");
      const fusionBaseR = optionalNumber("fusionBaseR");
      const fusionR = optionalNumber("fusionR");
      const meshJoinR = optionalNumber("meshJoinR");
      const contactR = optionalNumber("contactR");
      const contactScale = optionalNumber("contactScale");
      const result: Patch["points"][number] = {
        x: finite(point.x, `project.patterns[${index}].points[${pointIndex}].x`),
        y: finite(point.y, `project.patterns[${index}].points[${pointIndex}].y`),
        z: finite(point.z, `project.patterns[${index}].points[${pointIndex}].z`),
        r: radius,
        ...(role === undefined ? {} : { role }),
        ...(baseR === undefined ? {} : { baseR }),
        ...(fusionBaseR === undefined ? {} : { fusionBaseR }),
        ...(fusionR === undefined ? {} : { fusionR }),
        ...(meshJoinR === undefined ? {} : { meshJoinR }),
        ...(contactR === undefined ? {} : { contactR }),
        ...(contactScale === undefined ? {} : { contactScale }),
        ...(point.ringPrimary === undefined ? {} : { ringPrimary: point.ringPrimary }),
      };
      return result;
    });
    if (points.length === 0) throw new Error("pattern has no points");
    return {
      id,
      shape: patch.shape,
      ...(patch.motifPlacement === undefined ? {} : { motifPlacement: patch.motifPlacement }),
      ...(ringDiameter === undefined ? {} : { ringDiameter }),
      points,
    };
  });
}

function validateGraph(value: unknown, label: string): InternalStructureGraph {
  const record = ownRecord(value, label);
  onlyKeys(record, ["kind", "nodes", "edges", "stats"], label);
  if (record.kind !== "targetedGrid" && record.kind !== "voronoiEdge") throw new Error(`${label}.kind is unsupported`);
  const nodes = array(record.nodes, `${label}.nodes`).map((nodeValue, index) => {
    const node = ownRecord(nodeValue, `${label}.nodes[${index}]`);
    onlyKeys(node, ["id", "position", "radius"], `${label}.nodes[${index}]`);
    const id = integer(node.id, `${label}.nodes[${index}].id`);
    if (id !== index) throw new Error(`${label}.nodes IDs must be contiguous indices`);
    const radius = finite(node.radius, `${label}.nodes[${index}].radius`);
    if (!(radius > 0)) throw new Error(`${label} node radius must be positive`);
    return { id, position: vector(node.position, `${label}.nodes[${index}].position`), radius };
  });
  const edges = array(record.edges, `${label}.edges`).map((edgeValue, index) => {
    const edge = ownRecord(edgeValue, `${label}.edges[${index}]`);
    onlyKeys(edge, ["id", "start", "end", "radius"], `${label}.edges[${index}]`);
    const id = integer(edge.id, `${label}.edges[${index}].id`);
    const start = integer(edge.start, `${label}.edges[${index}].start`);
    const end = integer(edge.end, `${label}.edges[${index}].end`);
    const radius = finite(edge.radius, `${label}.edges[${index}].radius`);
    if (id !== index || start === end || !nodes[start] || !nodes[end] || !(radius > 0)) throw new Error(`${label} edge is invalid`);
    return { id, start, end, radius };
  });
  const stats = ownRecord(record.stats, `${label}.stats`);
  onlyKeys(stats, [
    "inputPoints", "delaunayTetrahedra", "candidateEdges", "clippedEdges", "removedShortEdges",
    "removedOutsideEdges", "removedIsolatedEdges", "requestedTargets", "connectedTargets", "gridNodeCount", "gridEdgeCount",
  ], `${label}.stats`);
  const requiredStats = ["inputPoints", "delaunayTetrahedra", "candidateEdges", "clippedEdges", "removedShortEdges", "removedOutsideEdges", "removedIsolatedEdges"] as const;
  const resultStats: InternalStructureGraph["stats"] = Object.fromEntries(requiredStats.map((key) => [key, integer(stats[key], `${label}.stats.${key}`)])) as unknown as InternalStructureGraph["stats"];
  for (const key of ["requestedTargets", "connectedTargets", "gridNodeCount", "gridEdgeCount"] as const) {
    if (stats[key] !== undefined) resultStats[key] = integer(stats[key], `${label}.stats.${key}`);
  }
  return { kind: record.kind, nodes, edges, stats: resultStats };
}

function validatePatternSides(value: unknown, base: SkinRebuildBase, patterns: Patch[]): SkinRebuildPatternSide[] {
  const patternIds = new Set(patterns.map((patch) => patch.id));
  const seen = new Set<number>();
  const sides = array(value, "project.patternSides", patterns.length).map((item, index) => {
    const side = ownRecord(item, `project.patternSides[${index}]`);
    onlyKeys(side, [
      "patchId", "surfacePosition", "outwardNormal", "insidePosition", "outsidePosition",
      "insideSignedDistance", "outsideSignedDistance", "baseSideIsInside",
    ], `project.patternSides[${index}]`);
    const patchId = integer(side.patchId, `project.patternSides[${index}].patchId`, 1);
    if (!patternIds.has(patchId) || seen.has(patchId)) throw new Error("pattern side identity is invalid");
    seen.add(patchId);
    const surfacePosition = vector(side.surfacePosition, `project.patternSides[${index}].surfacePosition`);
    const outwardNormal = vector(side.outwardNormal, `project.patternSides[${index}].outwardNormal`);
    const magnitude = Math.hypot(outwardNormal.x, outwardNormal.y, outwardNormal.z);
    if (Math.abs(magnitude - 1) > 1e-4) throw new Error("outward normal is not unit length");
    const insidePosition = vector(side.insidePosition, `project.patternSides[${index}].insidePosition`);
    const outsidePosition = vector(side.outsidePosition, `project.patternSides[${index}].outsidePosition`);
    const insideSignedDistance = finite(side.insideSignedDistance, `project.patternSides[${index}].insideSignedDistance`);
    const outsideSignedDistance = finite(side.outsideSignedDistance, `project.patternSides[${index}].outsideSignedDistance`);
    if (side.baseSideIsInside !== true || !(insideSignedDistance < 0 && outsideSignedDistance > 0)) throw new Error("base-side inside/outside fact failed closed");
    const recomputedInside = fieldSdf(base.host, base.hostK, insidePosition.x, insidePosition.y, insidePosition.z);
    const recomputedOutside = fieldSdf(base.host, base.hostK, outsidePosition.x, outsidePosition.y, outsidePosition.z);
    if (Math.abs(recomputedInside - insideSignedDistance) > 1e-8 || Math.abs(recomputedOutside - outsideSignedDistance) > 1e-8) throw new Error("inside/outside signed-distance evidence was altered");
    return { patchId, surfacePosition, outwardNormal, insidePosition, outsidePosition, insideSignedDistance, outsideSignedDistance, baseSideIsInside: true };
  });
  if (sides.length !== patterns.length) throw new Error("every pattern requires one side classification");
  return sides;
}

function validateLowestPoints(value: unknown, patterns: Patch[], threshold: number): SkinRebuildLowestPoint[] {
  const patternIds = new Set(patterns.map((patch) => patch.id));
  const seen = new Set<number>();
  return array(value, "project.lowestPoints", patterns.length).map((item, index) => {
    const point = ownRecord(item, `project.lowestPoints[${index}]`);
    onlyKeys(point, ["patchId", "position", "normal", "overhangAngleDeg", "plateContact", "needsSupport", "basis"], `project.lowestPoints[${index}]`);
    const patchId = integer(point.patchId, `project.lowestPoints[${index}].patchId`, 1);
    if (!patternIds.has(patchId) || seen.has(patchId)) throw new Error("lowest-point identity is invalid");
    seen.add(patchId);
    const normal = vector(point.normal, `project.lowestPoints[${index}].normal`);
    const overhangAngleDeg = finite(point.overhangAngleDeg, `project.lowestPoints[${index}].overhangAngleDeg`);
    if (typeof point.plateContact !== "boolean" || typeof point.needsSupport !== "boolean") throw new Error("lowest-point booleans are invalid");
    if (point.basis !== "sourceSphere" && point.basis !== "finalMesh") throw new Error("lowest-point basis is invalid");
    const expectedSupport = !point.plateContact && overhangAngleDeg + 1e-6 >= threshold;
    if (point.needsSupport !== expectedSupport) throw new Error("lowest-point support classification is inconsistent");
    return { patchId, position: vector(point.position, `project.lowestPoints[${index}].position`), normal, overhangAngleDeg, plateContact: point.plateContact, needsSupport: point.needsSupport, basis: point.basis };
  });
}

function validateConnections(
  value: unknown,
  patterns: Patch[],
  lowest: SkinRebuildLowestPoint[],
): SkinRebuildLatticeConnection[] {
  const patternIds = new Set(patterns.map((patch) => patch.id));
  const supportedTargets = new Set(lowest.filter((point) => point.needsSupport).map((point) => point.patchId));
  const seen = new Set<number>();
  return array(value, "project.latticeConnections", supportedTargets.size).map((item, index) => {
    const connection = ownRecord(item, `project.latticeConnections[${index}]`);
    onlyKeys(connection, [
      "targetPatchId", "opposingPatchId", "rootPatchId", "overhangAngleDeg", "opposingNormalDot",
      "maximumEdgeAngleDeg", "segmentCount",
    ], `project.latticeConnections[${index}]`);
    const targetPatchId = integer(connection.targetPatchId, `project.latticeConnections[${index}].targetPatchId`, 1);
    const opposingPatchId = integer(connection.opposingPatchId, `project.latticeConnections[${index}].opposingPatchId`, 1);
    const rootPatchId = integer(connection.rootPatchId, `project.latticeConnections[${index}].rootPatchId`, 1);
    if (!supportedTargets.has(targetPatchId) || seen.has(targetPatchId) || !patternIds.has(opposingPatchId) || !patternIds.has(rootPatchId) || targetPatchId === opposingPatchId) throw new Error("lattice connection identity is invalid");
    seen.add(targetPatchId);
    const maximumEdgeAngleDeg = finite(connection.maximumEdgeAngleDeg, `project.latticeConnections[${index}].maximumEdgeAngleDeg`);
    const opposingNormalDot = finite(connection.opposingNormalDot, `project.latticeConnections[${index}].opposingNormalDot`);
    if (maximumEdgeAngleDeg > 45 + 1e-5) {
      throw new Error(`lattice print contract failed at Pattern #${targetPatchId}: ${maximumEdgeAngleDeg.toFixed(5)} degrees`);
    }
    // The support builder can legitimately finish a deep concavity by
    // joining its contact to an already-connected spider-web component. In
    // that case this value records the chosen component root's measured
    // normal; it is not a promise that the final short leg itself ends at a
    // directly opposing Pattern. The physical contract is verified below
    // from the saved graph: contact -> own Pattern back -> recorded web root.
    if (opposingNormalDot < -1 - 1e-6 || opposingNormalDot > 1 + 1e-6) {
      throw new Error(`lattice normal measurement is invalid at Pattern #${targetPatchId}`);
    }
    return {
      targetPatchId,
      opposingPatchId,
      rootPatchId,
      overhangAngleDeg: finite(connection.overhangAngleDeg, `project.latticeConnections[${index}].overhangAngleDeg`),
      opposingNormalDot,
      maximumEdgeAngleDeg,
      segmentCount: integer(connection.segmentCount, `project.latticeConnections[${index}].segmentCount`, 1),
    };
  });
}

function validateAudit(
  value: unknown,
  settings: SkinRebuildSettings,
  base: SkinRebuildBase,
  patterns: Patch[],
  sides: SkinRebuildPatternSide[],
  dryWeb: InternalStructureGraph,
  lowest: SkinRebuildLowestPoint[],
  connections: SkinRebuildLatticeConnection[],
  allowLegacyCentroidAudit = false,
): SkinRebuildAudit {
  const record = ownRecord(value, "project.audit");
  const keys = [
    "requestedPatternCount", "realizedPatternCount", "classifiedInsideCount", "dryWebNodeCount", "dryWebEdgeCount",
    "lowestPointCount", "overhangTargetCount", "supportedTargetCount", "unsupportedTargetCount", "maximumLatticeAngleDeg",
  ] as const;
  onlyKeys(record, keys, "project.audit");
  const audit = Object.fromEntries(keys.map((key) => [key, finite(record[key], `project.audit.${key}`)])) as unknown as SkinRebuildAudit;
  const requiredTargetIds = new Set(skinRebuildSpiderSupportTargetIds(sides, lowest));
  const supportedTargetIds = new Set(connections
    .map((connection) => connection.targetPatchId)
    .filter((patchId) => requiredTargetIds.has(patchId)));
  const targetCount = requiredTargetIds.size;
  const maximumAngle = connections.reduce((maximum, connection) => Math.max(maximum, connection.maximumEdgeAngleDeg), 0);
  const expected = {
    requestedPatternCount: settings.patternCount,
    realizedPatternCount: patterns.length,
    classifiedInsideCount: sides.filter((side) => side.baseSideIsInside).length,
    dryWebNodeCount: dryWeb.nodes.length,
    dryWebEdgeCount: dryWeb.edges.length,
    lowestPointCount: lowest.length,
    overhangTargetCount: targetCount,
    supportedTargetCount: supportedTargetIds.size,
    unsupportedTargetCount: targetCount - supportedTargetIds.size,
  };
  const matches = (candidate: typeof expected): boolean => Object.entries(candidate)
    .every(([key, expectedValue]) => audit[key as keyof SkinRebuildAudit] === expectedValue);
  if (!matches(expected)) {
    const centroidZ = skinRebuildBaseCentroid(base).z;
    const legacyTargetCount = lowest.filter((point) => point.needsSupport && point.position.z >= centroidZ - 1e-9).length;
    const legacyExpected = {
      ...expected,
      overhangTargetCount: legacyTargetCount,
      supportedTargetCount: connections.length,
      unsupportedTargetCount: legacyTargetCount - connections.length,
    };
    if (!allowLegacyCentroidAudit || !matches(legacyExpected)) {
      throw new Error("project.audit support facts are inconsistent");
    }
  }
  if (Math.abs(audit.maximumLatticeAngleDeg - maximumAngle) > 1e-8) throw new Error("project.audit.maximumLatticeAngleDeg is inconsistent");
  return { ...expected, maximumLatticeAngleDeg: maximumAngle };
}

export function validateSkinRebuildFkei(value: unknown): SkinRebuildFkeiDocument {
  const root = ownRecord(value, "FKEI document");
  onlyKeys(root, ["schema", "printApproval", "savedAt", "compatibility", "shapeRecipe", "project"], "FKEI document");
  if (root.schema !== SKIN_REBUILD_FKEI_SCHEMA) throw new Error(`Unsupported FKEI schema: ${String(root.schema)}`);
  if (root.printApproval !== false) throw new Error("FKEI printApproval must remain false until human slice/print review");
  const savedAt = text(root.savedAt, "savedAt");
  if (!Number.isFinite(Date.parse(savedAt))) throw new Error("savedAt is not an ISO timestamp");
  const compatibility = ownRecord(root.compatibility, "compatibility");
  onlyKeys(compatibility, ["formatVersion", "app", "algorithmVersion", "appVersion", "generatorCommit"], "compatibility");
  if (compatibility.formatVersion !== 1 || compatibility.app !== "SKIN REBUILD" || compatibility.algorithmVersion !== SKIN_REBUILD_ALGORITHM_VERSION) throw new Error("FKEI compatibility facts are unsupported");
  if (compatibility.generatorCommit !== undefined && !/^[0-9a-f]{40}$/i.test(text(compatibility.generatorCommit, "compatibility.generatorCommit"))) throw new Error("generatorCommit must be a 40-character Git SHA");
  const projectValue = ownRecord(root.project, "project");
  onlyKeys(projectValue, [
    "algorithmVersion", "settings", "base", "patterns", "patternSides", "dryWeb", "lowestPoints",
    "lattice", "printSupport", "latticeConnections", "audit",
  ], "project");
  if (projectValue.algorithmVersion !== SKIN_REBUILD_ALGORITHM_VERSION) throw new Error("project algorithm version is unsupported");
  const settings = validateSettings(projectValue.settings);
  const base = validateBase(projectValue.base);
  const patterns = validatePatterns(projectValue.patterns);
  const sides = validatePatternSides(projectValue.patternSides, base, patterns);
  const dryWeb = validateGraph(projectValue.dryWeb, "project.dryWeb");
  const lowestPoints = validateLowestPoints(projectValue.lowestPoints, patterns, settings.overhangThresholdDeg);
  const lattice = validateGraph(projectValue.lattice, "project.lattice");
  for (const edge of lattice.edges) {
    const start = lattice.nodes[edge.start].position;
    const end = lattice.nodes[edge.end].position;
    const angle = Math.atan2(Math.hypot(end.x - start.x, end.y - start.y), Math.max(Math.abs(end.z - start.z), 1e-9)) * 180 / Math.PI;
    if (angle > 45 + 1e-5) throw new Error("project.lattice contains a segment above 45 degrees");
  }
  const printSupport = projectValue.printSupport === undefined
    ? createEmptySkinRebuildGraph()
    : validateGraph(projectValue.printSupport, "project.printSupport");
  for (const edge of printSupport.edges) {
    const start = printSupport.nodes[edge.start].position;
    const end = printSupport.nodes[edge.end].position;
    const angle = Math.atan2(Math.hypot(end.x - start.x, end.y - start.y), Math.max(Math.abs(end.z - start.z), 1e-9)) * 180 / Math.PI;
    if (angle > 45 + 1e-5) throw new Error("project.printSupport contains a segment above 45 degrees");
  }
  const latticeConnections = validateConnections(projectValue.latticeConnections, patterns, lowestPoints);
  const connectedLatticeConnections = retainConnectedSkinRebuildLatticeConnections(
    base,
    patterns,
    sides,
    lowestPoints,
    lattice,
    latticeConnections,
    settings,
  );
  if (connectedLatticeConnections.length !== latticeConnections.length) {
    const connectedTargetIds = new Set(connectedLatticeConnections.map((connection) => connection.targetPatchId));
    const invalidTargetIds = latticeConnections
      .map((connection) => connection.targetPatchId)
      .filter((patchId) => !connectedTargetIds.has(patchId));
    throw new Error(`lattice path contract failed at Pattern #${invalidTargetIds.join(", #")}`);
  }
  const appVersion = compatibility.appVersion === undefined
    ? undefined
    : text(compatibility.appVersion, "compatibility.appVersion");
  const allowLegacyCentroidAudit = appVersion !== undefined && /^0\.(?:8[0-7])(?:\.|$)/.test(appVersion);
  const audit = validateAudit(
    projectValue.audit,
    settings,
    base,
    patterns,
    sides,
    dryWeb,
    lowestPoints,
    latticeConnections,
    allowLegacyCentroidAudit,
  );
  return {
    schema: SKIN_REBUILD_FKEI_SCHEMA,
    printApproval: false,
    savedAt,
    compatibility: {
      formatVersion: 1,
      app: "SKIN REBUILD",
      algorithmVersion: SKIN_REBUILD_ALGORITHM_VERSION,
      ...(appVersion === undefined ? {} : { appVersion }),
      ...(compatibility.generatorCommit === undefined ? {} : { generatorCommit: compatibility.generatorCommit as string }),
    },
    ...(root.shapeRecipe === undefined ? {} : { shapeRecipe: text(root.shapeRecipe, "shapeRecipe") }),
    project: {
      algorithmVersion: SKIN_REBUILD_ALGORITHM_VERSION,
      settings,
      base,
      patterns,
      patternSides: sides,
      dryWeb,
      lowestPoints,
      lattice,
      printSupport,
      latticeConnections,
      audit,
    },
  };
}

export function captureSkinRebuildFkei(
  project: SkinRebuildProject,
  options: CaptureSkinRebuildFkeiOptions = {},
): SkinRebuildFkeiDocument {
  const { finalGraph: _finalGraph, ...snapshot } = project;
  const patterns: Patch[] = snapshot.patterns.map((patch) => ({
    id: patch.id,
    shape: patch.shape,
    ...(patch.motifPlacement === undefined ? {} : { motifPlacement: patch.motifPlacement }),
    ...(patch.ringDiameter === undefined ? {} : { ringDiameter: patch.ringDiameter }),
    points: patch.points.map((point) => ({
      x: point.x,
      y: point.y,
      z: point.z,
      r: point.r,
      ...(point.role === undefined ? {} : { role: point.role }),
      ...(point.baseR === undefined ? {} : { baseR: point.baseR }),
      ...(point.fusionBaseR === undefined ? {} : { fusionBaseR: point.fusionBaseR }),
      ...(point.fusionR === undefined ? {} : { fusionR: point.fusionR }),
      ...(point.meshJoinR === undefined ? {} : { meshJoinR: point.meshJoinR }),
      ...(point.contactR === undefined ? {} : { contactR: point.contactR }),
      ...(point.contactScale === undefined ? {} : { contactScale: point.contactScale }),
      ...(point.ringPrimary === undefined ? {} : { ringPrimary: point.ringPrimary }),
    })),
  }));
  return validateSkinRebuildFkei(cloneJson({
    schema: SKIN_REBUILD_FKEI_SCHEMA,
    printApproval: false,
    savedAt: options.savedAt ?? new Date().toISOString(),
    compatibility: {
      formatVersion: 1,
      app: "SKIN REBUILD",
      algorithmVersion: SKIN_REBUILD_ALGORITHM_VERSION,
      ...(options.appVersion ? { appVersion: options.appVersion } : {}),
      ...(options.generatorCommit ? { generatorCommit: options.generatorCommit } : {}),
    },
    ...(options.shapeRecipe ? { shapeRecipe: options.shapeRecipe } : {}),
    project: { ...snapshot, patterns },
  }));
}

export function serializeSkinRebuildFkei(document: SkinRebuildFkeiDocument): string {
  const text = `${JSON.stringify(validateSkinRebuildFkei(cloneJson(document)), null, 2)}\n`;
  if (utf8ByteLength(text) > FKEI_LIMITS.maxJsonTextBytes) throw new Error("FKEI exceeds the existing SKIN input budget");
  return text;
}

export function parseSkinRebuildFkei(textValue: string): SkinRebuildFkeiDocument {
  if (typeof textValue !== "string" || utf8ByteLength(textValue) > FKEI_LIMITS.maxJsonTextBytes) throw new Error("FKEI text is missing or too large");
  let parsed: unknown;
  try {
    parsed = JSON.parse(textValue);
  } catch (error) {
    throw new Error(`FKEI JSON parse failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return validateSkinRebuildFkei(parsed);
}

export function projectFromSkinRebuildFkei(document: SkinRebuildFkeiDocument): SkinRebuildProject {
  const validated = validateSkinRebuildFkei(cloneJson(document));
  const project = validated.project;
  // v0.84 stored build-plate roots inside lattice and has no printSupport
  // field. Rebuild only that version boundary: an intentionally empty 5B
  // graph in a current file is also the normal state immediately after an
  // author deletes a line or adds a selected red-area reinforcement. Using
  // emptiness alone would silently discard those permanent Graph edits on
  // the next .fkei Open.
  const appVersion = validated.compatibility.appVersion;
  const requiresLegacyMixedSupportSeparation = project.printSupport.edges.length === 0
    && (appVersion === undefined || /^0\.(?:8[0-4])(?:\.|$)/.test(appVersion));
  const separated = requiresLegacyMixedSupportSeparation
    ? buildSkinRebuildLattice(project.base, project.patterns, project.patternSides, project.lowestPoints, project.settings)
    : { lattice: project.lattice, connections: project.latticeConnections };
  return assembleSkinRebuildProject(
    project.settings,
    project.base,
    project.patterns,
    project.patternSides,
    project.dryWeb,
    project.lowestPoints,
    separated.lattice,
    separated.connections,
    project.printSupport,
  );
}
