// ---------------------------------------------------------------------------
// O3 §8: growNetwork + buildCandidateMesh + the save gate run HERE, off the
// main thread.
//
// Measured reason (AGENTS §6 — the number, not the assertion): at the
// diagnosis conditions a three-candidate batch took ~28s of fully blocking
// main-thread work, during which the tab did not repaint and automation could
// not reach it. The O2 rewrite plus the field spatial index brought the real
// compute down to roughly 3-5s per candidate, but "faster" is not "responsive"
// — this file is what makes the difference, and the README reports the two
// numbers separately (§8 "実処理時間とmain-thread応答性を別々に報告する").
//
// This file does NOT make the computation faster. Anything it moves takes the
// same time it took before; it takes it somewhere the UI is not waiting.
// ---------------------------------------------------------------------------

import { growNetwork } from "./growth.ts";
import { buildCandidateMesh, evaluateSaveGate } from "./meshExport.ts";
import type { GeneratedCandidate, GenerateRequest, GrowthWorkerMessage } from "./growthWorkerProtocol.ts";

self.onmessage = (event: MessageEvent<GenerateRequest>) => {
  const request = event.data;
  if (request.type !== "generate") return;
  // Measured from when the request actually arrives, not from module load, so
  // the reported elapsed time is the work and not the Worker's own startup.
  const startedAt = performance.now();
  const { requestId, variants } = request;
  const post = (message: GrowthWorkerMessage) => (self as unknown as Worker).postMessage(message);

  try {
    const candidates: GeneratedCandidate[] = [];
    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];
      const candidateIndex = i + 1;
      const candidateTotal = variants.length;
      post({ type: "progress", requestId, candidateIndex, candidateTotal, variant, stage: "growth", completed: 0, total: 0, elapsedMs: performance.now() - startedAt });

      const growthStart = performance.now();
      const result = growNetwork(request.hostId, request.envelope, request.params, variant, request.canonicalScaleMmPerUnit, {
        onProgress: (completed, total) => {
          post({ type: "progress", requestId, candidateIndex, candidateTotal, variant, stage: "growth", completed, total, elapsedMs: performance.now() - startedAt });
          return true; // cancellation is worker.terminate() from main.ts — see growthWorkerProtocol.ts
        },
      });
      const growthMs = performance.now() - growthStart;

      const meshStart = performance.now();
      const candidate: GeneratedCandidate = { result, growthMs, meshMs: 0 };
      if (result.units.length > 0) {
        post({ type: "progress", requestId, candidateIndex, candidateTotal, variant, stage: "mesh", completed: 0, total: 0, elapsedMs: performance.now() - startedAt });
        try {
          const mesh = buildCandidateMesh(result, request.meshResolution, request.blendK);
          post({ type: "progress", requestId, candidateIndex, candidateTotal, variant, stage: "gate", completed: 0, total: 0, elapsedMs: performance.now() - startedAt });
          candidate.mesh = mesh;
          candidate.gate = evaluateSaveGate(mesh, request.buildVolumeMm, request.envelope.layerHeightMm);
        } catch (err) {
          // One candidate failing to mesh is a result about that candidate, not
          // a failure of the batch — the other two are still returned.
          candidate.meshError = (err as Error).message;
        }
      }
      candidate.meshMs = performance.now() - meshStart;
      candidates.push(candidate);
    }
    post({ type: "result", requestId, candidates, elapsedMs: performance.now() - startedAt });
  } catch (err) {
    post({ type: "error", requestId, message: (err as Error).message, elapsedMs: performance.now() - startedAt });
  }
};
