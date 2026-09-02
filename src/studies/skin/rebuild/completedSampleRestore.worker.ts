import {
  parseSkinRebuildFkei,
  projectFromSkinRebuildFkei,
} from "./fkei.ts";
import {
  decodeSkinRebuildPrintSnapshot,
} from "./printSnapshot.ts";
import type {
  CompletedSampleRestoreRequest,
  CompletedSampleRestoreWorkerMessage,
} from "./completedSampleRestoreProtocol.ts";

function post(message: CompletedSampleRestoreWorkerMessage, transfer: Transferable[] = []): void {
  (self as unknown as Worker).postMessage(message, transfer);
}

self.onmessage = (event: MessageEvent<CompletedSampleRestoreRequest>): void => {
  const startedAt = performance.now();
  try {
    const document = parseSkinRebuildFkei(event.data.text);
    post({
      type: "progress",
      stage: "document-parsed",
      elapsedMs: performance.now() - startedAt,
      patternCount: document.project.patterns.length,
      supportEdgeCount: document.project.printSupport.edges.length,
    });

    const project = projectFromSkinRebuildFkei(document);
    post({
      type: "progress",
      stage: "project-normalized",
      elapsedMs: performance.now() - startedAt,
      patternCount: project.patterns.length,
      supportEdgeCount: project.printSupport.edges.length,
    });

    const snapshot = document.printSnapshot
      ? decodeSkinRebuildPrintSnapshot(document.printSnapshot)
      : null;
    if (snapshot) {
      post({
        type: "progress",
        stage: "snapshot-decoded",
        elapsedMs: performance.now() - startedAt,
        supportEdgeCount: snapshot.stage8.supportGraphEdgeCount,
      });
    }

    const printSnapshot = document.printSnapshot;
    const message: CompletedSampleRestoreWorkerMessage = {
      type: "result",
      project,
      ...(document.shapeRecipe === undefined ? {} : { shapeRecipe: document.shapeRecipe }),
      ...(printSnapshot === undefined ? {} : {
        printSnapshot: {
          version: printSnapshot.version,
          sourceGeometryFingerprint: printSnapshot.sourceGeometryFingerprint,
          pipelineFingerprint: printSnapshot.pipelineFingerprint,
          payloadSha256: printSnapshot.payloadSha256,
        },
      }),
      snapshot,
      workerElapsedMs: performance.now() - startedAt,
    };
    const transfer: Transferable[] = [];
    if (snapshot) {
      transfer.push(
        snapshot.body.positions.buffer,
        snapshot.body.normals.buffer,
        snapshot.body.topologyDiagnostics.faceComponentIds.buffer,
        snapshot.body.topologyDiagnostics.degenerateFaceIndices.buffer,
        snapshot.internalPrintGate.stl,
      );
    }
    post(message, transfer);
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
