import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  evaluateOutputScalePreparation,
  expectedOverallExtentMm,
  outputScaleFactor,
  outputScalePresetLabel,
  OUTPUT_SCALE_PRESET_MM,
  physicalArtifactFingerprint,
  physicalSettingsFingerprint,
  toPhysicalBoundsMm,
} from "./outputScale.ts";
import { serializeSkinRebuildArtifactExportReport } from "./artifactExport.ts";
import { parseSkinRebuildFkei, serializeSkinRebuildFkei } from "./fkei.ts";

// 1. targetLongestMm 80 -> 120: physical overall extent = 1.5x.
function closeTo(actual: number, expected: number, message?: string): void {
  assert.ok(Math.abs(actual - expected) < 1e-9, message ?? `${actual} should be close to ${expected}`);
}
assert.equal(outputScaleFactor(80, 120), 1.5);
assert.equal(expectedOverallExtentMm(80, 80, 120), 120);
closeTo(expectedOverallExtentMm(119.5, 80, 120), 119.5 * 1.5);

// 2. Motif / Base relative proportions unchanged: one ratio applies uniformly
// to every authored extent (base extent and motif extent scale identically).
{
  const factor = outputScaleFactor(80, 120);
  const baseExtent = 76.4;
  const motifExtent = 12.7;
  closeTo(expectedOverallExtentMm(baseExtent, 80, 120) / baseExtent, factor);
  closeTo(expectedOverallExtentMm(motifExtent, 80, 120) / motifExtent, factor);
  closeTo(
    expectedOverallExtentMm(motifExtent, 80, 120) / expectedOverallExtentMm(baseExtent, 80, 120),
    motifExtent / baseExtent,
    "motif-to-base proportion must survive the output scale",
  );
}

// 3. strutDiameterMm fixed across 80 -> 120: diameters stay, export records them.
{
  const before = { targetLongestMm: 80, strutDiameterMm: 2.6, supportDiameterMm: 1.6 };
  const after = { targetLongestMm: 120, strutDiameterMm: 2.6, supportDiameterMm: 1.6 };
  assert.equal(after.strutDiameterMm, before.strutDiameterMm, "output change must not rewrite the permanent diameter");
  const preparation = evaluateOutputScalePreparation(before, after);
  assert.equal(preparation.geometry, "STALE");
  assert.equal(preparation.support, "STALE");
  assert.equal(preparation.export, "NEEDS PREP");
}

// 4. supportDiameterMm fixed across 80 -> 120.
{
  const before = { targetLongestMm: 80, strutDiameterMm: 3.9, supportDiameterMm: 1.6 };
  const after = { targetLongestMm: 120, strutDiameterMm: 3.9, supportDiameterMm: 1.6 };
  assert.equal(after.supportDiameterMm, before.supportDiameterMm, "output change must not rewrite the support diameter");
  const preparation = evaluateOutputScalePreparation(before, after);
  assert.equal(preparation.support, "STALE");
  assert.ok(preparation.reasons.some((reason) => reason.includes("Print geometry needs update")));
}

// 5. strutDiameter change leaves the overall target size unchanged.
{
  const before = { targetLongestMm: 120, strutDiameterMm: 2.6, supportDiameterMm: 1.6 };
  const after = { targetLongestMm: 120, strutDiameterMm: 3.2, supportDiameterMm: 1.6 };
  assert.equal(after.targetLongestMm, before.targetLongestMm, "diameter change must not rewrite the output size");
  const preparation = evaluateOutputScalePreparation(before, after);
  assert.equal(preparation.geometry, "STALE");
  assert.equal(preparation.support, "CURRENT");
  assert.equal(preparation.export, "NEEDS PREP");
  assert.ok(preparation.reasons.some((reason) => reason.includes("re-realized")));
}

// 6. supportDiameter change leaves the overall target size unchanged.
{
  const before = { targetLongestMm: 120, strutDiameterMm: 2.6, supportDiameterMm: 1.6 };
  const after = { targetLongestMm: 120, strutDiameterMm: 2.6, supportDiameterMm: 2.0 };
  assert.equal(after.targetLongestMm, before.targetLongestMm, "diameter change must not rewrite the output size");
  const preparation = evaluateOutputScalePreparation(before, after);
  assert.equal(preparation.geometry, "CURRENT");
  assert.equal(preparation.support, "STALE");
  assert.equal(preparation.export, "NEEDS PREP");
  assert.ok(preparation.reasons.some((reason) => reason.includes("Stage 8")));
}

// 7. Output Size change makes the physical pipeline stale (never CURRENT).
{
  const preparation = evaluateOutputScalePreparation(
    { targetLongestMm: 120, strutDiameterMm: 2.6, supportDiameterMm: 1.6 },
    { targetLongestMm: 160, strutDiameterMm: 2.6, supportDiameterMm: 1.6 },
  );
  assert.equal(preparation.geometry, "STALE");
  assert.equal(preparation.support, "STALE");
  assert.equal(preparation.export, "NEEDS PREP");
  const current = evaluateOutputScalePreparation(
    { targetLongestMm: 120, strutDiameterMm: 2.6, supportDiameterMm: 1.6 },
    { targetLongestMm: 120, strutDiameterMm: 2.6, supportDiameterMm: 1.6 },
  );
  assert.equal(current.geometry, "CURRENT");
  assert.equal(current.support, "CURRENT");
  assert.equal(current.export, "AVAILABLE");
  assert.deepEqual(current.reasons, []);
  const unprepared = evaluateOutputScalePreparation(null, {
    targetLongestMm: 120, strutDiameterMm: 2.6, supportDiameterMm: 1.6,
  });
  assert.equal(unprepared.export, "NEEDS PREP");
}

// 8. Export does not silently rerun geometry: the report carries the
// prepared-at physical settings verbatim, so export serializes instead of
// recomputing. Round-trip must preserve every physical size field.
{
  const report = serializeSkinRebuildArtifactExportReport({
    generatedAt: "2026-09-04T00:00:00.000Z",
    appCommit: "test",
    projectFingerprint: "source-sha",
    bodyFingerprint: "body-sha",
    supportFingerprint: null,
    bodySource: "stage6BodyMeshCache",
    supportSource: "none",
    formats: ["BODY STL", "report JSON"],
    transforms: { bodyScaleMmPerUnit: 1.5, plateShiftSourceZ: 0 },
    diagnostics: {},
    warnings: [],
    removedDegenerates: {},
    bounds: {},
    unresolved: null,
    acceptedBodyCollision: null,
    printApproval: false,
    targetLongestMm: 160,
    bodyScaleMmPerUnit: 1.5,
    strutDiameterMm: 2.6,
    supportDiameterMm: 1.6,
    physicalBoundsMm: { x: 120, y: 100, z: 160, longest: 160 },
    sourceFingerprint: "source-sha",
    artifactFingerprint: "artifact-sha",
    physicalSettingsFingerprint: "physical-sha",
  });
  const parsed = JSON.parse(report) as Record<string, unknown>;
  assert.equal(parsed["targetLongestMm"], 160);
  assert.equal(parsed["bodyScaleMmPerUnit"], 1.5);
  assert.equal(parsed["strutDiameterMm"], 2.6);
  assert.equal(parsed["supportDiameterMm"], 1.6);
  assert.deepEqual(parsed["physicalBoundsMm"], { x: 120, y: 100, z: 160, longest: 160 });
  assert.equal(parsed["sourceFingerprint"], "source-sha");
  assert.equal(parsed["artifactFingerprint"], "artifact-sha");
  assert.equal(parsed["physicalSettingsFingerprint"], "physical-sha");
}

// 9. Restored FKEI keeps its explicit saved targetLongestMm (no silent migration).
{
  const text = readFileSync(new URL("../../../../public/samples/skin-rebuild-first-print.fkei", import.meta.url), "utf8");
  const document = parseSkinRebuildFkei(text);
  assert.equal(document.project.settings.targetLongestMm, 80, "saved 80 mm must survive restore, not migrate to 120");
  assert.equal(document.project.settings.strutDiameterMm, 2.6);
  assert.equal(document.project.settings.supportDiameterMm, 1.6);
  const roundTripped = parseSkinRebuildFkei(serializeSkinRebuildFkei(document));
  assert.equal(roundTripped.project.settings.targetLongestMm, 80);
}

// 10. Same authoring geometry + different output size: source identity same,
// physical artifact fingerprint different.
{
  const source = "same-authoring-source-sha";
  const at120 = { targetLongestMm: 120, strutDiameterMm: 2.6, supportDiameterMm: 1.6 };
  const at180 = { targetLongestMm: 180, strutDiameterMm: 2.6, supportDiameterMm: 1.6 };
  assert.equal(physicalSettingsFingerprint(at120) === physicalSettingsFingerprint(at120), true);
  assert.notEqual(physicalSettingsFingerprint(at120), physicalSettingsFingerprint(at180));
  assert.equal(
    physicalArtifactFingerprint(source, at120) === physicalArtifactFingerprint(source, at120),
    true,
    "same source + same physical settings must be stable",
  );
  assert.notEqual(
    physicalArtifactFingerprint(source, at120),
    physicalArtifactFingerprint(source, at180),
    "same source at different output sizes must be distinct physical artifacts",
  );
}

// 11. Report contains the correct physical size fields (bounds helper).
assert.deepEqual(toPhysicalBoundsMm(null), null);
assert.deepEqual(
  toPhysicalBoundsMm({ min: { x: 0, y: 0, z: 0 }, max: { x: 120, y: 100, z: 160 } }),
  { x: 120, y: 100, z: 160, longest: 160 },
);

// Presets are historical references only: 80/120 label, anything else Custom.
assert.deepEqual([...OUTPUT_SCALE_PRESET_MM], [80, 120]);
assert.equal(outputScalePresetLabel(80), "80 mm");
assert.equal(outputScalePresetLabel(120), "120 mm");
assert.equal(outputScalePresetLabel(160), "Custom");

console.log("outputScale v0 contract: 11 checks passed");
