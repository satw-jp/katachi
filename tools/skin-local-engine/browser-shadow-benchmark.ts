import {
  createEvaluateContainmentJob,
} from "../../src/studies/skin/rebuild/geometryEngine/contracts.ts";
import { evaluateContainmentShadow } from "../../src/studies/skin/rebuild/geometryEngine/shadowEvaluateContainment.ts";
import { WindowsLocalGeometryEngineClient } from "../../src/studies/skin/rebuild/geometryEngine/windowsLocalClient.ts";

declare global {
  interface Window {
    __KATACHI_CUDA_BROWSER_REPORT__?: Record<string, unknown>;
  }
}

const params = new URLSearchParams(location.search);
const sampleCount = Number(params.get("samples") ?? "32768");
const transport = params.get("transport") === "json" ? "json" : "binary";
const reportElement = document.querySelector<HTMLPreElement>("#report");

function deterministicSamples(count: number) {
  const side = Math.ceil(Math.cbrt(count));
  return Array.from({ length: count }, (_, index) => {
    const x = index % side;
    const y = Math.floor(index / side) % side;
    const z = Math.floor(index / (side * side));
    return {
      sampleId: `browser-${index}`,
      edgeId: `edge-${index % 257}`,
      position: {
        x: -2.6 + (5.2 * x) / (side - 1),
        y: -2.6 + (5.2 * y) / (side - 1),
        z: -2.6 + (5.2 * z) / (side - 1),
      },
      radius: 0.04 + (index % 7) * 0.01,
    };
  });
}

async function run(): Promise<void> {
  const request = createEvaluateContainmentJob({
    clientRequestId: `real-browser-${transport}-${sampleCount}`,
    projectFingerprint: `sha256:real-browser-${transport}-${sampleCount}`,
    coordinateContract: {
      frame: "object",
      unitsPerMillimeter: 0.1,
      handedness: "right",
      buildAxis: "+z",
    },
    quality: { purpose: "real-browser-shadow", benchmarkIterations: 1 },
    input: {
      base: {
        kind: "metaball-smooth-union",
        contractVersion: 1,
        balls: [
          { id: 1, x: 0, y: 0, z: 0, r: 2.4 },
          { id: 2, x: 0.8, y: -0.25, z: 0.35, r: 1.35 },
          { id: 3, x: -0.65, y: 0.45, z: -0.25, r: 1.1 },
        ],
        smoothness: 0.6,
      },
      samples: deterministicSamples(sampleCount),
      boundaryTolerance: 0.00005,
    },
  });
  const client = new WindowsLocalGeometryEngineClient({ transport, jobTimeoutMs: 30_000 });
  const start = performance.now();
  const outcome = await evaluateContainmentShadow(request, {
    preferWindowsCuda: true,
    localClient: client,
    comparisonMarginTolerance: request.input.boundaryTolerance,
  });
  const report = {
    userAgent: navigator.userAgent,
    secureContext: isSecureContext,
    sampleCount,
    transport,
    elapsedMilliseconds: performance.now() - start,
    candidateStatus: outcome.candidateStatus,
    matched: outcome.comparison?.matched,
    maximumAbsoluteMarginDelta: outcome.comparison?.maximumAbsoluteMarginDelta,
    missingSampleCount: outcome.comparison?.missingSampleIds.length,
    mismatchSampleCount: outcome.comparison?.discreteMismatchSampleIds.length,
    authoritativeBackend: outcome.authoritative.backend.backendKind,
    candidateBackend: outcome.candidate?.backend.backendKind,
    shadow: outcome.shadowOnly,
    productionApplied: outcome.productionApplied,
    timing: client.getLastTransportTiming(),
    fallback: outcome.fallback,
  };
  window.__KATACHI_CUDA_BROWSER_REPORT__ = report;
  if (reportElement) reportElement.textContent = JSON.stringify(report, null, 2);
}

run().catch((error) => {
  const report = {
    failed: true,
    detail: error instanceof Error ? error.message : String(error),
    shadow: true,
    productionApplied: false,
  };
  window.__KATACHI_CUDA_BROWSER_REPORT__ = report;
  if (reportElement) reportElement.textContent = JSON.stringify(report, null, 2);
});
