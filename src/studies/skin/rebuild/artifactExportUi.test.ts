import assert from "node:assert/strict";
import { describeSkinRebuildArtifactTopBar } from "./artifactExportUi.ts";

const ready = describeSkinRebuildArtifactTopBar({
  hasProject: true,
  bodyCurrent: true,
  supportCurrent: true,
  supportProvenance: "current-stage8:sparseResult.graph",
  previewCurrent: true,
  supportedCount: 132,
  unresolvedCount: 19,
  exportAvailable: true,
  exportRunning: false,
  warningCount: 3,
});
assert.equal(ready.statusState, "warning");
assert.match(ready.candidateLabel, /PRINT CANDIDATE/);
assert.match(ready.candidateLabel, /current-stage8:sparseResult\.graph/);
assert.match(ready.statusLabel, /132 supported · 19 unresolved/);
assert.match(ready.statusLabel, /Export available/);
assert.match(ready.statusLabel, /Preview current/);
assert.match(ready.statusLabel, /Readiness warning/);

const unavailable = describeSkinRebuildArtifactTopBar({
  hasProject: true,
  bodyCurrent: false,
  supportCurrent: false,
  supportProvenance: null,
  previewCurrent: false,
  supportedCount: null,
  unresolvedCount: null,
  exportAvailable: false,
  exportRunning: false,
  warningCount: 0,
});
assert.equal(unavailable.statusState, "unavailable");
assert.match(unavailable.statusLabel, /technical source required/);
assert.match(unavailable.candidateLabel, /Support none/);

const running = describeSkinRebuildArtifactTopBar({
  hasProject: true,
  bodyCurrent: true,
  supportCurrent: true,
  supportProvenance: "current-stage8:sparseResult.graph",
  previewCurrent: true,
  supportedCount: 132,
  unresolvedCount: 19,
  exportAvailable: true,
  exportRunning: true,
  warningCount: 3,
});
assert.equal(running.statusState, "running");
assert.match(running.statusLabel, /current snapshot/);

console.log("artifactExportUi: compact source/status presentation passed");
