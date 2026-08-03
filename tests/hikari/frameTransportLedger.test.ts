import assert from "node:assert/strict";
import test from "node:test";
import {
  adaptCurrentEnergyLedger,
  evaluateReceiverClosure,
  type FrameTransportLedger,
  type ReceiverLedgerScope,
} from "../../src/studies/cloud-sculpt/frameTransportLedger.ts";
import { observed, receiverFluxRgb, unavailable, type ReceiverFluxRgb } from "../../src/studies/cloud-sculpt/opticalEvents.ts";

const scope: ReceiverLedgerScope = {
  kind: "affected-baseline-in-fixed-receiver-domain",
  receiverId: "test-floor",
  sceneRevision: "scene-r0.5",
  lightRevision: "light-r0.5",
};

function pureLedger(values: {
  emitted: ReceiverFluxRgb;
  delivered: ReceiverFluxRgb;
  absorbed: ReceiverFluxRgb;
  escaped: ReceiverFluxRgb;
  rejected: ReceiverFluxRgb;
  unresolved: ReceiverFluxRgb;
}): FrameTransportLedger {
  return {
    contractVersion: "hikari-frame-transport-ledger/0.5",
    sourceBackend: "cpu-receiver",
    receiver: {
      scope,
      emittedFluxRgb: observed(values.emitted, "exact", "backend-output"),
      deliveredFluxRgb: observed(values.delivered, "exact", "backend-output"),
      absorbedFluxRgb: observed(values.absorbed, "exact", "backend-output"),
      escapedFluxRgb: observed(values.escaped, "exact", "backend-output"),
      rejectedFluxRgb: observed(values.rejected, "exact", "backend-output"),
      unresolvedFluxRgb: observed(values.unresolved, "exact", "backend-output"),
    },
    view: {
      capturedRadianceIntegralRgb: unavailable("not-emitted-by-backend"),
      sampleWeight: unavailable("not-emitted-by-backend"),
    },
  };
}

test("all available receiver quantities close within CPU tolerance", () => {
  const ledger = pureLedger({
    emitted: receiverFluxRgb({ r: 1, g: 1, b: 1 }),
    delivered: receiverFluxRgb({ r: 0.7, g: 0.7, b: 0.7 }),
    absorbed: receiverFluxRgb({ r: 0.1, g: 0.1, b: 0.1 }),
    escaped: receiverFluxRgb({ r: 0.1, g: 0.1, b: 0.1 }),
    rejected: receiverFluxRgb({ r: 0.095, g: 0.095, b: 0.095 }),
    unresolved: receiverFluxRgb({ r: 0.005, g: 0.005, b: 0.005 }),
  });
  const result = evaluateReceiverClosure(ledger);
  assert.equal(result.status, "closed");
  assert.equal(result.tolerance, 0.01);
  assert.equal(result.relativeResidual.state, "available");
  if (result.relativeResidual.state === "available") assert.ok(result.relativeResidual.value <= 1e-12);
});

test("residual and unresolved quality gate distinguish an open ledger", () => {
  const ledger = pureLedger({
    emitted: receiverFluxRgb({ r: 1, g: 1, b: 1 }),
    delivered: receiverFluxRgb({ r: 0.3, g: 0.3, b: 0.3 }),
    absorbed: receiverFluxRgb({ r: 0, g: 0, b: 0 }),
    escaped: receiverFluxRgb({ r: 0, g: 0, b: 0 }),
    rejected: receiverFluxRgb({ r: 0, g: 0, b: 0 }),
    unresolved: receiverFluxRgb({ r: 0.5, g: 0.5, b: 0.5 }),
  });
  const result = evaluateReceiverClosure(ledger);
  assert.equal(result.status, "open");
  assert.ok(result.issues.some((issue) => issue.includes("unresolved")));
});

test("current EnergyLedger marks mixed absorption not-computable and sums reflected+escaped once", () => {
  const current = {
    incidentRgb: { r: 1, g: 1, b: 1 },
    depositedRgb: { r: 0.2, g: 0.2, b: 0.2 },
    absorbedRgb: { r: 0.1, g: 0.1, b: 0.1 },
    reflectedRgb: { r: 0.3, g: 0.3, b: 0.3 },
    escapedRgb: { r: 0.2, g: 0.2, b: 0.2 },
    supportRejectedRgb: { r: 0.1, g: 0.1, b: 0.1 },
    unresolvedLossRgb: { r: 0.1, g: 0.1, b: 0.1 },
    accountedRgb: { r: 1, g: 1, b: 1 },
    residualRgb: { r: 0, g: 0, b: 0 },
    relativeResidual: 0,
  };
  const adapted = adaptCurrentEnergyLedger(current, "cpu-receiver", scope);
  assert.equal(adapted.receiver.absorbedFluxRgb.state, "ambiguous");
  assert.equal(adapted.receiver.escapedFluxRgb.state, "available");
  if (adapted.receiver.escapedFluxRgb.state === "available") {
    assert.deepEqual(adapted.receiver.escapedFluxRgb.value, receiverFluxRgb({ r: 0.5, g: 0.5, b: 0.5 }));
  }
  assert.equal(evaluateReceiverClosure(adapted).status, "not-computable");
});

test("closure preserves signed residuals when accounted flux exceeds emitted", () => {
  const result = evaluateReceiverClosure(pureLedger({
    emitted: receiverFluxRgb({ r: 1, g: 1, b: 1 }),
    delivered: receiverFluxRgb({ r: 1.1, g: 1.1, b: 1.1 }),
    absorbed: receiverFluxRgb({ r: 0, g: 0, b: 0 }),
    escaped: receiverFluxRgb({ r: 0, g: 0, b: 0 }),
    rejected: receiverFluxRgb({ r: 0, g: 0, b: 0 }),
    unresolved: receiverFluxRgb({ r: 0, g: 0, b: 0 }),
  }));
  assert.equal(result.status, "open");
  assert.equal(result.residualRgb.state, "available");
  if (result.residualRgb.state === "available") {
    assert.ok(result.residualRgb.value.r < 0);
    assert.ok(Math.abs(result.residualRgb.value.r + 0.1) <= 1e-12);
  }
  assert.equal(result.relativeResidual.state, "available");
  if (result.relativeResidual.state === "available") assert.ok(Math.abs(result.relativeResidual.value - 0.1) <= 1e-12);
});

test("zero-emitted ledgers close only when all accounted buckets are zero", () => {
  const closed = evaluateReceiverClosure(pureLedger({
    emitted: receiverFluxRgb({ r: 0, g: 0, b: 0 }),
    delivered: receiverFluxRgb({ r: 0, g: 0, b: 0 }),
    absorbed: receiverFluxRgb({ r: 0, g: 0, b: 0 }),
    escaped: receiverFluxRgb({ r: 0, g: 0, b: 0 }),
    rejected: receiverFluxRgb({ r: 0, g: 0, b: 0 }),
    unresolved: receiverFluxRgb({ r: 0, g: 0, b: 0 }),
  }));
  assert.equal(closed.status, "closed");
  assert.equal(closed.residualRgb.state, "available");
  if (closed.residualRgb.state === "available") assert.deepEqual(closed.residualRgb.value, { r: 0, g: 0, b: 0 });

  const open = evaluateReceiverClosure(pureLedger({
    emitted: receiverFluxRgb({ r: 0, g: 0, b: 0 }),
    delivered: receiverFluxRgb({ r: 1, g: 0, b: 0 }),
    absorbed: receiverFluxRgb({ r: 0, g: 0, b: 0 }),
    escaped: receiverFluxRgb({ r: 0, g: 0, b: 0 }),
    rejected: receiverFluxRgb({ r: 0, g: 0, b: 0 }),
    unresolved: receiverFluxRgb({ r: 0, g: 0, b: 0 }),
  }));
  assert.equal(open.status, "open");
  assert.ok(open.issues.length > 0);
  assert.equal(open.relativeResidual.state, "available");
  if (open.relativeResidual.state === "available") assert.ok(open.relativeResidual.value > 1);

  const tiny = evaluateReceiverClosure(pureLedger({
    emitted: receiverFluxRgb({ r: 0, g: 0, b: 0 }),
    delivered: receiverFluxRgb({ r: 1e-15, g: 0, b: 0 }),
    absorbed: receiverFluxRgb({ r: 0, g: 0, b: 0 }),
    escaped: receiverFluxRgb({ r: 0, g: 0, b: 0 }),
    rejected: receiverFluxRgb({ r: 0, g: 0, b: 0 }),
    unresolved: receiverFluxRgb({ r: 0, g: 0, b: 0 }),
  }));
  assert.equal(tiny.status, "open", "even a tiny non-zero accounted flux is open when emitted flux is exactly zero");
  assert.equal(tiny.relativeResidual.state, "available");
  if (tiny.relativeResidual.state === "available") assert.equal(tiny.relativeResidual.value, Number.POSITIVE_INFINITY);
});
