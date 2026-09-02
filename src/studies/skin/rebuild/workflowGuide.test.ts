import assert from "node:assert/strict";
import {
  evaluateSkinWorkflowGuide,
  type SkinWorkflowGuideInput,
} from "./workflowGuide.ts";

const baseInput: SkinWorkflowGuideInput = {
  baseReady: true,
  surfacePatternReady: true,
  insideOutsideCurrent: true,
  overhangCurrent: true,
  permanentReinforcementCurrent: true,
  reinforcementRequired: false,
  finalMeshState: "current",
  finalDiagnosisState: "current",
  finalDiagnosisBlocker: null,
  supportExportState: "ready",
  supportExportBlocker: null,
  restoreState: "none",
};

function guide(overrides: Partial<SkinWorkflowGuideInput> = {}) {
  return evaluateSkinWorkflowGuide({ ...baseInput, ...overrides });
}

assert.equal(guide({ baseReady: false, surfacePatternReady: false }).primaryAction, "create-base");
assert.equal(guide({ surfacePatternReady: false }).primaryAction, "generate-surface-pattern");
assert.equal(guide({ insideOutsideCurrent: false }).primaryAction, "diagnose-inside-outside");
assert.equal(guide({ overhangCurrent: false }).primaryAction, "diagnose-overhang");
assert.equal(guide({ reinforcementRequired: true }).primaryAction, "regenerate-reinforcement");
assert.equal(guide({ finalMeshState: "stale" }).primaryAction, "build-final-mesh");
assert.equal(guide({ finalDiagnosisState: "stale" }).primaryAction, "run-final-diagnosis");
assert.equal(guide({ supportExportState: "needs-generation" }).primaryAction, "generate-sparse-support");
assert.equal(guide({ supportExportState: "needs-interior-verification" }).primaryAction, "verify-artwork-interior");
assert.equal(guide({ supportExportState: "unresolved-approval" }).primaryAction, "approve-unresolved-support");
assert.equal(guide({ supportExportState: "thin-strut-approval" }).primaryAction, "approve-thin-strut");
assert.equal(guide().primaryAction, "export-3mf");

const restoredWithoutEvidence = guide({
  restoreState: "missing-downstream-evidence",
  finalMeshState: "missing",
  finalDiagnosisState: "missing",
  supportExportState: "not-ready",
});
assert.equal(restoredWithoutEvidence.phase, "final-mesh");
assert.equal(restoredWithoutEvidence.phaseStatus, "needs-verification");
assert.equal(restoredWithoutEvidence.primaryAction, "verify-final-mesh");
assert.match(restoredWithoutEvidence.blocker ?? "", /Needs verification/);
assert.equal(restoredWithoutEvidence.context, "FKEI restore済み · downstream evidenceはNeeds verification");

const restoredSnapshot = guide({ restoreState: "snapshot-restored" });
assert.equal(restoredSnapshot.phase, "support-export");
assert.equal(restoredSnapshot.context, "Print Snapshot restore済み · BODY / downstream evidenceを既存stateとして利用中");

const recirculate = guide({
  finalDiagnosisBlocker: {
    phase: "permanent-reinforcement",
    action: "regenerate-reinforcement",
    reason: "Inside danger remains",
  },
});
assert.equal(recirculate.phase, "permanent-reinforcement");
assert.equal(recirculate.primaryAction, "regenerate-reinforcement");
assert.equal(recirculate.blocker, "Inside danger remains");

console.log("SKIN REBUILD workflow guide tests passed");
