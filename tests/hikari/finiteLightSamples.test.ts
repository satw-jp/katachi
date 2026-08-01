import assert from "node:assert/strict";
import test from "node:test";
import {
  FINITE_LIGHT_SAMPLE_STRIDE,
  generateFiniteLightSamples,
} from "../../src/studies/cloud-sculpt/finiteLightSamples.ts";

test("canonical finite-light samples are seed-stable and prefix invariant", () => {
  const small = generateFiniteLightSamples(64, "yohaku");
  const repeated = generateFiniteLightSamples(64, "yohaku");
  const large = generateFiniteLightSamples(4096, "yohaku");
  assert.deepEqual(small, repeated);
  assert.deepEqual(small, large.slice(0, small.length));
  assert.notDeepEqual(small, generateFiniteLightSamples(64, "another-seed"));
  for (let offset = 0; offset < small.length; offset += FINITE_LIGHT_SAMPLE_STRIDE) {
    assert.ok(small[offset] >= -1 && small[offset] < 1);
    assert.ok(small[offset + 1] >= -1 && small[offset + 1] < 1);
    assert.ok(Math.hypot(small[offset + 2], small[offset + 3]) <= 1);
  }
});

test("canonical angular samples cover the sun disk without directional bias", () => {
  const samples = generateFiniteLightSamples(4096, "yohaku");
  const sums = [0, 0, 0, 0];
  for (let offset = 0; offset < samples.length; offset += FINITE_LIGHT_SAMPLE_STRIDE) {
    for (let channel = 0; channel < 4; channel++) sums[channel] += samples[offset + channel];
  }
  const count = samples.length / FINITE_LIGHT_SAMPLE_STRIDE;
  for (const sum of sums) {
    const mean = sum / count;
    assert.ok(Math.abs(mean) < 0.035, `sample mean ${mean} is biased`);
  }
});

test("canonical finite-light sample prefix is frozen for CPU/WebGPU case replay", () => {
  assert.deepEqual(
    Array.from(generateFiniteLightSamples(4, "yohaku")),
    [
      0.6815295815467834, -0.8780008554458618, -0.1272418349981308, -0.37586620450019836,
      0.37713730335235596, 0.02996164932847023, -0.7418397665023804, -0.18514026701450348,
      -0.8438199758529663, -0.10189566761255264, -0.45646387338638306, 0.5167759656906128,
      -0.19995790719985962, 0.19778859615325928, 0.36342132091522217, 0.6223914623260498,
    ],
  );
});
