import assert from "node:assert/strict";
import {
  A1_MINI_PLA_04_02,
  evaluateInternalPrintGate,
  evaluateThinStrutExperimentalExportGate,
  thinStrutExperimentalApprovalIsCurrent,
} from "../internalPrintGate.ts";
import type { InternalStructureGraph } from "../voronoi.ts";

function graph(radii: number[]): InternalStructureGraph {
  return {
    kind: "targetedGrid",
    nodes: Array.from({ length: radii.length + 1 }, (_, id) => ({
      id,
      position: { x: 0, y: 0, z: id },
      radius: 0.05,
    })),
    edges: radii.map((radius, id) => ({ id, start: id, end: id + 1, radius })),
    stats: {
      inputPoints: 0,
      delaunayTetrahedra: 0,
      candidateEdges: radii.length,
      clippedEdges: 0,
      removedShortEdges: 0,
      removedOutsideEdges: 0,
      removedIsolatedEdges: 0,
    },
  };
}

const mesh = {
  watertight: { ok: true, openEdges: 0, nonManifoldEdges: 0, totalEdges: 12 },
  connectedComponents: 1,
  scaleMmPerUnit: 10,
  removedSavedDegenerateTriangleCount: 0,
};

const thin076Report = evaluateInternalPrintGate({
  graph: graph([0.038]),
  mesh,
  resolution: 512,
  targetLongestMm: 80,
  surfaceSdf: (point) => point.z < 0.01 ? -0.05 : 1,
});
assert.ok(Math.abs(thin076Report.minDiameterMm - 0.76) < 1e-9);
assert.equal(thin076Report.thinStrutCount, 1);
assert.equal(thin076Report.invalidDiameterCount, 0);
assert.equal(thin076Report.reasons.length, 1);
assert.match(thin076Report.reasons[0], /最低線径0\.76 mm/);

const beforeApproval = evaluateThinStrutExperimentalExportGate(
  thin076Report,
  false,
  A1_MINI_PLA_04_02,
  1,
);
assert.equal(beforeApproval.state, "approval-required");
assert.match(beforeApproval.message, /0\.76 mm/);
assert.match(beforeApproval.message, /Thin struts:|1 thin struts/);

const afterApproval = evaluateThinStrutExperimentalExportGate(
  thin076Report,
  true,
  A1_MINI_PLA_04_02,
  1,
);
assert.deepEqual(afterApproval, {
  state: "ready",
  message: "Thin strut risk explicitly accepted for this experimental export.",
});

const staleReportApproval = { fingerprint: "gate-a", report: thin076Report };
assert.equal(
  thinStrutExperimentalApprovalIsCurrent(
    staleReportApproval.fingerprint,
    staleReportApproval.report,
    "gate-a",
    thin076Report,
  ),
  true,
);
assert.equal(
  thinStrutExperimentalApprovalIsCurrent(
    staleReportApproval.fingerprint,
    staleReportApproval.report,
    "gate-b",
    thin076Report,
  ),
  false,
  "a changed BODY/geometry/diagnostic fingerprint invalidates approval",
);
assert.equal(
  thinStrutExperimentalApprovalIsCurrent(
    staleReportApproval.fingerprint,
    staleReportApproval.report,
    "gate-a",
    { ...thin076Report },
  ),
  false,
  "a different gate report invalidates approval",
);

const invalidDiameterReport = evaluateInternalPrintGate({
  graph: graph([0.038, Number.NaN]),
  mesh,
  resolution: 512,
  targetLongestMm: 80,
  surfaceSdf: (point) => point.z < 0.01 ? -0.05 : 1,
});
assert.equal(invalidDiameterReport.invalidDiameterCount, 1);
assert.equal(
  evaluateThinStrutExperimentalExportGate(invalidDiameterReport, true).state,
  "hard-block",
  "non-finite diameter cannot be approved as a thin-strut exception",
);
assert.match(invalidDiameterReport.reasons.join(" / "), /不正/);

const otherHardBlock = evaluateThinStrutExperimentalExportGate(
  {
    ...thin076Report,
    watertight: false,
    reasons: [...thin076Report.reasons, "最終meshが水密ではありません"],
  },
  true,
);
assert.equal(otherHardBlock.state, "hard-block");

console.log("SKIN REBUILD Thin Strut experimental export tests passed");
