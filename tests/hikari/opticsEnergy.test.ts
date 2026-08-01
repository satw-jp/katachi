import assert from "node:assert/strict";
import test from "node:test";
import { SPECTRAL_CAUSTIC_COLORS } from "../../src/studies/cloud-sculpt/optics.ts";

test("spectral caustic bands redistribute rather than create RGB flux", () => {
  const totals = [0, 0, 0];
  for (const color of SPECTRAL_CAUSTIC_COLORS) {
    totals[0] += color[0];
    totals[1] += color[1];
    totals[2] += color[2];
  }
  for (const total of totals) assert.ok(Math.abs(total - 1) <= 1e-12);
});
