/**
 * One-off packager for the reviewed Risk-driven Permanent Lattice v0.
 * It only verifies and detaches the supplied artifacts; importing either
 * lattice planner here would be a specification violation.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { parseFkeiDocument, serializeFkei } from "../src/studies/skin/fkei.ts";
import { fkeiArtworkGraphSourceKey, fkeiShapeFingerprint } from "../src/studies/skin/fkeiRestoreIdentity.ts";
import { fkeiCanonicalDryWebGraphSha256, fkeiExactDiagnosisSummarySha256, fkeiRiskDrivenLatticeSemanticSha256 } from "../src/studies/skin/fkeiRiskDrivenLattice.ts";
import { replayDetached } from "../src/studies/skin/history.ts";

const stage3Path = "/Users/atsushisato/Downloads/skin-project-20260828-194651.fkei";
const requestPath = "/tmp/skin-current-canonical-gate-request-20260829.json";
const planPath = "/Users/atsushisato/Downloads/skin-risk-driven-internal-lattice-v0-res128.plan.json";
const validationPath = "/Users/atsushisato/Downloads/skin-risk-driven-internal-lattice-v0-res128.validation.json";
const stlPath = "/Users/atsushisato/Downloads/skin-risk-driven-internal-lattice-v0-res128.stl";
const exactPath = "/Users/atsushisato/Downloads/skin-first-print-body-verification-internal-gate-ng.validation.json";
const outputPath = "/Users/atsushisato/Downloads/skin-risk-driven-lattice-v0-checkpoint.fkei";
const expected = {
  stage3: "0564dff9583042fa91f8b61cd2f552b5504b526ed7ee393b4499eb292c7752d2",
  request: "efb5b063d4efea4bfde053d5ff5906c0cadd9f08e015929aa91cdaf6960d515e",
  plan: "eeef7e131728398e818592c1e6f7a9b82ff375093acb18953fcefb1de7d1e48c",
  validation: "10fe8f74faea0006f5bfd4daa63ac6798ce42bb4bdbee52180fc819e80be480d",
  stl: "4256b84dded12ea220f3c5c7c271db093ad33eaae5952bbe81b7cb10281a454e",
  exact: "5c1359a5bb2730394acd022e39db480848e4ba67a95f107b09c458587f97a8d5",
} as const;
function bytes(path: string): Buffer { return readFileSync(path); }
function sha(value: Buffer | string): string { return createHash("sha256").update(value).digest("hex"); }
function checked(path: string, expectedHash: string): Buffer {
  const value = bytes(path); const actual = sha(value);
  if (actual !== expectedHash) throw new Error(`Fail closed: SHA-256 mismatch for ${path}: ${actual}`);
  return value;
}

const stage3 = checked(stage3Path, expected.stage3);
const requestBytes = checked(requestPath, expected.request);
const planBytes = checked(planPath, expected.plan);
const validationBytes = checked(validationPath, expected.validation);
checked(stlPath, expected.stl);
const exactBytes = checked(exactPath, expected.exact);
const document = parseFkeiDocument(stage3.toString("utf8"));
const replayed = replayDetached(document.shape.entries);
const request = JSON.parse(requestBytes.toString("utf8")) as Record<string, any>;
const plan = JSON.parse(planBytes.toString("utf8")) as Record<string, any>;
const validation = JSON.parse(validationBytes.toString("utf8")) as Record<string, any>;
const exact = JSON.parse(exactBytes.toString("utf8")) as Record<string, any>;
if (document.printApproval !== false || document.completedStage !== 3 || !document.artworkGraph || !document.surface) throw new Error("Fail closed: Stage-3 checkpoint is not the supplied restorable prefix");
if (fkeiArtworkGraphSourceKey(replayed) !== document.artworkGraph.sourceKey) throw new Error("Fail closed: Stage-3 Artwork identity does not match");
if (request.internalGraph?.nodes?.length !== 2475 || request.internalGraph?.edges?.length !== 2404 || request.targetLongestMm !== 80) throw new Error("Fail closed: canonical request graph/scale mismatch");
if (plan.schema !== "katachi.skin.risk-driven-permanent-lattice-plan.v0" || plan.printApproval !== false || plan.reviewOnly !== true || plan.canonicalRequest?.sha256 !== expected.request) throw new Error("Fail closed: plan provenance mismatch");
if (plan.canonicalRequest.graphNodes !== 2475 || plan.canonicalRequest.graphEdges !== 2404 || plan.lattice?.graph?.nodes?.length !== 56 || plan.lattice?.graph?.edges?.length !== 48 || plan.lattice?.spines?.length !== 8 || plan.lattice?.selectedCandidates?.length !== 12) throw new Error("Fail closed: plan lattice parity mismatch");
if (validation.printApproval !== false || validation.notForPrint !== true || validation.resolution !== 128 || validation.targetLongestMm !== 80 || validation.canonicalGraph?.nodes !== 2475 || validation.canonicalGraph?.edges !== 2404 || validation.augmentedGraph?.nodes !== 2531 || validation.augmentedGraph?.edges !== 2452 || validation.mesh?.triangleCount !== 216000 || validation.lattice?.savedDiameterMm !== 2.1961716972560583) throw new Error("Fail closed: BODY validation mismatch");
if (exact.printApproval !== false || exact.exact?.teal !== 2813 || exact.exact?.orange !== 428 || exact.exact?.red !== 0 || exact.canonicalGraph?.nodes !== 2475 || exact.canonicalGraph?.edges !== 2404) throw new Error("Fail closed: exact-summary provenance mismatch");
const binding = {
  shapeFingerprint: document.bindings.shapeFingerprint,
  patchSetRevision: document.bindings.patchSetRevision,
  paintRevision: document.bindings.paintRevision,
  artworkGraphSourceKey: document.artworkGraph.sourceKey,
  canonicalRequestSha256: expected.request,
  canonicalGraphSha256: fkeiCanonicalDryWebGraphSha256(request.internalGraph),
  surfaceResolution: document.surface.binding.resolution,
  surfaceTargetLongestMm: document.surface.binding.targetLongestMm,
  surfaceAngleThresholdDeg: document.surface.binding.angleThresholdDeg,
  exactDiagnosisProvenanceSha256: expected.exact,
};
const snapshotState = {
  ...replayed,
  mode: request.mode,
  host: request.host,
  hostParams: { ...replayed.hostParams, k: request.hostK },
  patches: request.patches,
  skinParams: { ...replayed.skinParams, thickness: request.thickness, roundK: request.roundK, coinBulge: request.coinBulge, coinBulgeBalance: request.coinBulgeBalance ?? 0, quadMeshJoinWidth: request.quadMeshJoinWidth ?? 0 },
  patchSetRevision: document.bindings.patchSetRevision,
};
if (fkeiShapeFingerprint(snapshotState) !== document.bindings.shapeFingerprint) throw new Error("Fail closed: canonical request Shape snapshot does not exactly match Stage-3 binding");
const lattice = plan.lattice;
const packed = {
  ...document,
  completedStage: 4 as const,
  canonicalDryWeb: {
    schemaVersion: 1 as const,
    producer: "katachi.skin.risk-driven-permanent-lattice-v0" as const,
    inputBinding: binding,
    graph: request.internalGraph,
    shapeSnapshot: { mode: request.mode, patchSetRevision: document.bindings.patchSetRevision, host: request.host, hostK: request.hostK, thickness: request.thickness, roundK: request.roundK, coinBulge: request.coinBulge, coinBulgeBalance: request.coinBulgeBalance ?? 0, quadMeshJoinWidth: request.quadMeshJoinWidth ?? 0, patches: request.patches },
    exactDiagnosisSummary: { teal: 2813, orange: 428, red: 0, provenanceSha256: expected.exact, summarySha256: fkeiExactDiagnosisSummarySha256({ teal: 2813, orange: 428, red: 0, provenanceSha256: expected.exact }) },
  },
  riskDrivenLattice: {
    schemaVersion: 1 as const,
    producer: "katachi.skin.risk-driven-permanent-lattice-v0" as const,
    inputBinding: { ...binding, canonicalGraphNodes: 2475, canonicalGraphEdges: 2404 },
    planSha256: expected.plan,
    validationSha256: expected.validation,
    stlSha256: expected.stl,
    semanticSha256: "0".repeat(64),
    settings: { thresholdDeg: lattice.thresholdDeg, meshStep: lattice.meshStep, scaleMmPerUnit: lattice.scaleMmPerUnit, diameterMm: lattice.diameterMm, maximumSegmentLengthMm: lattice.maximumSegmentLengthMm, maximumAngleFromVerticalDeg: lattice.maximumAngleFromVerticalDeg },
    graph: lattice.graph,
    anchors: lattice.anchors,
    selectedCandidates: lattice.selectedCandidates,
    spines: lattice.spines,
    branches: lattice.branches,
    generationFacts: { canonicalNodeCount: 2475, canonicalEdgeCount: 2404, latticeNodeCount: 56, latticeEdgeCount: 48, augmentedNodeCount: 2531, augmentedEdgeCount: 2452, sharedSpineCount: 2, savedDiameterMm: validation.lattice.savedDiameterMm, triangleCount: 216000 },
    sourceSpace: { resolution: 128 as const, targetLongestMm: 80 as const },
  },
};
packed.riskDrivenLattice.semanticSha256 = fkeiRiskDrivenLatticeSemanticSha256(packed.riskDrivenLattice);
const text = serializeFkei(packed);
writeFileSync(outputPath, text, "utf8");
console.log(JSON.stringify({ outputPath, bytes: Buffer.byteLength(text), sha256: sha(text), completedStage: 4, canonicalGraph: [2475, 2404], lattice: [56, 48], augmented: [2531, 2452], exact: [2813, 428, 0] }, null, 2));
