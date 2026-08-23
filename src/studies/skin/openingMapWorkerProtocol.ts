import type { Ball } from "../cloud-sculpt/field.ts";
import type { Triangle } from "../cloud-sculpt/meshExport.ts";
import type { Patch, SkinMode } from "./field.ts";

/** Immutable field snapshot.  The main thread clones all nested arrays before
 * posting, so the measurement can never observe a later author edit. */
export interface OpeningMapRequest {
  type: "measure";
  requestId: number;
  generation: number;
  host: Ball[];
  hostK: number;
  thickness: number;
  patches: Patch[];
  roundK: number;
  coinBulge: number;
  coinBulgeBalance: number;
  quadMeshJoinWidth: number;
  mode: SkinMode;
  resolution: number;
  targetLongestMm: number;
  automaticOffset?: boolean;
  offsetMm: number;
  minAreaMm2: number;
}

export interface OpeningMeasurement {
  id: string;
  colorIndex: number;
  color: string;
  areaMm2: number;
  perimeterMm: number;
  shapeIndex: number;
  centroid: { x: number; y: number; z: number };
  averageNormal: { x: number; y: number; z: number };
  triangles: Triangle[];
}

export interface OpeningMapResult {
  openings: OpeningMeasurement[];
  /** Actual full current-shape mesh, built with buildSkinMesh's exact contract. */
  meshTriangles: Triangle[];
  scaleMmPerUnit: number;
  resolution: number;
  targetLongestMm: number;
  automaticOffset: boolean;
  requestedOffsetMm: number;
  offsetMm: number;
  minAreaMm2: number;
  /** Fraction of the sampled host-offset surface classified as uncovered.
   * This is a finite-resolution diagnostic, not an exact boolean area. */
  uncoveredSurfaceFraction: number;
  /** True when a positive offset has moved beyond the motif relief so that
   * almost the whole host becomes one connected "opening". */
  likelyMergedByOffset: boolean;
}

export type OpeningMapWorkerMessage =
  | { type: "progress"; requestId: number; generation: number; stage: string; elapsedMs: number }
  | { type: "result"; requestId: number; generation: number; result: OpeningMapResult; elapsedMs: number }
  | { type: "error"; requestId: number; generation: number; message: string; elapsedMs: number };
