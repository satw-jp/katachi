import assert from "node:assert/strict";
import test from "node:test";
import { parseConceptLabUrl, serializeConceptLabUrl } from "../urlState.ts";
import { resolveConceptLabSeed } from "../seed.ts";

test("V4 URL state round-trips fixed moment, parameters, and camera", () => {
  const original = parseConceptLabUrl("?concept=mutual-rescue&seed=12345&t=12840&palette=blue&panel=1&p=%7B%22gravity%22%3A0.9%2C%22flag%22%3Atrue%7D&cam=%7B%22x%22%3A1%2C%22y%22%3A2%2C%22z%22%3A3%2C%22fov%22%3A46%7D", "weight-of-hesitation");
  const encoded = serializeConceptLabUrl("https://example.test/skin-art/concepts-v4/", original);
  const restored = parseConceptLabUrl(new URL(encoded).search, "weight-of-hesitation");
  assert.equal(restored.concept, "mutual-rescue");
  assert.equal(restored.seed, 12345);
  assert.equal(restored.fixedSeed, true);
  assert.equal(restored.timeMs, 12840);
  assert.equal(restored.palette, "blue");
  assert.equal(restored.panel, true);
  assert.deepEqual(restored.parameters, original.parameters);
  assert.deepEqual(restored.camera, original.camera);
});

test("fixed seed and time serialize identically while a new realization changes seed", () => {
  const fixed = parseConceptLabUrl("?concept=void-bouquet&seed=12345&t=6000", "weight-of-hesitation");
  const first = JSON.stringify({ concept: fixed.concept, seed: fixed.seed, timeMs: fixed.timeMs, parameters: fixed.parameters });
  const second = JSON.stringify({ concept: fixed.concept, seed: fixed.seed, timeMs: fixed.timeMs, parameters: fixed.parameters });
  assert.equal(first, second);
  const next = resolveConceptLabSeed(null);
  assert.notEqual(next.seed, fixed.seed);
});
