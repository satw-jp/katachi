import assert from "node:assert/strict";
import {
  evaluateSkinRebuildPrintPreparation,
  type SkinRebuildPrintPreparationReadinessInput,
} from "./printPreparationReadiness.ts";

const complete: SkinRebuildPrintPreparationReadinessInput = {
  fkeiCurrent: true,
  stage4Current: true,
  stage6Current: true,
  componentCount: 5,
  selectedComponentCount: 3,
  stage7Current: true,
  stage75Current: true,
  stage8Current: true,
  supportMode: "automatic",
  sparseSupportGenerated: true,
  unresolvedSupportCount: 0,
  acceptedBodyCollisionCount: 0,
  approvalCurrent: false,
};

const initial = evaluateSkinRebuildPrintPreparation({
  ...complete,
  fkeiCurrent: false,
  stage4Current: false,
  stage6Current: false,
  stage7Current: false,
  stage75Current: false,
  stage8Current: false,
  sparseSupportGenerated: false,
  unresolvedSupportCount: null,
  acceptedBodyCollisionCount: null,
});
assert.equal(initial.exportState, "blocked");
assert.equal(initial.canExport, false);
assert.equal(initial.canApproveExperimentalExport, false);
assert.equal(initial.diagnostics.stage4, "stale");
assert.match(initial.blocker?.nextAction ?? "", /\.fkei Open/);

const noComponent = evaluateSkinRebuildPrintPreparation({
  ...complete,
  selectedComponentCount: 0,
});
assert.equal(noComponent.exportState, "blocked");
assert.match(noComponent.blocker?.reason ?? "", /Keep/);
assert.match(noComponent.blocker?.nextAction ?? "", /1 component/);

const staleStage75 = evaluateSkinRebuildPrintPreparation({
  ...complete,
  stage75Current: false,
});
assert.equal(staleStage75.exportState, "blocked");
assert.equal(staleStage75.canGenerateSparseSupport, false);
assert.match(staleStage75.blocker?.nextAction ?? "", /7\.5/);

const unresolved = evaluateSkinRebuildPrintPreparation({
  ...complete,
  unresolvedSupportCount: 10,
});
assert.equal(unresolved.exportState, "approval-required");
assert.equal(unresolved.canApproveExperimentalExport, true);
assert.equal(unresolved.canExport, false);
assert.match(unresolved.blocker?.reason ?? "", /Unsupported/);

const approved = evaluateSkinRebuildPrintPreparation({
  ...complete,
  unresolvedSupportCount: 10,
  approvalCurrent: true,
});
assert.equal(approved.exportState, "ready");
assert.equal(approved.canExport, true);

const bodyCollision = evaluateSkinRebuildPrintPreparation({
  ...complete,
  acceptedBodyCollisionCount: 1,
});
assert.equal(bodyCollision.exportState, "blocked");
assert.match(bodyCollision.blocker?.reason ?? "", /BODY/);

const off = evaluateSkinRebuildPrintPreparation({
  ...complete,
  supportMode: "off",
  stage75Current: false,
  sparseSupportGenerated: false,
  unresolvedSupportCount: null,
  acceptedBodyCollisionCount: null,
});
assert.equal(off.exportState, "ready");
assert.equal(off.canGenerateSparseSupport, true);
assert.equal(off.sparseSupportGenerated, false);

console.log("SKIN REBUILD print preparation readiness tests passed");
