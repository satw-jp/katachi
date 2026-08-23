import { buildSkinMeshTrianglesSlice } from "./meshExport.ts";
import { packPreviewMeshBuffers } from "./previewMeshBuffers.ts";
import type { PreviewMeshRequest } from "./previewMeshWorkerProtocol.ts";

export interface PreviewMeshSliceRequest {
  request: PreviewMeshRequest;
  sliceIndex: number;
  zStart: number;
  zEnd: number;
}

self.onmessage = (event: MessageEvent<PreviewMeshSliceRequest>) => {
  const { request, sliceIndex, zStart, zEnd } = event.data;
  try {
    const triangles = buildSkinMeshTrianglesSlice({
      mode: request.mode, host: request.host, hostK: request.hostK, thickness: request.thickness,
      patches: request.patches, roundK: request.roundK,
      options: { resolution: request.resolution, targetLongestMm: request.targetLongestMm },
      coinBulge: request.coinBulge, quadMeshJoinWidth: request.quadMeshJoinWidth,
      coinBulgeBalance: request.coinBulgeBalance, internalGraph: request.internalGraph,
      scaffoldPillars: request.scaffoldPillars, zStart, zEnd,
    });
    const buffers = request.positionsOnly
      ? { positions: new Float32Array(triangles.length * 9), normals: new Float32Array(0) }
      : packPreviewMeshBuffers(triangles);
    if (request.positionsOnly) {
      let offset = 0;
      for (const triangle of triangles) {
        for (const vertex of [triangle.a, triangle.b, triangle.c]) {
          buffers.positions[offset++] = vertex.x;
          buffers.positions[offset++] = vertex.y;
          buffers.positions[offset++] = vertex.z;
        }
      }
    }
    (self as unknown as Worker).postMessage({
      type: "result", sliceIndex, positions: buffers.positions, normals: buffers.normals,
      faceCount: triangles.length,
    }, [buffers.positions.buffer, buffers.normals.buffer]);
  } catch (error) {
    (self as unknown as Worker).postMessage({ type: "error", sliceIndex, message: (error as Error).message });
  }
};
