/// <reference lib="webworker" />

import { resolveDryWebRouting } from "./dryWebRouting.ts";
import {
  buildTargetedGridInternalStructure,
  normalizeTargetedGridRequiredContacts,
  type TargetedGridProgressPhase,
  type TargetedGridContactFloorFacts,
  type TargetedGridTargetConnectionFact,
} from "./targetedGrid.ts";
import type { DryWebPreviewWorkerMessage, DryWebPreviewWorkerRequest } from "./dryWebPreviewWorkerProtocol.ts";

self.onmessage = (event: MessageEvent<DryWebPreviewWorkerRequest>): void => {
  const request = event.data;
  const started = performance.now();
  const postProgress = (
    phase: "routing" | TargetedGridProgressPhase,
    completed: number,
    total: number,
  ): void => {
    const message: DryWebPreviewWorkerMessage = {
      type: "progress",
      generation: request.generation,
      requestId: request.requestId,
      paintRevision: request.paintRevision,
      surfaceFingerprint: request.surfaceFingerprint,
      resolution: request.resolution,
      phase,
      completed,
      total,
    };
    self.postMessage(message);
  };
  try {
    postProgress("routing", 0, 1);
    const routing = resolveDryWebRouting(request.entries, request.scaleMmPerUnit);
    postProgress("routing", 1, 1);
    let targetConnectionFacts: TargetedGridTargetConnectionFact[] = [];
    let contactFloorFacts: TargetedGridContactFloorFacts | undefined;
    const graph = buildTargetedGridInternalStructure(
      request.host,
      request.hostK,
      request.patches,
      routing.targets,
      request.internalDensity,
      request.internalRadius,
      {
        onProgress: (progress) => postProgress(progress.phase, progress.completed, progress.total),
        // routing.targets is the source array sent to the builder. Preserve
        // its original index even though targetedGrid sorts by patch/id.
        targetSourceIndices: routing.targets.map((_target, index) => index),
        dryWebRequiredContacts: request.dryWebRequiredContacts === undefined
          ? undefined
          : normalizeTargetedGridRequiredContacts(request.dryWebRequiredContacts),
        onTargetConnectionFacts: (facts) => {
          targetConnectionFacts = facts.map((fact) => ({ ...fact }));
        },
        onContactFloorFacts: (facts) => {
          contactFloorFacts = {
            requiredContacts: facts.requiredContacts,
            mainComponentKey: facts.mainComponentKey,
            patches: facts.patches.map((fact) => ({ ...fact })),
          };
        },
      },
    );
    const message: DryWebPreviewWorkerMessage = {
      type: "result",
      generation: request.generation,
      requestId: request.requestId,
      paintRevision: request.paintRevision,
      surfaceFingerprint: request.surfaceFingerprint,
      resolution: request.resolution,
      targets: routing.targets,
      targetConnectionFacts,
      contactFloorFacts,
      facts: routing.facts,
      graph,
      computeMs: performance.now() - started,
    };
    self.postMessage(message);
  } catch (error) {
    const message: DryWebPreviewWorkerMessage = {
      type: "error",
      generation: request.generation,
      requestId: request.requestId,
      paintRevision: request.paintRevision,
      message: error instanceof Error ? error.message : String(error),
      computeMs: performance.now() - started,
    };
    self.postMessage(message);
  }
};
