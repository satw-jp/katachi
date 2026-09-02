import {
  decodeFkeiValue,
  encodeFkeiValue,
  type FkeiEncodedValue,
} from "../fkei.ts";
import { sha256HexSync } from "../../../lib/hash.ts";
import type { InternalPrintGateReport } from "../internalPrintGate.ts";
import type { InternalStructureGraph } from "../voronoi.ts";
import type { SparseRemovableSupportDiagnostics } from "./sparseRemovableSupport.ts";
import type {
  Stage6MeshBoundsMm,
  Stage6MeshComponentDiagnostic,
  Stage6MeshTopologyDiagnostics,
} from "./stage6MeshTopologyDiagnostics.ts";

export const SKIN_REBUILD_PRINT_SNAPSHOT_VERSION = 1 as const;

export interface SkinRebuildPrintSnapshot {
  version: typeof SKIN_REBUILD_PRINT_SNAPSHOT_VERSION;
  sourceGeometryFingerprint: string;
  pipelineFingerprint: string;
  payloadSha256: string;
  payload: FkeiEncodedValue;
}

export interface SkinRebuildPrintSnapshotData {
  body: {
    fingerprint: string;
    positions: Float32Array;
    normals: Float32Array;
    summary: string;
    watertightOk: boolean;
    topologyDiagnostics: Stage6MeshTopologyDiagnostics;
  };
  componentSelection: {
    explicit: boolean;
    componentIds: number[];
    triangleCount: number;
    cacheFingerprint: string;
  };
  stage4: {
    current: boolean;
    faceCount: number;
    regionCount: number;
    insideFaceCount: number;
    outsideFaceCount: number;
    insideRegionCount: number;
    outsideRegionCount: number;
    unclassifiedFaceCount: number;
  };
  stage6_5: {
    current: boolean;
    faceCount: number;
    insideFaceCount: number;
    outsideFaceCount: number;
    boundaryFaceCount: number;
    unclassifiedFaceCount: number;
    boundaryRegionCount: number;
    boundaryThicknessMm: number;
  };
  stage7: {
    current: boolean;
    faceCount: number;
    overhangFaceCount: number;
    overhangRegionCount: number;
    overhangAreaMm2: number;
    overhangAreaPercent: number;
  };
  stage7_5: {
    current: boolean;
    insideFaceCount: number;
    outsideFaceCount: number;
    ambiguousFaceCount: number;
    ambiguousRegionCount: number;
  };
  stage8: {
    current: boolean;
    supportMode: "automatic" | "off";
    supportDiameterMm: number;
    sparseSupportGenerated: boolean;
    supportGraphFingerprint: string;
    supportGraphNodeCount: number;
    supportGraphEdgeCount: number;
    unresolvedSupportCount: number;
    acceptedBodyCollisionCount: number;
    diagnostics: SparseRemovableSupportDiagnostics | null;
  };
  internalPrintGate: {
    fingerprint: string;
    report: InternalPrintGateReport;
    stl: ArrayBuffer;
    summary: string;
    scaleMmPerUnit: number;
    plateShiftSourceZ: number;
  };
}

export type SkinRebuildPrintSnapshotReuseDecision =
  | { state: "reuse" }
  | { state: "stale"; reason: string };

export interface SkinRebuildPrintSnapshotReuseInput {
  snapshot: SkinRebuildPrintSnapshot;
  data: SkinRebuildPrintSnapshotData;
  currentSourceGeometryFingerprint: string;
  currentPipelineFingerprint: string | null;
  currentGateFingerprint: string | null;
  currentSupportGraphFingerprint: string;
  currentSupportGraphNodeCount: number;
  currentSupportGraphEdgeCount: number;
  currentSupportMode: "automatic" | "off";
  currentSparseSupportDiagnostics: SparseRemovableSupportDiagnostics | null;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${label} contains unknown field ${key}`);
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be non-empty text`);
  return value;
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

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be boolean`);
  return value;
}

function boundedArray(value: unknown, label: string, maximum = 100_000): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`${label} must be a bounded array`);
  return value;
}

function typed<T extends Int32Array | Float32Array>(
  value: unknown,
  ctor: { new (buffer: ArrayBufferLike): T },
  label: string,
): T {
  if (!(value instanceof ctor)) throw new Error(`${label} has an unexpected typed-array type`);
  for (const item of value) if (!Number.isFinite(item)) throw new Error(`${label} contains a non-finite value`);
  return value;
}

function vectorBounds(value: unknown, label: string): Stage6MeshBoundsMm {
  const root = record(value, label);
  onlyKeys(root, ["min", "max", "size"], label);
  const triplet = (tripletValue: unknown, tripletLabel: string): [number, number, number] => {
    const values = boundedArray(tripletValue, tripletLabel, 3);
    if (values.length !== 3) throw new Error(`${tripletLabel} must have three values`);
    return [finite(values[0], `${tripletLabel}[0]`), finite(values[1], `${tripletLabel}[1]`), finite(values[2], `${tripletLabel}[2]`)];
  };
  return { min: triplet(root.min, `${label}.min`), max: triplet(root.max, `${label}.max`), size: triplet(root.size, `${label}.size`) };
}

function validateTopology(value: unknown): Stage6MeshTopologyDiagnostics {
  const root = record(value, "snapshot.body.topologyDiagnostics");
  onlyKeys(root, ["triangleCount", "componentCount", "components", "faceComponentIds", "degenerateFaceIndices", "scaleMmPerUnit", "plateShiftSourceZ"], "snapshot.body.topologyDiagnostics");
  const triangleCount = integer(root.triangleCount, "snapshot.body.topologyDiagnostics.triangleCount");
  const componentCount = integer(root.componentCount, "snapshot.body.topologyDiagnostics.componentCount");
  const components = boundedArray(root.components, "snapshot.body.topologyDiagnostics.components", 10_000).map((value, index): Stage6MeshComponentDiagnostic => {
    const component = record(value, `snapshot.body.topologyDiagnostics.components[${index}]`);
    onlyKeys(component, ["id", "triangleCount", "volumeMm3", "signedVolumeMm3", "boundsMm"], `snapshot.body.topologyDiagnostics.components[${index}]`);
    return {
      id: integer(component.id, `snapshot.body.topologyDiagnostics.components[${index}].id`),
      triangleCount: integer(component.triangleCount, `snapshot.body.topologyDiagnostics.components[${index}].triangleCount`),
      volumeMm3: finite(component.volumeMm3, `snapshot.body.topologyDiagnostics.components[${index}].volumeMm3`),
      signedVolumeMm3: finite(component.signedVolumeMm3, `snapshot.body.topologyDiagnostics.components[${index}].signedVolumeMm3`),
      boundsMm: vectorBounds(component.boundsMm, `snapshot.body.topologyDiagnostics.components[${index}].boundsMm`),
    };
  });
  const faceComponentIds = typed(root.faceComponentIds, Int32Array, "snapshot.body.topologyDiagnostics.faceComponentIds");
  const degenerateFaceIndices = typed(root.degenerateFaceIndices, Int32Array, "snapshot.body.topologyDiagnostics.degenerateFaceIndices");
  if (components.length !== componentCount || faceComponentIds.length !== triangleCount) throw new Error("snapshot topology component counts are inconsistent");
  if (components.some((component, index) => component.id !== index)) throw new Error("snapshot topology component ids are not contiguous");
  for (const componentId of faceComponentIds) if (componentId < 0 || componentId >= componentCount) throw new Error("snapshot topology contains an invalid component id");
  for (const faceIndex of degenerateFaceIndices) if (faceIndex < 0 || faceIndex >= triangleCount) throw new Error("snapshot topology contains an invalid degenerate face id");
  const componentFaceCounts = Array.from({ length: componentCount }, () => 0);
  for (const componentId of faceComponentIds) componentFaceCounts[componentId]++;
  if (componentFaceCounts.some((count, index) => count !== components[index].triangleCount)) throw new Error("snapshot topology component triangle counts are inconsistent");
  return {
    triangleCount,
    componentCount,
    components,
    faceComponentIds,
    degenerateFaceIndices,
    scaleMmPerUnit: finite(root.scaleMmPerUnit, "snapshot.body.topologyDiagnostics.scaleMmPerUnit"),
    plateShiftSourceZ: finite(root.plateShiftSourceZ, "snapshot.body.topologyDiagnostics.plateShiftSourceZ"),
  };
}

function validateReport(value: unknown): InternalPrintGateReport {
  const root = record(value, "snapshot.internalPrintGate.report");
  const integerKeys = [
    "meshComponents", "removedDegenerateTriangles", "graphComponents", "surfaceAnchorNodes", "buildPlateAnchorNodes",
    "floatingGraphComponents", "unsupportedNodes", "unsupportedEdges", "overlongBridges", "bridgeEdges",
    "thinStrutCount", "invalidDiameterCount",
  ] as const;
  const finiteKeys = ["minDiameterMm", "voxelStepMm", "voxelsAcrossDiameter", "maxBridgeMm", "maxObservedBridgeMm"] as const;
  onlyKeys(root, ["ok", "profileId", "reasons", "watertight", ...integerKeys, "minDiameterMm", ...finiteKeys], "snapshot.internalPrintGate.report");
  const reasons = boundedArray(root.reasons, "snapshot.internalPrintGate.report.reasons", 1_000).map((item, index) => text(item, `snapshot.internalPrintGate.report.reasons[${index}]`));
  const report = {
    ok: boolean(root.ok, "snapshot.internalPrintGate.report.ok"),
    profileId: text(root.profileId, "snapshot.internalPrintGate.report.profileId"),
    reasons,
    watertight: boolean(root.watertight, "snapshot.internalPrintGate.report.watertight"),
    ...Object.fromEntries(integerKeys.map((key) => [key, integer(root[key], `snapshot.internalPrintGate.report.${key}`)])),
    ...Object.fromEntries(finiteKeys.map((key) => [key, finite(root[key], `snapshot.internalPrintGate.report.${key}`)])),
    minDiameterMm: finite(root.minDiameterMm, "snapshot.internalPrintGate.report.minDiameterMm"),
  } as InternalPrintGateReport;
  if (report.watertight !== true || report.meshComponents < 1 || report.invalidDiameterCount < 0) {
    throw new Error("snapshot internal print gate topology evidence is invalid");
  }
  return report;
}

function validateSparseDiagnostics(value: unknown): SparseRemovableSupportDiagnostics {
  const root = record(value, "snapshot.stage8.diagnostics");
  const integerKeys = [
    "outsideRegionCount", "rawCandidateCount", "criticalTargetCount", "coveredTargetCount", "unsupportedTargetCount",
    "generatedSupportCount", "rejectedByBody", "rejectedBySpacing", "rejectedByRemovability", "insideDerivedSupportCount",
    "verticalCount", "leaningCount", "routeCandidateCount", "straightRejectedByBody", "offsetBendCount", "acceptedBodyCollisionCount",
  ] as const;
  onlyKeys(root, [...integerKeys, "experimental", "removalGap", "shaftRadius", "neckRadius"], "snapshot.stage8.diagnostics");
  const result = {
    ...Object.fromEntries(integerKeys.map((key) => [key, integer(root[key], `snapshot.stage8.diagnostics.${key}`)])),
    experimental: root.experimental,
    removalGap: finite(root.removalGap, "snapshot.stage8.diagnostics.removalGap"),
    shaftRadius: finite(root.shaftRadius, "snapshot.stage8.diagnostics.shaftRadius"),
    neckRadius: finite(root.neckRadius, "snapshot.stage8.diagnostics.neckRadius"),
  } as SparseRemovableSupportDiagnostics;
  if (result.experimental !== true || result.acceptedBodyCollisionCount !== 0 || !(result.removalGap > 0) || !(result.shaftRadius > 0) || !(result.neckRadius > 0)) {
    throw new Error("snapshot Sparse Support diagnostics are invalid");
  }
  return result;
}

function validateStageSummary(value: unknown, label: string, keys: readonly string[]): Record<string, unknown> {
  const root = record(value, label);
  onlyKeys(root, keys, label);
  if (root.current !== true) throw new Error(`${label}.current must be true for a print-ready snapshot`);
  return root;
}

function stlTriangleCount(value: ArrayBuffer, label: string): number {
  if (value.byteLength < 84) throw new Error(`${label} is too short`);
  const view = new DataView(value);
  const count = view.getUint32(80, true);
  const expected = 84 + count * 50;
  if (!Number.isSafeInteger(expected) || expected !== value.byteLength) throw new Error(`${label} length does not match its triangle count`);
  return count;
}

export function validateSkinRebuildPrintSnapshotMetadata(value: unknown): SkinRebuildPrintSnapshot {
  const root = record(value, "printSnapshot");
  onlyKeys(root, ["version", "sourceGeometryFingerprint", "pipelineFingerprint", "payloadSha256", "payload"], "printSnapshot");
  if (root.version !== SKIN_REBUILD_PRINT_SNAPSHOT_VERSION) throw new Error("printSnapshot version is unsupported");
  const payload = record(root.payload, "printSnapshot.payload");
  if (typeof payload.$fkei !== "string") throw new Error("printSnapshot.payload is not an encoded FKEI value");
  const payloadSha256 = text(root.payloadSha256, "printSnapshot.payloadSha256");
  if (!/^[0-9a-f]{64}$/i.test(payloadSha256)) throw new Error("printSnapshot.payloadSha256 must be a SHA-256 digest");
  if (sha256HexSync(JSON.stringify(payload)) !== payloadSha256.toLowerCase()) {
    throw new Error("printSnapshot payload integrity check failed");
  }
  return {
    version: SKIN_REBUILD_PRINT_SNAPSHOT_VERSION,
    sourceGeometryFingerprint: text(root.sourceGeometryFingerprint, "printSnapshot.sourceGeometryFingerprint"),
    pipelineFingerprint: text(root.pipelineFingerprint, "printSnapshot.pipelineFingerprint"),
    payloadSha256: payloadSha256.toLowerCase(),
    payload: root.payload as FkeiEncodedValue,
  };
}

export function createSkinRebuildPrintSnapshot(
  sourceGeometryFingerprint: string,
  pipelineFingerprint: string,
  data: SkinRebuildPrintSnapshotData,
): SkinRebuildPrintSnapshot {
  validateSnapshotData(data);
  const payload = encodeFkeiValue(data);
  return {
    version: SKIN_REBUILD_PRINT_SNAPSHOT_VERSION,
    sourceGeometryFingerprint: text(sourceGeometryFingerprint, "printSnapshot.sourceGeometryFingerprint"),
    pipelineFingerprint: text(pipelineFingerprint, "printSnapshot.pipelineFingerprint"),
    payloadSha256: sha256HexSync(JSON.stringify(payload)),
    payload,
  };
}

export function decodeSkinRebuildPrintSnapshot(snapshotValue: unknown): SkinRebuildPrintSnapshotData {
  const snapshot = validateSkinRebuildPrintSnapshotMetadata(snapshotValue);
  return validateSnapshotData(decodeFkeiValue(snapshot.payload));
}

export function evaluateSkinRebuildPrintSnapshotReuse(
  input: SkinRebuildPrintSnapshotReuseInput,
): SkinRebuildPrintSnapshotReuseDecision {
  const { snapshot, data } = input;
  if (snapshot.sourceGeometryFingerprint !== input.currentSourceGeometryFingerprint) {
    return { state: "stale", reason: "Print snapshot source geometry fingerprint does not match the current FKEI" };
  }
  if (input.currentPipelineFingerprint === null
    || snapshot.pipelineFingerprint !== input.currentPipelineFingerprint) {
    return { state: "stale", reason: "Print snapshot pipeline fingerprint does not match the current print gate" };
  }
  if (input.currentGateFingerprint === null
    || data.internalPrintGate.fingerprint !== input.currentGateFingerprint) {
    return { state: "stale", reason: "Print snapshot cached BODY gate is stale" };
  }
  if (data.stage8.supportMode !== input.currentSupportMode) {
    return { state: "stale", reason: "Print snapshot support mode does not match the current FKEI" };
  }
  if (data.stage8.supportGraphFingerprint !== input.currentSupportGraphFingerprint
    || data.stage8.supportGraphNodeCount !== input.currentSupportGraphNodeCount
    || data.stage8.supportGraphEdgeCount !== input.currentSupportGraphEdgeCount) {
    return { state: "stale", reason: "Print snapshot Sparse Support graph does not match the current FKEI" };
  }
  const savedDiagnostics = data.stage8.diagnostics;
  const currentDiagnostics = input.currentSparseSupportDiagnostics;
  if ((savedDiagnostics === null) !== (currentDiagnostics === null)
    || (savedDiagnostics !== null && currentDiagnostics !== null
      && (savedDiagnostics.unsupportedTargetCount !== currentDiagnostics.unsupportedTargetCount
        || savedDiagnostics.generatedSupportCount !== currentDiagnostics.generatedSupportCount
        || savedDiagnostics.rejectedByBody !== currentDiagnostics.rejectedByBody
        || savedDiagnostics.acceptedBodyCollisionCount !== currentDiagnostics.acceptedBodyCollisionCount))) {
    return { state: "stale", reason: "Print snapshot Sparse Support diagnostics do not match the current FKEI" };
  }
  return { state: "reuse" };
}

function validateSnapshotData(value: unknown): SkinRebuildPrintSnapshotData {
  const root = record(value, "printSnapshot.payload");
  onlyKeys(root, ["body", "componentSelection", "stage4", "stage6_5", "stage7", "stage7_5", "stage8", "internalPrintGate"], "printSnapshot.payload");
  const body = record(root.body, "snapshot.body");
  onlyKeys(body, ["fingerprint", "positions", "normals", "summary", "watertightOk", "topologyDiagnostics"], "snapshot.body");
  const positions = typed(body.positions, Float32Array, "snapshot.body.positions");
  const normals = typed(body.normals, Float32Array, "snapshot.body.normals");
  if (positions.length === 0 || positions.length % 9 !== 0 || normals.length !== positions.length) throw new Error("snapshot BODY mesh buffers are inconsistent");
  const topologyDiagnostics = validateTopology(body.topologyDiagnostics);
  if (topologyDiagnostics.triangleCount !== positions.length / 9) throw new Error("snapshot BODY topology does not match the mesh");
  if (!(topologyDiagnostics.scaleMmPerUnit > 0)) throw new Error("snapshot BODY topology scale is invalid");
  const bodyWatertightOk = boolean(body.watertightOk, "snapshot.body.watertightOk");
  if (!bodyWatertightOk) throw new Error("snapshot BODY watertight evidence is invalid");
  const selectionRoot = record(root.componentSelection, "snapshot.componentSelection");
  onlyKeys(selectionRoot, ["explicit", "componentIds", "triangleCount", "cacheFingerprint"], "snapshot.componentSelection");
  const componentIds = boundedArray(selectionRoot.componentIds, "snapshot.componentSelection.componentIds", 10_000).map((item, index) => integer(item, `snapshot.componentSelection.componentIds[${index}]`));
  const triangleCount = integer(selectionRoot.triangleCount, "snapshot.componentSelection.triangleCount");
  const cacheFingerprint = text(selectionRoot.cacheFingerprint, "snapshot.componentSelection.cacheFingerprint");
  if (cacheFingerprint !== text(body.fingerprint, "snapshot.body.fingerprint")) throw new Error("snapshot component cache fingerprint does not match the BODY cache");
  if (componentIds.length === 0 || componentIds.some((id) => id >= topologyDiagnostics.componentCount)) throw new Error("snapshot component selection is invalid");
  let selectedTriangleCount = 0;
  for (const componentId of topologyDiagnostics.faceComponentIds) if (componentIds.includes(componentId)) selectedTriangleCount++;
  if (selectedTriangleCount !== triangleCount) throw new Error("snapshot component selection triangle count is inconsistent");
  const stage4 = validateStageSummary(root.stage4, "snapshot.stage4", ["current", "faceCount", "regionCount", "insideFaceCount", "outsideFaceCount", "insideRegionCount", "outsideRegionCount", "unclassifiedFaceCount"]);
  const stage65 = validateStageSummary(root.stage6_5, "snapshot.stage6_5", ["current", "faceCount", "insideFaceCount", "outsideFaceCount", "boundaryFaceCount", "unclassifiedFaceCount", "boundaryRegionCount", "boundaryThicknessMm"]);
  const stage7 = validateStageSummary(root.stage7, "snapshot.stage7", ["current", "faceCount", "overhangFaceCount", "overhangRegionCount", "overhangAreaMm2", "overhangAreaPercent"]);
  const stage75 = validateStageSummary(root.stage7_5, "snapshot.stage7_5", ["current", "insideFaceCount", "outsideFaceCount", "ambiguousFaceCount", "ambiguousRegionCount"]);
  const stage8Root = record(root.stage8, "snapshot.stage8");
  onlyKeys(stage8Root, ["current", "supportMode", "supportDiameterMm", "sparseSupportGenerated", "supportGraphFingerprint", "supportGraphNodeCount", "supportGraphEdgeCount", "unresolvedSupportCount", "acceptedBodyCollisionCount", "diagnostics"], "snapshot.stage8");
  if (stage8Root.current !== true || stage8Root.supportMode !== "automatic" && stage8Root.supportMode !== "off") throw new Error("snapshot Stage 8 readiness is invalid");
  const sparseSupportGenerated = boolean(stage8Root.sparseSupportGenerated, "snapshot.stage8.sparseSupportGenerated");
  const diagnostics = stage8Root.diagnostics === null ? null : validateSparseDiagnostics(stage8Root.diagnostics);
  if (stage8Root.supportMode === "automatic" && (!sparseSupportGenerated || diagnostics === null)) throw new Error("snapshot automatic Sparse Support evidence is incomplete");
  if (diagnostics && integer(stage8Root.unresolvedSupportCount, "snapshot.stage8.unresolvedSupportCount") !== diagnostics.unsupportedTargetCount) throw new Error("snapshot unresolved support count is inconsistent");
  const gateRoot = record(root.internalPrintGate, "snapshot.internalPrintGate");
  onlyKeys(gateRoot, ["fingerprint", "report", "stl", "summary", "scaleMmPerUnit", "plateShiftSourceZ"], "snapshot.internalPrintGate");
  const stl = gateRoot.stl;
  if (!(stl instanceof ArrayBuffer)) throw new Error("snapshot internal print gate STL is invalid");
  if (stlTriangleCount(stl, "snapshot internal print gate STL") !== triangleCount) throw new Error("snapshot gate STL does not match selected BODY components");
  const report = validateReport(gateRoot.report);
  if (report.meshComponents !== componentIds.length || report.watertight !== true) throw new Error("snapshot gate topology evidence is inconsistent with component selection");
  const number = (object: Record<string, unknown>, key: string, label: string): number => finite(object[key], `${label}.${key}`);
  const nonNegative = (object: Record<string, unknown>, key: string, label: string): number => integer(object[key], `${label}.${key}`);
  const summary = (object: Record<string, unknown>, label: string): Record<string, unknown> => {
    for (const key of Object.keys(object)) {
      if (key === "current") continue;
      if (["faceCount", "regionCount", "insideFaceCount", "outsideFaceCount", "insideRegionCount", "outsideRegionCount", "unclassifiedFaceCount", "boundaryFaceCount", "boundaryRegionCount", "overhangFaceCount", "overhangRegionCount", "ambiguousFaceCount", "ambiguousRegionCount"].includes(key)) nonNegative(object, key, label);
      else if (key === "boundaryThicknessMm" || key === "overhangAreaMm2" || key === "overhangAreaPercent") number(object, key, label);
    }
    return object;
  };
  summary(stage4, "snapshot.stage4"); summary(stage65, "snapshot.stage6_5"); summary(stage7, "snapshot.stage7"); summary(stage75, "snapshot.stage7_5");
  if (stage65.faceCount !== positions.length / 9 || stage7.faceCount !== positions.length / 9) throw new Error("snapshot stage readiness face counts do not match BODY mesh");
  const snapshotStage8: SkinRebuildPrintSnapshotData["stage8"] = {
    current: true,
    supportMode: stage8Root.supportMode,
    supportDiameterMm: number(stage8Root, "supportDiameterMm", "snapshot.stage8"),
    sparseSupportGenerated,
    supportGraphFingerprint: text(stage8Root.supportGraphFingerprint, "snapshot.stage8.supportGraphFingerprint"),
    supportGraphNodeCount: nonNegative(stage8Root, "supportGraphNodeCount", "snapshot.stage8"),
    supportGraphEdgeCount: nonNegative(stage8Root, "supportGraphEdgeCount", "snapshot.stage8"),
    unresolvedSupportCount: nonNegative(stage8Root, "unresolvedSupportCount", "snapshot.stage8"),
    acceptedBodyCollisionCount: nonNegative(stage8Root, "acceptedBodyCollisionCount", "snapshot.stage8"),
    diagnostics,
  };
  if (snapshotStage8.acceptedBodyCollisionCount !== 0 || !(snapshotStage8.supportDiameterMm > 0)) throw new Error("snapshot Stage 8 BODY collision or diameter evidence is invalid");
  const scaleMmPerUnit = number(gateRoot, "scaleMmPerUnit", "snapshot.internalPrintGate");
  if (!(scaleMmPerUnit > 0)) throw new Error("snapshot internal print gate scale is invalid");
  return {
    body: { fingerprint: text(body.fingerprint, "snapshot.body.fingerprint"), positions, normals, summary: text(body.summary, "snapshot.body.summary"), watertightOk: bodyWatertightOk, topologyDiagnostics },
    componentSelection: { explicit: boolean(selectionRoot.explicit, "snapshot.componentSelection.explicit"), componentIds, triangleCount, cacheFingerprint },
    stage4: {
      current: true, faceCount: nonNegative(stage4, "faceCount", "snapshot.stage4"), regionCount: nonNegative(stage4, "regionCount", "snapshot.stage4"),
      insideFaceCount: nonNegative(stage4, "insideFaceCount", "snapshot.stage4"), outsideFaceCount: nonNegative(stage4, "outsideFaceCount", "snapshot.stage4"),
      insideRegionCount: nonNegative(stage4, "insideRegionCount", "snapshot.stage4"), outsideRegionCount: nonNegative(stage4, "outsideRegionCount", "snapshot.stage4"), unclassifiedFaceCount: nonNegative(stage4, "unclassifiedFaceCount", "snapshot.stage4"),
    },
    stage6_5: {
      current: true, faceCount: nonNegative(stage65, "faceCount", "snapshot.stage6_5"), insideFaceCount: nonNegative(stage65, "insideFaceCount", "snapshot.stage6_5"), outsideFaceCount: nonNegative(stage65, "outsideFaceCount", "snapshot.stage6_5"), boundaryFaceCount: nonNegative(stage65, "boundaryFaceCount", "snapshot.stage6_5"), unclassifiedFaceCount: nonNegative(stage65, "unclassifiedFaceCount", "snapshot.stage6_5"), boundaryRegionCount: nonNegative(stage65, "boundaryRegionCount", "snapshot.stage6_5"), boundaryThicknessMm: number(stage65, "boundaryThicknessMm", "snapshot.stage6_5"),
    },
    stage7: {
      current: true, faceCount: nonNegative(stage7, "faceCount", "snapshot.stage7"), overhangFaceCount: nonNegative(stage7, "overhangFaceCount", "snapshot.stage7"), overhangRegionCount: nonNegative(stage7, "overhangRegionCount", "snapshot.stage7"), overhangAreaMm2: number(stage7, "overhangAreaMm2", "snapshot.stage7"), overhangAreaPercent: number(stage7, "overhangAreaPercent", "snapshot.stage7"),
    },
    stage7_5: {
      current: true, insideFaceCount: nonNegative(stage75, "insideFaceCount", "snapshot.stage7_5"), outsideFaceCount: nonNegative(stage75, "outsideFaceCount", "snapshot.stage7_5"), ambiguousFaceCount: nonNegative(stage75, "ambiguousFaceCount", "snapshot.stage7_5"), ambiguousRegionCount: nonNegative(stage75, "ambiguousRegionCount", "snapshot.stage7_5"),
    },
    stage8: snapshotStage8,
    internalPrintGate: { fingerprint: text(gateRoot.fingerprint, "snapshot.internalPrintGate.fingerprint"), report, stl, summary: text(gateRoot.summary, "snapshot.internalPrintGate.summary"), scaleMmPerUnit, plateShiftSourceZ: number(gateRoot, "plateShiftSourceZ", "snapshot.internalPrintGate") },
  };
}

export function skinRebuildPrintSnapshotGraphFingerprint(graph: InternalStructureGraph): string {
  return JSON.stringify(graph);
}
