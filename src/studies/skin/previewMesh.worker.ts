import { buildSkinMesh } from "./meshExport.ts";
import { packPreviewMeshBuffers } from "./previewMeshBuffers.ts";
import type { PreviewMeshRequest, PreviewMeshWorkerMessage } from "./previewMeshWorkerProtocol.ts";
import { buildParallelMeshBuffers, type ParallelMeshBuffers } from "./parallelMeshBuffers.ts";

self.onmessage = async (event: MessageEvent<PreviewMeshRequest>) => {
  const request = event.data;
  if (request.type !== "build") return;
  const started = performance.now();
  try {
    let buffers: ParallelMeshBuffers;
    try {
      buffers = await buildParallelMeshBuffers(request);
    } catch {
      const mesh = buildSkinMesh(
        request.mode, request.host, request.hostK, request.thickness, request.patches, request.roundK,
        { resolution: request.resolution, targetLongestMm: request.targetLongestMm },
        request.coinBulge, request.quadMeshJoinWidth, request.coinBulgeBalance, request.internalGraph,
      );
      const packed = packPreviewMeshBuffers(mesh.triangles);
      buffers = { ...packed, faceCount: mesh.triangles.length };
    }
    const message: PreviewMeshWorkerMessage = {
      type: "result",
      requestId: request.requestId,
      generation: request.generation,
      positions: buffers.positions,
      normals: buffers.normals,
      faceCount: buffers.faceCount,
      resolution: request.resolution,
      elapsedMs: performance.now() - started,
    };
    (self as unknown as Worker).postMessage(message, [buffers.positions.buffer, buffers.normals.buffer]);
  } catch (error) {
    const message: PreviewMeshWorkerMessage = {
      type: "error",
      requestId: request.requestId,
      generation: request.generation,
      message: (error as Error).message,
      elapsedMs: performance.now() - started,
    };
    (self as unknown as Worker).postMessage(message);
  }
};
