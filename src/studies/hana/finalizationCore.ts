import {
  defaultHanaMaterialSettings,
  type HanaMaterialSettings,
} from "./authoringDocument.ts";
import {
  buildPointField,
  buildPointFieldMeshCooperative,
  createPointFieldEvaluationStats,
  diagnosePointField,
  pointFieldEffectiveResolution,
  sampleMaterialSamples,
  type HanaPointFieldEvaluationStats,
} from "./materialField.ts";
import {
  sampleSmoothCenterline,
} from "./smoothCenterline.ts";
import type {
  HanaCurveSettings,
  HanaStroke3D,
  HanaStroke3DControlPoint,
  HanaVector3,
} from "./stroke3d.ts";
import type { HanaPreviewSurface } from "./materialField.ts";

export const HANA_FINALIZATION_SNAPSHOT_FORMAT = "katachi.hana-finalization-snapshot.v0" as const;
export const HANA_FINALIZATION_RESULT_FORMAT = "katachi.hana-finalization-result.v0" as const;
export const HANA_FINALIZATION_ALGORITHM_VERSION = "hana-cpu-js-v0" as const;

export interface HanaUnitMetadata {
  lengthUnit: "object";
  scaleToMillimetres: number;
}

export interface HanaFinalizationSnapshotV0 {
  format: typeof HANA_FINALIZATION_SNAPSHOT_FORMAT;
  requestId: string;
  documentId: string;
  documentRevision: number;
  objectId: string;
  objectRevision: number;
  generationId: number;
  algorithmVersion: string;
  authoringTolerance: number;
  units: HanaUnitMetadata;
  sourceStrokeIds: string[];
  controls: HanaStroke3DControlPoint[];
  curveSettings: HanaCurveSettings;
  materialSettings: HanaMaterialSettings;
  gestureMaterialSettings: {
    mapping: HanaMaterialSettings["mapping"];
    pressureInfluence: number;
    speedInfluence: number;
  };
  boundsHint?: HanaBounds3;
}

export interface HanaBounds3 {
  min: HanaVector3;
  max: HanaVector3;
}

export interface HanaFinalizationStageTimings {
  smoothCenterline: number;
  materialSamples: number;
  fieldPreparation: number;
  effectiveResolution: number;
  meshGeneration: number;
  validation: number;
  total: number;
}

export interface HanaFinalizationValidation {
  finite: boolean;
  nonEmpty: boolean;
  watertight: boolean;
  components: number;
  errors: string[];
}

export interface HanaFinalizationResultV0 {
  format: typeof HANA_FINALIZATION_RESULT_FORMAT;
  requestId: string;
  documentRevision: number;
  objectId: string;
  objectRevision: number;
  generationId: number;
  algorithmVersion: string;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  bounds: HanaBounds3;
  counts: {
    controls: number;
    smooth: number;
    materialSamples: number;
    voxels: number;
    candidates: number;
    triangles: number;
    components: number;
    effectiveResolution: number;
  };
  timings: HanaFinalizationStageTimings;
  validation: HanaFinalizationValidation;
}

export interface HanaComputeCancellation {
  isCancelled(): boolean;
}

export interface HanaFinalizationComputeOptions {
  resolution?: number;
  zSlicesPerYield?: number;
  yieldToBrowser?: () => Promise<void>;
}

function cloneVector(value: HanaVector3): HanaVector3 {
  return { x: value.x, y: value.y, z: value.z };
}

function cloneControlPoint(value: HanaStroke3DControlPoint): HanaStroke3DControlPoint {
  return {
    ...value,
    position: cloneVector(value.position),
    provenance: { ...value.provenance },
  };
}

function cloneMaterialSettings(value: HanaMaterialSettings): HanaMaterialSettings {
  return { ...defaultHanaMaterialSettings(value.baseRadius), ...value };
}

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function boundsHintForControls(controls: readonly HanaStroke3DControlPoint[]): HanaBounds3 | undefined {
  if (controls.length === 0) return undefined;
  const min = cloneVector(controls[0].position);
  const max = cloneVector(controls[0].position);
  for (const control of controls.slice(1)) {
    min.x = Math.min(min.x, control.position.x);
    min.y = Math.min(min.y, control.position.y);
    min.z = Math.min(min.z, control.position.z);
    max.x = Math.max(max.x, control.position.x);
    max.y = Math.max(max.y, control.position.y);
    max.z = Math.max(max.z, control.position.z);
  }
  return { min, max };
}

/** Convert only the edited object into a deterministic, non-authoritative request. */
export function createHanaFinalizationSnapshot(input: {
  requestId: string;
  documentId: string;
  documentRevision: number;
  objectRevision: number;
  generationId: number;
  stroke: HanaStroke3D;
  materialSettings?: HanaMaterialSettings;
  authoringTolerance?: number;
  units?: HanaUnitMetadata;
}): HanaFinalizationSnapshotV0 {
  const materialSettings = cloneMaterialSettings(
    input.materialSettings ?? defaultHanaMaterialSettings(),
  );
  return {
    format: HANA_FINALIZATION_SNAPSHOT_FORMAT,
    requestId: input.requestId,
    documentId: input.documentId,
    documentRevision: Math.max(0, Math.trunc(input.documentRevision)),
    objectId: input.stroke.id,
    objectRevision: Math.max(0, Math.trunc(input.objectRevision)),
    generationId: Math.max(0, Math.trunc(input.generationId)),
    algorithmVersion: HANA_FINALIZATION_ALGORITHM_VERSION,
    authoringTolerance: finite(input.authoringTolerance ?? 0.09, 0.09),
    units: { ...(input.units ?? { lengthUnit: "object", scaleToMillimetres: 1 }) },
    sourceStrokeIds: [input.stroke.sourceGestureId],
    controls: input.stroke.controlPoints.map(cloneControlPoint),
    curveSettings: { ...input.stroke.curve },
    materialSettings,
    gestureMaterialSettings: {
      mapping: materialSettings.mapping,
      pressureInfluence: materialSettings.pressureInfluence,
      speedInfluence: materialSettings.speedInfluence,
    },
    boundsHint: boundsHintForControls(input.stroke.controlPoints),
  };
}

/** JSON is intentionally limited to authoring-derived request metadata, never the whole document. */
export function serializeHanaFinalizationSnapshot(snapshot: HanaFinalizationSnapshotV0): string {
  return JSON.stringify(snapshot);
}

function assertRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Finalization snapshot must be an object");
  return value as Record<string, unknown>;
}

function assertFiniteVector(value: unknown, label: string): HanaVector3 {
  const record = assertRecord(value);
  const vector = { x: record.x, y: record.y, z: record.z };
  if (![vector.x, vector.y, vector.z].every((item) => typeof item === "number" && Number.isFinite(item))) {
    throw new Error(`${label} must be a finite vector`);
  }
  return vector as HanaVector3;
}

/** Validate a wire snapshot before it reaches any compute engine. */
export function parseHanaFinalizationSnapshot(value: unknown): HanaFinalizationSnapshotV0 {
  const record = assertRecord(value);
  if (record.format !== HANA_FINALIZATION_SNAPSHOT_FORMAT) throw new Error("Unsupported finalization snapshot format");
  if (typeof record.requestId !== "string" || record.requestId.length === 0) throw new Error("Finalization requestId is required");
  if (typeof record.documentId !== "string" || typeof record.objectId !== "string") throw new Error("Finalization source identity is required");
  if (record.algorithmVersion !== HANA_FINALIZATION_ALGORITHM_VERSION) throw new Error("Unsupported finalization algorithm version");
  if (!Array.isArray(record.controls) || record.controls.length === 0) throw new Error("Finalization controls are required");
  const controls = record.controls.map((value, index) => {
    const point = assertRecord(value);
    const provenance = assertRecord(point.provenance);
    if (typeof point.id !== "string" || typeof provenance.sourceStroke !== "string") throw new Error(`Invalid control provenance at ${index}`);
    return {
      id: point.id,
      position: assertFiniteVector(point.position, `control ${index}`),
      provenance: {
        sourceStroke: provenance.sourceStroke,
        sourceT: finite(Number(provenance.sourceT)),
        sourcePointStart: Math.trunc(Number(provenance.sourcePointStart)),
        sourcePointEnd: Math.trunc(Number(provenance.sourcePointEnd)),
        pressure: finite(Number(provenance.pressure)),
        time: finite(Number(provenance.time)),
      },
    };
  });
  const curve = assertRecord(record.curveSettings);
  const material = assertRecord(record.materialSettings);
  const units = assertRecord(record.units);
  if (units.lengthUnit !== "object" || typeof units.scaleToMillimetres !== "number" || !Number.isFinite(units.scaleToMillimetres)) {
    throw new Error("Invalid finalization units");
  }
  const settings = cloneMaterialSettings(material as unknown as HanaMaterialSettings);
  return {
    format: HANA_FINALIZATION_SNAPSHOT_FORMAT,
    requestId: record.requestId,
    documentId: record.documentId,
    documentRevision: Math.max(0, Math.trunc(Number(record.documentRevision))),
    objectId: record.objectId,
    objectRevision: Math.max(0, Math.trunc(Number(record.objectRevision))),
    generationId: Math.max(0, Math.trunc(Number(record.generationId))),
    algorithmVersion: record.algorithmVersion,
    authoringTolerance: finite(Number(record.authoringTolerance), 0.09),
    units: { lengthUnit: "object", scaleToMillimetres: units.scaleToMillimetres },
    sourceStrokeIds: Array.isArray(record.sourceStrokeIds)
      ? record.sourceStrokeIds.filter((item): item is string => typeof item === "string")
      : [],
    controls,
    curveSettings: curve as unknown as HanaCurveSettings,
    materialSettings: settings,
    gestureMaterialSettings: {
      mapping: settings.mapping,
      pressureInfluence: settings.pressureInfluence,
      speedInfluence: settings.speedInfluence,
    },
    boundsHint: record.boundsHint === undefined ? undefined : {
      min: assertFiniteVector(assertRecord(record.boundsHint).min, "bounds.min"),
      max: assertFiniteVector(assertRecord(record.boundsHint).max, "bounds.max"),
    },
  };
}

function strokeFromSnapshot(snapshot: HanaFinalizationSnapshotV0): HanaStroke3D {
  return {
    id: snapshot.objectId,
    sourceGestureId: snapshot.sourceStrokeIds[0] ?? snapshot.objectId,
    sourceViewportId: "remote",
    sourceViewDirection: "front",
    initialPlaneValue: snapshot.controls[0]?.position.y ?? 0,
    curve: { ...snapshot.curveSettings },
    controlPoints: snapshot.controls.map(cloneControlPoint),
  };
}

function defaultCancellation(): HanaComputeCancellation {
  return { isCancelled: () => false };
}

function yieldToComputeHost(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function finiteMeshData(mesh: HanaPreviewSurface): boolean {
  return mesh.triangles.every((triangle) => [triangle.a, triangle.b, triangle.c].every((point) => (
    Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)
  )));
}

function meshToTypedArrays(mesh: HanaPreviewSurface): {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
} {
  const positions = new Float32Array(mesh.triangles.length * 9);
  const normals = new Float32Array(mesh.triangles.length * 9);
  const indices = new Uint32Array(mesh.triangles.length * 3);
  let positionOffset = 0;
  let indexOffset = 0;
  mesh.triangles.forEach((triangle, triangleIndex) => {
    const ax = triangle.b.x - triangle.a.x;
    const ay = triangle.b.y - triangle.a.y;
    const az = triangle.b.z - triangle.a.z;
    const bx = triangle.c.x - triangle.a.x;
    const by = triangle.c.y - triangle.a.y;
    const bz = triangle.c.z - triangle.a.z;
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    const length = Math.hypot(nx, ny, nz);
    const normal = length > Number.EPSILON ? [nx / length, ny / length, nz / length] : [0, 0, 1];
    for (const point of [triangle.a, triangle.b, triangle.c]) {
      positions[positionOffset] = point.x;
      normals[positionOffset++] = normal[0];
      positions[positionOffset] = point.y;
      normals[positionOffset++] = normal[1];
      positions[positionOffset] = point.z;
      normals[positionOffset++] = normal[2];
    }
    indices[indexOffset] = triangleIndex * 3;
    indices[indexOffset + 1] = triangleIndex * 3 + 1;
    indices[indexOffset + 2] = triangleIndex * 3 + 2;
    indexOffset += 3;
  });
  return { positions, normals, indices };
}

function resultBounds(mesh: HanaPreviewSurface): HanaBounds3 {
  return {
    min: cloneVector(mesh.sourceBounds.min),
    max: cloneVector(mesh.sourceBounds.max),
  };
}

function statsForField(stats: HanaPointFieldEvaluationStats): {
  voxels: number;
  candidates: number;
  effectiveResolution: number;
} {
  const grid = stats.gridShape;
  return {
    voxels: grid ? (grid.nx + 1) * (grid.ny + 1) * (grid.nz + 1) : 0,
    candidates: stats.candidateEvaluationCount,
    effectiveResolution: stats.effectiveResolution ?? 0,
  };
}

function assertNotCancelled(cancellation: HanaComputeCancellation): void {
  if (cancellation.isCancelled()) throw new Error("HANA_FINALIZATION_CANCELLED");
}

/** Shared Local/Remote CPU implementation. Three.js and DOM are deliberately absent. */
export async function computeHanaFinalization(
  sourceSnapshot: HanaFinalizationSnapshotV0,
  cancellation: HanaComputeCancellation = defaultCancellation(),
  options: HanaFinalizationComputeOptions = {},
): Promise<HanaFinalizationResultV0> {
  const started = performance.now();
  const snapshot = parseHanaFinalizationSnapshot(sourceSnapshot);
  assertNotCancelled(cancellation);
  const stroke = strokeFromSnapshot(snapshot);
  const smoothStarted = performance.now();
  const smooth = sampleSmoothCenterline(stroke);
  const smoothMilliseconds = performance.now() - smoothStarted;
  assertNotCancelled(cancellation);
  const materialStarted = performance.now();
  const materialSamples = sampleMaterialSamples(smooth, snapshot.materialSettings.baseRadius);
  const materialMilliseconds = performance.now() - materialStarted;
  assertNotCancelled(cancellation);
  const fieldStarted = performance.now();
  const field = buildPointField(materialSamples, snapshot.materialSettings.baseRadius);
  const fieldStats = createPointFieldEvaluationStats();
  const fieldMilliseconds = performance.now() - fieldStarted;
  assertNotCancelled(cancellation);
  const resolutionStarted = performance.now();
  const requestedResolution = Math.max(8, Math.round(options.resolution ?? 48));
  const effectiveResolution = pointFieldEffectiveResolution(field, requestedResolution);
  const resolutionMilliseconds = performance.now() - resolutionStarted;
  assertNotCancelled(cancellation);
  const meshStarted = performance.now();
  const mesh = await buildPointFieldMeshCooperative(field, effectiveResolution, fieldStats, {
    zSlicesPerYield: options.zSlicesPerYield ?? 4,
    yieldToBrowser: options.yieldToBrowser ?? yieldToComputeHost,
    shouldContinue: () => !cancellation.isCancelled(),
  });
  const meshMilliseconds = performance.now() - meshStarted;
  assertNotCancelled(cancellation);
  const validationStarted = performance.now();
  const diagnostics = diagnosePointField(field, requestedResolution, mesh, { scanGrid: false });
  const arrays = meshToTypedArrays(mesh);
  const validationErrors: string[] = [];
  if (!finiteMeshData(mesh)) validationErrors.push("mesh contains non-finite vertices");
  if (mesh.triangles.length === 0) validationErrors.push("mesh is empty");
  if (arrays.positions.some((value) => !Number.isFinite(value)) || arrays.normals.some((value) => !Number.isFinite(value))) {
    validationErrors.push("typed arrays contain non-finite values");
  }
  const validationMilliseconds = performance.now() - validationStarted;
  const fieldStatsSummary = statsForField(fieldStats);
  const counts = {
    controls: snapshot.controls.length,
    smooth: smooth.length,
    materialSamples: materialSamples.length,
    voxels: fieldStatsSummary.voxels,
    candidates: fieldStatsSummary.candidates,
    triangles: mesh.triangles.length,
    components: diagnostics.componentCount,
    effectiveResolution: effectiveResolution || fieldStatsSummary.effectiveResolution,
  };
  return {
    format: HANA_FINALIZATION_RESULT_FORMAT,
    requestId: snapshot.requestId,
    documentRevision: snapshot.documentRevision,
    objectId: snapshot.objectId,
    objectRevision: snapshot.objectRevision,
    generationId: snapshot.generationId,
    algorithmVersion: snapshot.algorithmVersion,
    positions: arrays.positions,
    normals: arrays.normals,
    indices: arrays.indices,
    bounds: resultBounds(mesh),
    counts,
    timings: {
      smoothCenterline: smoothMilliseconds,
      materialSamples: materialMilliseconds,
      fieldPreparation: fieldMilliseconds,
      effectiveResolution: resolutionMilliseconds,
      meshGeneration: meshMilliseconds,
      validation: validationMilliseconds,
      total: performance.now() - started,
    },
    validation: {
      finite: validationErrors.length === 0,
      nonEmpty: mesh.triangles.length > 0,
      watertight: mesh.watertight.ok,
      components: diagnostics.componentCount,
      errors: validationErrors,
    },
  };
}

export function finalizationResultToTriangles(result: HanaFinalizationResultV0): Array<{
  a: HanaVector3;
  b: HanaVector3;
  c: HanaVector3;
}> {
  const triangles = [] as Array<{ a: HanaVector3; b: HanaVector3; c: HanaVector3 }>;
  for (let offset = 0; offset + 8 < result.positions.length; offset += 9) {
    triangles.push({
      a: { x: result.positions[offset], y: result.positions[offset + 1], z: result.positions[offset + 2] },
      b: { x: result.positions[offset + 3], y: result.positions[offset + 4], z: result.positions[offset + 5] },
      c: { x: result.positions[offset + 6], y: result.positions[offset + 7], z: result.positions[offset + 8] },
    });
  }
  return triangles;
}
