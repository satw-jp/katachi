import assert from "node:assert/strict";
import {
  DRY_WEB_INSIDE_TARGET_DISPLAY_CAP,
  createDryWebInsideTargetPresentation,
  type DryWebInsideTargetSource,
} from "./dryWebInsideTargetPresentation.ts";

function target(id: string, index: number, classification?: DryWebInsideTargetSource["classification"]): DryWebInsideTargetSource {
  return {
    assignmentId: id,
    position: { x: index + 0.1, y: index + 0.2, z: index + 0.3 },
    normal: { x: 0, y: 0, z: 1 },
    markerRadius: 0.035,
    basis: "finalMesh",
    ...(classification ? { classification } : {}),
  };
}

const currentTargets = [target("inside-a", 1), target("inside-b", 2)];

const missing = createDryWebInsideTargetPresentation({ state: "missing", targets: null, visible: true });
assert.equal(missing.available, false);
assert.equal(missing.totalTargetCount, null);
assert.equal(missing.markers.length, 0);
assert.match(missing.reason, /Stage 4/);

const stale = createDryWebInsideTargetPresentation({ state: "stale", targets: currentTargets, visible: true });
assert.equal(stale.available, false);
assert.equal(stale.totalTargetCount, null, "stale source must not retain old count");
assert.equal(stale.markers.length, 0, "stale source must clear overlay markers");
assert.match(stale.reason, /再生成/);

const current = createDryWebInsideTargetPresentation({ state: "current", targets: currentTargets, visible: true });
assert.equal(current.available, true);
assert.equal(current.totalTargetCount, 2);
assert.equal(current.displaySampleCount, 2);
assert.equal(current.stride, 1);
assert.deepEqual(current.markers[0], {
  id: "inside-a",
  classification: "inside",
  position: { x: 1.1, y: 1.2, z: 1.3 },
  normal: { x: 0, y: 0, z: 1 },
  markerRadius: 0.035,
});

const mixed = createDryWebInsideTargetPresentation({
  state: "current",
  targets: [target("inside", 0), target("outside", 1, "outside"), target("unresolved", 2, "unresolved")],
  visible: true,
});
assert.equal(mixed.totalTargetCount, 1, "only inside targets are counted");
assert.equal(mixed.displaySampleCount, 1);
assert.ok(mixed.markers.every((marker) => marker.classification === "inside"));
assert.deepEqual(mixed.markers.map((marker) => marker.id), ["inside"]);

const largeTargets = Array.from(
  { length: DRY_WEB_INSIDE_TARGET_DISPLAY_CAP + 1 },
  (_, index) => target(`target-${index}`, index),
);
const large = createDryWebInsideTargetPresentation({ state: "current", targets: largeTargets, visible: true });
assert.equal(large.totalTargetCount, DRY_WEB_INSIDE_TARGET_DISPLAY_CAP + 1);
assert.equal(large.stride, 2);
assert.equal(large.displaySampleCount, Math.ceil((DRY_WEB_INSIDE_TARGET_DISPLAY_CAP + 1) / 2));
assert.deepEqual(large.markers.slice(0, 2).map((marker) => marker.id), ["target-0", "target-2"]);
assert.equal(large.markers.at(-1)?.id, "target-40000");
const largeAgain = createDryWebInsideTargetPresentation({ state: "current", targets: largeTargets, visible: true });
assert.deepEqual(largeAgain.markers, large.markers, "same input order uses the same stride and samples");

const before = JSON.stringify(currentTargets);
const off = createDryWebInsideTargetPresentation({ state: "current", targets: currentTargets, visible: false });
assert.equal(off.available, true);
assert.equal(off.visible, false);
assert.equal(off.totalTargetCount, 2);
assert.equal(off.displaySampleCount, 2);
assert.equal(off.markers.length, 0, "OFF state has no renderer markers");
assert.match(off.reason, /overlay OFF/);
assert.equal(JSON.stringify(currentTargets), before, "presentation does not mutate source targets");

console.log("dryWebInsideTargetPresentation: missing/stale/current, deterministic stride/cap, inside-only markers, counts, copies, immutability, and OFF cleanup passed");
