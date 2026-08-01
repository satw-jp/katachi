import assert from "node:assert/strict";
import test from "node:test";
import { redistributeLightToBlockStrokes } from "../../src/studies/cloud-sculpt/strokeRedistribution.ts";

function channelTotals(field: ArrayLike<number>): [number, number, number] {
  const totals: [number, number, number] = [0, 0, 0];
  for (let index = 0; index < field.length; index += 3) {
    totals[0] += field[index] ?? 0;
    totals[1] += field[index + 1] ?? 0;
    totals[2] += field[index + 2] ?? 0;
  }
  return totals;
}

test("stroke redistribution preserves delivered RGB light exactly", () => {
  const source = Float64Array.from({ length: 8 * 8 * 3 }, (_, index) => (
    ((index * 17 + 11) % 101) / 37
  ));
  const strokes = redistributeLightToBlockStrokes(source, 8, 8, 4);
  const before = channelTotals(source);
  const after = channelTotals(strokes);
  for (let channel = 0; channel < 3; channel++) {
    assert.ok(Math.abs(before[channel] - after[channel]) < 1e-10);
  }
  assert.notDeepEqual([...strokes], [...source]);
});

test("stroke redistribution is deterministic and ignores shadow coverage", () => {
  const delivered = Float64Array.from({ length: 7 * 5 * 3 }, (_, index) => index / 19);
  const first = redistributeLightToBlockStrokes(delivered, 7, 5, 4);
  const second = redistributeLightToBlockStrokes(delivered, 7, 5, 4);
  assert.deepEqual(first, second);
  const before = channelTotals(delivered);
  const after = channelTotals(first);
  for (let channel = 0; channel < 3; channel++) {
    assert.ok(Math.abs(before[channel] - after[channel]) < 1e-10);
  }
});
