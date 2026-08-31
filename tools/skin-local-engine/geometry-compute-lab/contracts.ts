export const GEOMETRY_COMPUTE_LAB_CONTRACT =
  "katachi.skin.geometry-compute-lab.v1" as const;
export const MESH_ANALYSIS_FIELD_ALGORITHM =
  "katachi.skin.evaluate-mesh-analysis-field.v1" as const;
export const SDF_GRID_ALGORITHM =
  "katachi.skin.evaluate-sdf-grid.v1" as const;
export const GEOMETRY_ROUTES_ALGORITHM =
  "katachi.skin.evaluate-geometry-routes.v1" as const;

export type GeometryComputeBackend = "web" | "cuda";

export interface GeometryComputePolicy {
  authoritativeBackend: "web";
  candidateBackend: "cuda";
  shadow: true;
  productionApplied: false;
}

export const SHADOW_GEOMETRY_COMPUTE_POLICY: GeometryComputePolicy = Object.freeze({
  authoritativeBackend: "web",
  candidateBackend: "cuda",
  shadow: true,
  productionApplied: false,
});

export interface GeometryComputeIdentity {
  requestId: string;
  projectFingerprint: `sha256:${string}`;
  coordinateFrame: "object" | "millimeter";
  unitsPerMillimeter: number;
}

export interface GeometryComputePoint {
  x: number;
  y: number;
  z: number;
}

export interface GeometryComputeBall extends GeometryComputePoint {
  id: number;
  r: number;
}

export interface MetaballFieldSnapshot {
  kind: "metaball-smooth-union";
  contractVersion: 1;
  balls: readonly GeometryComputeBall[];
  smoothness: number;
}

export interface MeshAnalysisFieldRequest extends GeometryComputeIdentity {
  contract: typeof GEOMETRY_COMPUTE_LAB_CONTRACT;
  operation: "evaluateMeshAnalysisField";
  algorithmContract: typeof MESH_ANALYSIS_FIELD_ALGORITHM;
  topologyFingerprint: `sha256:${string}`;
  /** Triangle soup, nine float values per stable face index. */
  positions: Float32Array;
  baseField: MetaballFieldSnapshot;
  buildAxis: "+z";
  requestedFields: readonly ["insideScore", "overhangAngleDeg"];
}

export interface MeshAnalysisFieldResult {
  contract: typeof GEOMETRY_COMPUTE_LAB_CONTRACT;
  operation: "evaluateMeshAnalysisField";
  algorithmContract: typeof MESH_ANALYSIS_FIELD_ALGORITHM;
  topologyFingerprint: `sha256:${string}`;
  /** Stable face index is the identity table; no per-face strings cross the backend. */
  faceIndices: Uint32Array;
  /** Web authority keeps float64; a CUDA candidate may be reconstructed from float32. */
  insideScore: Float64Array;
  overhangAngleDeg: Float32Array;
  fieldBackends: {
    insideScore: GeometryComputeBackend;
    overhangAngleDeg: "web";
  };
  policy: GeometryComputePolicy;
}

export interface SdfGridRequest extends GeometryComputeIdentity {
  contract: typeof GEOMETRY_COMPUTE_LAB_CONTRACT;
  operation: "evaluateSdfGrid";
  algorithmContract: typeof SDF_GRID_ALGORITHM;
  fieldFingerprint: `sha256:${string}`;
  field: MetaballFieldSnapshot;
  bounds: { min: GeometryComputePoint; max: GeometryComputePoint };
  dimensions: { x: number; y: number; z: number };
  sampleOrder: "x-fastest-y-z";
}

export interface SdfGridResult {
  contract: typeof GEOMETRY_COMPUTE_LAB_CONTRACT;
  operation: "evaluateSdfGrid";
  algorithmContract: typeof SDF_GRID_ALGORITHM;
  fieldFingerprint: `sha256:${string}`;
  values: Float32Array;
  sampleOrder: "x-fastest-y-z";
  backend: GeometryComputeBackend;
  policy: GeometryComputePolicy;
}

export interface GeometryRouteInput {
  routeIndex: number;
  routeId: string;
  radius: number;
  polyline: readonly GeometryComputePoint[];
}

/**
 * Draft semantic boundary shared by future Stage 5B, Stage 8 and Web routing.
 * CUDA reports geometric facts only; route acceptance remains browser/CPU-owned.
 */
export interface EvaluateGeometryRoutesRequest extends GeometryComputeIdentity {
  contract: typeof GEOMETRY_COMPUTE_LAB_CONTRACT;
  operation: "evaluateGeometryRoutes";
  algorithmContract: typeof GEOMETRY_ROUTES_ALGORITHM;
  routes: readonly GeometryRouteInput[];
  bodyFieldFingerprint: `sha256:${string}`;
  permanentWebFingerprint?: `sha256:${string}`;
  minimumClearance: number;
}

export interface GeometryRouteObservation {
  routeIndex: number;
  minimumBodyClearance: number;
  minimumWebClearance: number | null;
  minimumNeighborClearance: number | null;
  bodyCollision: boolean;
  webCollision: boolean;
  firstCollisionSegmentIndex: number | null;
  firstCollisionT: number | null;
}

export interface EvaluateGeometryRoutesResult {
  contract: typeof GEOMETRY_COMPUTE_LAB_CONTRACT;
  operation: "evaluateGeometryRoutes";
  algorithmContract: typeof GEOMETRY_ROUTES_ALGORITHM;
  observations: readonly GeometryRouteObservation[];
  policy: GeometryComputePolicy;
}

export function assertGeometryComputeIdentity(identity: GeometryComputeIdentity): void {
  if (!identity.requestId || !/^sha256:[0-9a-f]{64}$/i.test(identity.projectFingerprint)) {
    throw new Error("geometry compute identity is invalid");
  }
  if (!Number.isFinite(identity.unitsPerMillimeter) || identity.unitsPerMillimeter <= 0) {
    throw new Error("unitsPerMillimeter must be finite and positive");
  }
}
