import assert from "node:assert/strict";
import test from "node:test";

import {
  HANA_COMPUTE_MODE_STORAGE_KEY,
  formatHanaAutoComputeStatus,
  formatHanaComputeStatus,
  hanaComputeModeLabel,
  parseHanaComputeModePreference,
  resolveHanaComputeModePreference,
} from "./computePreference.ts";

test("user-facing compute labels never show WINDOWS", () => {
  assert.equal(hanaComputeModeLabel("local"), "LOCAL");
  assert.equal(hanaComputeModeLabel("windows"), "REMOTE");
  assert.equal(hanaComputeModeLabel("auto"), "AUTO");
  assert.equal(formatHanaComputeStatus("windows", "READY"), "REMOTE · READY");
  assert.equal(formatHanaComputeStatus("local", "READY"), "LOCAL · READY");
});

test("AUTO status shows the executed choice when known", () => {
  assert.equal(formatHanaAutoComputeStatus("windows", "READY"), "AUTO → REMOTE · READY");
  assert.equal(formatHanaAutoComputeStatus("local", "READY"), "AUTO → LOCAL · READY");
  assert.equal(formatHanaAutoComputeStatus(null, "COMPUTING"), "AUTO · COMPUTING");
});

test("stored preferences restore the internal mode value", () => {
  assert.equal(parseHanaComputeModePreference("local"), "local");
  assert.equal(parseHanaComputeModePreference("windows"), "windows");
  assert.equal(parseHanaComputeModePreference("auto"), "auto");
  assert.equal(parseHanaComputeModePreference("windows-nt"), null);
  assert.equal(parseHanaComputeModePreference(""), null);
  assert.equal(parseHanaComputeModePreference(null), null);
  assert.equal(parseHanaComputeModePreference(42), null);
});

test("mode resolution prefers query, then storage, then Local", () => {
  assert.equal(resolveHanaComputeModePreference("windows", "local"), "windows");
  assert.equal(resolveHanaComputeModePreference(null, "windows"), "windows");
  assert.equal(resolveHanaComputeModePreference(null, "auto"), "auto");
  assert.equal(resolveHanaComputeModePreference("bogus", "windows"), "windows");
  assert.equal(resolveHanaComputeModePreference("bogus", "bogus"), "local");
  assert.equal(resolveHanaComputeModePreference(null, null), "local");
});

test("selecting windows persists the internal value and displays REMOTE", () => {
  const restored = resolveHanaComputeModePreference(null, "windows");
  assert.equal(restored, "windows");
  assert.equal(hanaComputeModeLabel(restored), "REMOTE");
  assert.equal(typeof HANA_COMPUTE_MODE_STORAGE_KEY, "string");
});
