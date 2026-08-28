import assert from "node:assert/strict";
import test from "node:test";
import { deriveSkinLayerVisibility } from "./previewMeshBuffers.ts";
import { overhangSupportSiteGroupVisible } from "./dryWebInsideTargetVisibility.ts";

test("ordinary Support remains mesh-only", () => {
  const beads = deriveSkinLayerVisibility("beads", "normal");
  const mesh = deriveSkinLayerVisibility("mesh", "normal");
  assert.equal(overhangSupportSiteGroupVisible("standard", beads, "beads"), false);
  assert.equal(overhangSupportSiteGroupVisible("standard", mesh, "mesh"), true);
});

test("Dry Web inside policy is visible in beads normal and ghostSkin without changing the mode", () => {
  const normal = deriveSkinLayerVisibility("beads", "normal");
  const ghost = deriveSkinLayerVisibility("beads", "ghostSkin");
  assert.equal(overhangSupportSiteGroupVisible("dryWebInside", normal, "beads"), true);
  assert.equal(overhangSupportSiteGroupVisible("dryWebInside", ghost, "beads"), true);
  assert.equal(overhangSupportSiteGroupVisible("dryWebInside", normal, "mesh"), true);
  assert.equal(overhangSupportSiteGroupVisible("dryWebInside", normal, "raymarch"), false);
});

test("internalOnly and dense-sample visibility fail closed for both policies", () => {
  const internalOnly = deriveSkinLayerVisibility("beads", "internalOnly");
  const denseSample = deriveSkinLayerVisibility("beads", "normal", true);
  for (const policy of ["standard", "dryWebInside"] as const) {
    assert.equal(overhangSupportSiteGroupVisible(policy, internalOnly, "beads"), false);
    assert.equal(overhangSupportSiteGroupVisible(policy, denseSample, "beads"), false);
  }
});

test("reset to standard policy restores the ordinary mesh-only contract", () => {
  const beads = deriveSkinLayerVisibility("beads", "ghostSkin");
  assert.equal(overhangSupportSiteGroupVisible("dryWebInside", beads, "beads"), true);
  assert.equal(overhangSupportSiteGroupVisible("standard", beads, "beads"), false);
});

console.log("dryWebInsideTargetVisibility: standard mesh-only, Dry Web beads normal/ghostSkin, fail-closed, and reset assertions passed");
