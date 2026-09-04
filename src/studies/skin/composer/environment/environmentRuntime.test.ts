import assert from "node:assert/strict";
import test from "node:test";
import { EnvironmentRuntime } from "./environmentRuntime.ts";
import { DEFAULT_COMPOSER_STATE } from "../runtime/state.ts";
import { composerSourceFromFkeiText } from "../source/composerSource.ts";
import * as fs from "node:fs";
import * as path from "node:path";

const samplePath = path.resolve(
  import.meta.url,
  "../../../../../public/samples/skin-rebuild-first-print.fkei"
);

function makeState(): { density: number; motion: { elementMotionScale: number; timeScale: number } } {
  return {
    density: 1,
    motion: { elementMotionScale: 1, timeScale: 1 },
  };
}

function makeSourceStats() {
  return {
    densityMean: 0.5,
    supportMean: 0.5,
    directionChangeMean: 0.5,
  };
}

test("environment runtime range: all values in [0,1]", () => {
  for (let i = 0; i < 50; i += 1) {
    const state = makeState();
    const sourceStats = makeSourceStats();
    const result = EnvironmentRuntime.compute(state, sourceStats);
    assert.ok(result.density >= 0 && result.density <= 1, `density out of range: ${result.density}`);
    assert.ok(result.velocity >= 0 && result.velocity <= 1, `velocity out of range: ${result.velocity}`);
    assert.ok(result.tension >= 0 && result.tension <= 1, `tension out of range: ${result.tension}`);
    assert.ok(result.memory >= 0 && result.memory <= 1, `memory out of range: ${result.memory}`);
    assert.ok(result.decay >= 0 && result.decay <= 1, `decay out of range: ${result.decay}`);
    assert.ok(result.accumulation >= 0 && result.accumulation <= 1, `accumulation out of range: ${result.accumulation}`);
  }
});

test("environment runtime determinism: same inputs produce same output", () => {
  const state = makeState();
  const sourceStats = makeSourceStats();
  const result1 = EnvironmentRuntime.compute(state, sourceStats);
  const result2 = EnvironmentRuntime.compute(state, sourceStats);
  assert.strictEqual(result1.density, result2.density);
  assert.strictEqual(result1.velocity, result2.velocity);
  assert.strictEqual(result1.tension, result2.tension);
  assert.strictEqual(result1.memory, result2.memory);
  assert.strictEqual(result1.decay, result2.decay);
  assert.strictEqual(result1.accumulation, result2.accumulation);
});

test("environment runtime density response: increasing density raises density", () => {
  const state1 = { density: 0.2, motion: { elementMotionScale: 1, timeScale: 1 } };
  const state2 = { density: 0.8, motion: { elementMotionScale: 1, timeScale: 1 } };
  const sourceStats = makeSourceStats();
  const r1 = EnvironmentRuntime.compute(state1, sourceStats);
  const r2 = EnvironmentRuntime.compute(state2, sourceStats);
  assert.ok(r2.density > r1.density, `density should increase when composer density goes from 0.2 to 0.8, got ${r1.density} -> ${r2.density}`);
});

test("environment runtime velocity response: increasing motion raises velocity", () => {
  const state1 = { density: 1, motion: { elementMotionScale: 0.5, timeScale: 0.5 } };
  const state2 = { density: 1, motion: { elementMotionScale: 2, timeScale: 2 } };
  const sourceStats = makeSourceStats();
  const r1 = EnvironmentRuntime.compute(state1, sourceStats);
  const r2 = EnvironmentRuntime.compute(state2, sourceStats);
  assert.ok(r2.velocity > r1.velocity, `velocity should increase when elementMotionScale/timeScale go from 0.5 to 2, got ${r1.velocity} -> ${r2.velocity}`);
});

test("environment runtime valid object: has all 6 required fields", () => {
  const state = makeState();
  const sourceStats = makeSourceStats();
  const result = EnvironmentRuntime.compute(state, sourceStats);
  assert.ok(result != null);
  assert.strictEqual(Object.keys(result).length, 6, `should have exactly 6 fields, got ${Object.keys(result).length}: ${Object.keys(result).join(", ")}`);
  assert.ok("density" in result);
  assert.ok("velocity" in result);
  assert.ok("tension" in result);
  assert.ok("memory" in result);
  assert.ok("decay" in result);
  assert.ok("accumulation" in result);
});

test("environment runtime density with source density mean", () => {
  // Higher source densityMean should not lower the result density
  const stateLow = { density: 0.3, motion: { elementMotionScale: 0.5, timeScale: 0.5 } };
  const stateHigh = { density: 0.3, motion: { elementMotionScale: 0.5, timeScale: 0.5 } };
  // sourceStats with high densityMean
  const sourceHigh = { densityMean: 1, supportMean: 0.5, directionChangeMean: 0.5 };
  const sourceLow = { densityMean: 0, supportMean: 0.5, directionChangeMean: 0.5 };
  const r1 = EnvironmentRuntime.compute(stateLow, sourceHigh);
  const r2 = EnvironmentRuntime.compute(stateLow, sourceLow);
  // density should not be lower with higher source densityMean
  assert.ok(r1.density >= r2.density, `density should not decrease when source densityMean increases, got ${r2.density} -> ${r1.density}`);
});