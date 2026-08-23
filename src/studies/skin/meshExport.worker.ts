import { encodeBinaryStl, encodeObj } from "../cloud-sculpt/meshExport.ts";
import { buildSkinMesh, meshSummary } from "./meshExport.ts";
import { buildParallelSkinMesh } from "./parallelMeshBuffers.ts";
import type { MeshExportRequest, MeshExportWorkerMessage } from "./meshExportWorkerProtocol.ts";

self.onmessage = async (event: MessageEvent<MeshExportRequest>) => {
  const request = event.data;
  if (request.type !== "export") return;
  const started = performance.now();
  try {
    let result: ReturnType<typeof buildSkinMesh>;
    try {
      let faceCount = 0;
      result = await buildParallelSkinMesh({ ...request, type: "build" }, (completedSlices, totalSlices, sliceFaceCount) => {
        faceCount += sliceFaceCount;
        const progress: MeshExportWorkerMessage = {
          type: "progress",
          requestId: request.requestId,
          generation: request.generation,
          completedSlices,
          totalSlices,
          faceCount,
          elapsedMs: performance.now() - started,
        };
        (self as unknown as Worker).postMessage(progress);
      });
    } catch {
      result = buildSkinMesh(
        request.mode, request.host, request.hostK, request.thickness, request.patches, request.roundK,
        { resolution: request.resolution, targetLongestMm: request.targetLongestMm },
        request.coinBulge, request.quadMeshJoinWidth, request.coinBulgeBalance, request.internalGraph,
      );
    }
    const stl = request.operation === "inspect" ? new ArrayBuffer(0) : encodeBinaryStl(result, request.baseName);
    const obj = request.operation === "export" ? encodeObj(result) : "";
    const message: MeshExportWorkerMessage = {
      type: "result",
      requestId: request.requestId,
      generation: request.generation,
      stl,
      obj,
      summary: meshSummary(result),
      watertightOk: result.watertight.ok,
      elapsedMs: performance.now() - started,
    };
    (self as unknown as Worker).postMessage(message, [stl]);
  } catch (error) {
    const message: MeshExportWorkerMessage = {
      type: "error",
      requestId: request.requestId,
      generation: request.generation,
      message: (error as Error).message,
      elapsedMs: performance.now() - started,
    };
    (self as unknown as Worker).postMessage(message);
  }
};
