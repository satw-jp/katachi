import assert from "node:assert/strict";
import { DEFAULT_SKIN_REBUILD_SETTINGS, skinRebuildSettingsChanged } from "./model.ts";
import {
  defaultTargetLongestMmForSkinApp,
  SKIN_REBUILD_AUTHOR_SCALE_FACTOR,
  SKIN_REBUILD_FIRST_PRINT_STRUT_DIAMETER_MM,
  SKIN_REBUILD_FIRST_PRINT_SUPPORT_DIAMETER_MM,
  SKIN_REBUILD_FIRST_PRINT_TARGET_LONGEST_MM,
  SKIN_REBUILD_NEW_PROJECT_STRUT_DIAMETER_MM,
  SKIN_REBUILD_NEW_PROJECT_SUPPORT_DIAMETER_MM,
  SKIN_REBUILD_NEW_PROJECT_TARGET_LONGEST_MM,
  skinRebuildPhysicalSettingsChanged,
  skinRebuildTargetScaleChanged,
} from "./printScalePolicy.ts";

assert.equal(SKIN_REBUILD_FIRST_PRINT_TARGET_LONGEST_MM, 80);
assert.equal(SKIN_REBUILD_AUTHOR_SCALE_FACTOR, 1.5);
assert.equal(SKIN_REBUILD_NEW_PROJECT_TARGET_LONGEST_MM, 120);
assert.equal(SKIN_REBUILD_FIRST_PRINT_STRUT_DIAMETER_MM, 2.6);
assert.equal(SKIN_REBUILD_NEW_PROJECT_STRUT_DIAMETER_MM, 3.9);
assert.equal(SKIN_REBUILD_FIRST_PRINT_SUPPORT_DIAMETER_MM, 1.6);
assert.equal(SKIN_REBUILD_NEW_PROJECT_SUPPORT_DIAMETER_MM, 1.6);
assert.equal(defaultTargetLongestMmForSkinApp(true), 120, "new REBUILD sessions use the author's 1.5x base");
assert.equal(defaultTargetLongestMmForSkinApp(false), 80, "the original SKIN entry keeps its historical default");
assert.equal(DEFAULT_SKIN_REBUILD_SETTINGS.targetLongestMm, 120);
assert.equal(DEFAULT_SKIN_REBUILD_SETTINGS.strutDiameterMm, 3.9);
assert.equal(DEFAULT_SKIN_REBUILD_SETTINGS.supportDiameterMm, 1.6);

assert.equal(skinRebuildTargetScaleChanged(80, 120), true);
assert.equal(skinRebuildTargetScaleChanged(120, 120), false);
assert.equal(skinRebuildTargetScaleChanged(120, 120 + 5e-10), false);
assert.equal(skinRebuildTargetScaleChanged(120, 0), true, "incomplete UI input must fail closed");
assert.equal(skinRebuildTargetScaleChanged(120, Number.NaN), true, "non-finite UI input must fail closed");

assert.equal(skinRebuildPhysicalSettingsChanged(
  { targetLongestMm: 120, strutDiameterMm: 3.9, supportDiameterMm: 1.6 },
  { targetLongestMm: 120, strutDiameterMm: 3.9, supportDiameterMm: 1.6 },
), false);
assert.equal(skinRebuildPhysicalSettingsChanged(
  { targetLongestMm: 80, strutDiameterMm: 2.6, supportDiameterMm: 1.6 },
  { targetLongestMm: 120, strutDiameterMm: 3.9, supportDiameterMm: 1.6 },
), true);

assert.equal(skinRebuildSettingsChanged(
  DEFAULT_SKIN_REBUILD_SETTINGS,
  { ...DEFAULT_SKIN_REBUILD_SETTINGS },
), false);
assert.equal(skinRebuildSettingsChanged(
  DEFAULT_SKIN_REBUILD_SETTINGS,
  { ...DEFAULT_SKIN_REBUILD_SETTINGS, analysisResolution: 64 },
), true, "an asynchronous result must not survive a resolution change");
assert.equal(skinRebuildSettingsChanged(
  DEFAULT_SKIN_REBUILD_SETTINGS,
  { ...DEFAULT_SKIN_REBUILD_SETTINGS, targetLongestMm: Number.NaN },
), true, "an asynchronous result must not survive invalid settings");
assert.equal(skinRebuildPhysicalSettingsChanged(
  { targetLongestMm: 120, strutDiameterMm: 3.9, supportDiameterMm: 1.6 },
  { targetLongestMm: 120, strutDiameterMm: Number.NaN, supportDiameterMm: 1.6 },
), true);

console.log("SKIN REBUILD print scale policy tests passed");
