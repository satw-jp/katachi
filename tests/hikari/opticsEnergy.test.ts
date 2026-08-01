import assert from "node:assert/strict";
import test from "node:test";
import {
  SPECTRAL_CAUSTIC_COLORS,
  approximateOpticalPathThroughput,
} from "../../src/studies/cloud-sculpt/optics.ts";

test("spectral caustic bands redistribute rather than create RGB flux", () => {
  const totals = [0, 0, 0];
  for (const color of SPECTRAL_CAUSTIC_COLORS) {
    totals[0] += color[0];
    totals[1] += color[1];
    totals[2] += color[2];
  }
  for (const total of totals) assert.ok(Math.abs(total - 1) <= 1e-12);
});

test("outer TIR retains exit-incident energy instead of charging a fictitious exit loss", () => {
  const path = approximateOpticalPathThroughput(
    { r: 0, g: 0, b: 0 },
    { r: 0, g: 0, b: 0 },
    1.5,
    1.5,
    1,
    0,
    false,
  );
  const singleInterface = 1 - Math.pow((1 - 1.5) / (1 + 1.5), 2);
  assert.ok(Math.abs(path.exitIncidentRgb.r - singleInterface) <= 1e-12);
  assert.ok(Math.abs(path.transmittedRgb.r - singleInterface * singleInterface) <= 1e-12);
  assert.ok(path.exitIncidentRgb.r > path.transmittedRgb.r);
});
