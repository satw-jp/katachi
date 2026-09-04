import assert from "node:assert/strict";
import test from "node:test";
import {
  createHanaRuntimeProvenance,
  hanaRuntimeDiagnosticText,
  hanaRuntimeShortLabel,
} from "./runtimeProvenance.ts";

test("runtime provenance normalizes the injected SHA and exposes a stable short label", () => {
  const runtime = createHanaRuntimeProvenance(
    "ABCDEF0123456789ABCDEF0123456789ABCDEF01",
    "0.9.0",
    "2026-09-04T00:00:00.000Z",
  );
  assert.deepEqual(runtime, {
    gitSha: "abcdef0123456789abcdef0123456789abcdef01",
    version: "0.9.0",
    loadedAt: "2026-09-04T00:00:00.000Z",
  });
  assert.equal(hanaRuntimeShortLabel(runtime), "Runtime · abcdef0");
  assert.match(hanaRuntimeDiagnosticText(runtime), /loaded 2026-09-04T00:00:00\.000Z/);
});

test("runtime provenance safely falls back when build metadata is unavailable", () => {
  const runtime = createHanaRuntimeProvenance(null, undefined, "loaded");
  assert.deepEqual(runtime, { gitSha: "unknown", version: "unknown", loadedAt: "loaded" });
  assert.equal(hanaRuntimeShortLabel(runtime), "Runtime · unknown");
});
