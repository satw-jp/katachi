import type { CameraFit, FormGeometry, FormPointSet, PcaResult } from "./contracts.ts";

export interface CachedFormResult {
  readonly pointSet: FormPointSet;
  readonly pca: PcaResult;
  readonly cameraFit: CameraFit;
  /** Geometry snapshot which actually produced this displayed point set. */
  readonly geometry: FormGeometry;
}

export function cacheFormResult(pointSet: FormPointSet, pca: PcaResult, cameraFit: CameraFit, geometry: FormGeometry): CachedFormResult {
  return { pointSet, pca, cameraFit, geometry: structuredClone(geometry) };
}
