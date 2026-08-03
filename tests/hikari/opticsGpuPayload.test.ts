import assert from "node:assert/strict";
import test from "node:test";
import {
  GPU_OPTICS_RESULT_FLOATS,
  GPU_OPTICS_RESULT_OFFSETS,
  gpuOpticsResultOffset,
} from "../../src/studies/cloud-sculpt/opticsGpu.ts";
import { decodeGpuReceiverObservation } from "../../src/studies/cloud-sculpt/opticalEventAdapters.ts";

test("GPU optics payload keeps adjacent 28-float records disjoint", () => {
  const values = new Float32Array(GPU_OPTICS_RESULT_FLOATS * 2);
  for (let sample = 0; sample < 2; sample++) {
    const base = gpuOpticsResultOffset(sample);
    values[base + GPU_OPTICS_RESULT_OFFSETS.origin] = 100 + sample;
    values[base + GPU_OPTICS_RESULT_OFFSETS.flags] = 10 + sample;
    values[base + GPU_OPTICS_RESULT_OFFSETS.baseline] = 20 + sample;
    values[base + GPU_OPTICS_RESULT_OFFSETS.throughputRgb] = 30 + sample;
  }
  assert.equal(gpuOpticsResultOffset(1), 28);
  assert.equal(values[gpuOpticsResultOffset(0) + GPU_OPTICS_RESULT_OFFSETS.origin], 100);
  assert.equal(values[gpuOpticsResultOffset(1) + GPU_OPTICS_RESULT_OFFSETS.origin], 101);
  assert.equal(values[gpuOpticsResultOffset(1) + GPU_OPTICS_RESULT_OFFSETS.flags], 11);
  assert.equal(values[gpuOpticsResultOffset(1) + GPU_OPTICS_RESULT_OFFSETS.baseline], 21);
  assert.equal(values[gpuOpticsResultOffset(1) + GPU_OPTICS_RESULT_OFFSETS.throughputRgb], 31);
});

test("GPU optics payload rejects invalid sample indices", () => {
  assert.throws(() => gpuOpticsResultOffset(-1), RangeError);
  assert.throws(() => gpuOpticsResultOffset(0.5), RangeError);
});

test("R0.5 decoder preserves unavailable path attributes for the 28-float payload", () => {
  assert.equal(GPU_OPTICS_RESULT_FLOATS, 28);
  const values = new Float32Array(GPU_OPTICS_RESULT_FLOATS);
  values[GPU_OPTICS_RESULT_OFFSETS.flags] = 1;
  values[GPU_OPTICS_RESULT_OFFSETS.flags + 1] = 1;
  values[GPU_OPTICS_RESULT_OFFSETS.flags + 2] = 1;
  values[GPU_OPTICS_RESULT_OFFSETS.baseline + 3] = 1;
  values[GPU_OPTICS_RESULT_OFFSETS.throughputRgb + 3] = 1;
  const observation = decodeGpuReceiverObservation(values, 0, {
    receiverDomain: { minU: -16, maxU: 16, minV: -16, maxV: 16 },
    sampleFlux: 0,
  });
  assert.equal(observation.path.internalBounceCount.state, "unavailable");
  assert.equal(observation.path.opticalPathLength.state, "unavailable");
  assert.equal(observation.flags.entryValid, true);
});
