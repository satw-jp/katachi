/** Renderer- and host-independent contracts for FORM observation. */

export type Vec3 = readonly [number, number, number];

export interface FiniteBounds {
  readonly min: Vec3;
  readonly max: Vec3;
}

export type FormSourceKind = "cloud-sdf" | "triangle-mesh" | "katachi-snapshot";

export interface CoordinateProvenance {
  readonly handedness: "right";
  readonly canonicalUp: "y";
  readonly sourceUp: "x" | "y" | "z" | "unknown";
  /** Row-major, source-to-canonical, homogeneous 4×4 matrix. */
  readonly sourceToCanonical: readonly [
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
  ];
  readonly provenance: "snapshot" | "author" | "assumed";
}

export interface PhysicalScaleProvenance {
  readonly mmPerShapeUnit: number | null;
  readonly provenance: "snapshot" | "author" | "derived" | "assumed" | "unknown";
}

export interface SdfBall {
  readonly center: Vec3;
  readonly radius: number;
}

/** A structured-clone-safe description of the current Cloud Sculpt field. */
export interface SdfBallUnionRepresentation {
  readonly kind: "sdf-ball-union";
  readonly balls: readonly SdfBall[];
  /** Polynomial smooth-min strength; zero is a hard union. */
  readonly smoothness: number;
  /** Bounds deliberately large enough to contain the represented zero surface. */
  readonly conservativeBounds: FiniteBounds;
}

export type FormRepresentation = SdfBallUnionRepresentation;

export interface FormGeometry {
  readonly sourceId: string;
  readonly revision: string;
  readonly contentHash: string;
  readonly sourceKind: FormSourceKind;
  readonly coordinateSystem: CoordinateProvenance;
  readonly physicalScale: PhysicalScaleProvenance;
  readonly representation: FormRepresentation;
  readonly warnings: readonly string[];
}

export type SupportedPointBudget = 20_000 | 40_000 | 80_000 | 160_000;
export const SUPPORTED_POINT_BUDGETS: readonly SupportedPointBudget[] = [20_000, 40_000, 80_000, 160_000];

export type HikariObservationMode = "form" | "flow" | "optics";

export interface FormObservationSettings {
  readonly layout: "quad" | "single";
  readonly activePanel: "top" | "front" | "side" | "principal";
  readonly pointBudget: SupportedPointBudget;
  readonly pointSize: number;
  readonly zoom: number;
  readonly pan: readonly [number, number];
  readonly pcaBasis: readonly number[] | null;
  readonly pcaSourceHash: string | null;
}

export interface SamplingProgress {
  readonly stage: "validating" | "sampling" | "pca" | "complete";
  readonly fraction: number;
  readonly message: string;
}

export interface SamplingDiagnostics {
  readonly identity: string;
  readonly samplingVersion: string;
  readonly candidateCount: number;
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly nonconvergedCount: number;
  readonly totalIterations: number;
  readonly maxIterations: number;
  readonly maxResidual: number;
  readonly meanResidual: number;
  readonly limitations: readonly string[];
  readonly warnings: readonly string[];
}

export interface FormPointSet {
  readonly positions: Float32Array;
  readonly pointCount: number;
  readonly bounds: FiniteBounds;
  readonly diagnostics: SamplingDiagnostics;
}

export interface PcaResult {
  readonly centroid: Vec3;
  /** Descending PC1–PC3, row-major as three vectors. */
  readonly basis: readonly [Vec3, Vec3, Vec3];
  readonly eigenvalues: readonly [number, number, number];
  readonly ambiguous: boolean;
  readonly basisProvenance: "principal-components" | "world-axis-fallback";
  readonly warning: string | null;
}

export type ProjectionName = "top" | "front" | "side" | "principal";

export interface ProjectionFrame {
  readonly name: ProjectionName;
  readonly center: readonly [number, number];
  readonly horizontalAxis: Vec3;
  readonly verticalAxis: Vec3;
  readonly extent: readonly [number, number];
}

export interface CameraFit {
  readonly commonProjectedExtent: number;
  readonly padding: number;
  readonly orthographicSpan: number;
  readonly frames: readonly ProjectionFrame[];
}

export interface SamplingWorkerRequest {
  readonly type: "sample";
  readonly requestId: string;
  readonly geometry: FormGeometry;
  readonly pointBudget: SupportedPointBudget;
  readonly samplingVersion?: string;
}

export interface SamplingWorkerProgress {
  readonly type: "progress";
  readonly requestId: string;
  readonly progress: SamplingProgress;
}

export interface SamplingWorkerResult {
  readonly type: "result";
  readonly requestId: string;
  readonly pointSet: FormPointSet;
  readonly pca: PcaResult;
  readonly cameraFit: CameraFit;
}

export interface SamplingWorkerError {
  readonly type: "error";
  readonly requestId: string;
  readonly error: string;
}

export type SamplingWorkerResponse = SamplingWorkerProgress | SamplingWorkerResult | SamplingWorkerError;
