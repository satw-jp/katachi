import assert from "node:assert/strict";
import { test } from "node:test";
import {
  HeavyComputationLifecycle,
  HeavyComputationProgressState,
  isCurrentWorkerRun,
} from "./heavyComputationLifecycle.ts";

test("progress clamps to 0..100 and never retreats", () => {
  const progress = new HeavyComputationProgressState();
  progress.update("start", 40);
  progress.update("retreat", 20);
  assert.equal(progress.snapshot().progress, 40);
  progress.update("below zero", -10);
  assert.equal(progress.snapshot().progress, 40);
  progress.update("above one hundred", 120);
  assert.equal(progress.snapshot().progress, 100);
  progress.update("retreat after clamp", 60);
  assert.equal(progress.snapshot().progress, 100);
});

test("smoothTo caps estimated progress at 99", () => {
  const progress = new HeavyComputationProgressState();
  progress.update("started", 20);
  assert.equal(progress.smoothTo(140), true);
  assert.equal(progress.snapshot().estimated, true);
  progress.advanceSmoothing(1);
  assert.equal(progress.snapshot().progress, 99);
});

test("advanceSmoothing is monotonic and stops after completion", () => {
  const progress = new HeavyComputationProgressState();
  progress.update("started", 10);
  progress.smoothTo(90);
  assert.equal(progress.advanceSmoothing(0.25), false);
  const quarter = progress.snapshot().progress;
  assert.equal(progress.advanceSmoothing(0.75), false);
  assert.ok(progress.snapshot().progress >= quarter);
  assert.equal(progress.advanceSmoothing(1), true);
  const completed = progress.snapshot().progress;
  assert.equal(progress.advanceSmoothing(0.5), true);
  assert.equal(progress.snapshot().progress, completed);
});

test("updateActual stops estimation and adopts actual progress and detail", () => {
  const progress = new HeavyComputationProgressState();
  progress.update("estimated stage", 20);
  progress.smoothTo(90);
  progress.advanceSmoothing(0.5);
  progress.updateActual("actual stage", 70);
  assert.deepEqual(progress.snapshot(), {
    detail: "actual stage",
    progress: 70,
    estimated: false,
  });
  assert.equal(progress.advanceSmoothing(1), true);
  assert.equal(progress.snapshot().progress, 70);
});

test("hidden predecessor progress remains available without UI visibility", () => {
  const lifecycle = new HeavyComputationLifecycle();
  const predecessor = lifecycle.begin("predecessor");
  const predecessorProgress = new HeavyComputationProgressState();
  const visible = lifecycle.begin("visible");

  assert.equal(lifecycle.isVisible(predecessor), false);
  predecessorProgress.update("hidden predecessor stage", 37);
  assert.deepEqual(predecessorProgress.snapshot(), {
    detail: "hidden predecessor stage",
    progress: 37,
    estimated: false,
  });

  lifecycle.finish(visible);
  assert.equal(lifecycle.isVisible(predecessor), true);
  assert.equal(predecessorProgress.snapshot().progress, 37);
});

test("overlapping handles restore the latest still-running predecessor", () => {
  const lifecycle = new HeavyComputationLifecycle();
  const first = lifecycle.begin("first");
  const second = lifecycle.begin("second");

  assert.equal(lifecycle.runningCount(), 2);
  assert.equal(lifecycle.isVisible(first), false);
  assert.equal(lifecycle.isVisible(second), true);
  assert.equal(lifecycle.finish(first)?.id, second.id);
  assert.equal(lifecycle.isVisible(first), false);
  assert.equal(lifecycle.isVisible(second), true);
  assert.equal(lifecycle.finish(second), null);
  assert.equal(lifecycle.runningCount(), 0);
});

test("finishing the visible handle restores a still-running predecessor", () => {
  const lifecycle = new HeavyComputationLifecycle();
  const first = lifecycle.begin("first");
  const second = lifecycle.begin("second");

  assert.equal(lifecycle.finish(second)?.id, first.id);
  assert.equal(lifecycle.isVisible(second), false);
  assert.equal(lifecycle.isVisible(first), true);
  assert.equal(lifecycle.runningCount(), 1);
  assert.equal(lifecycle.finish(first), null);
});

test("finishing an already removed handle cannot affect a restarted operation", () => {
  const lifecycle = new HeavyComputationLifecycle();
  const oldRun = lifecycle.begin("old");
  assert.equal(lifecycle.finish(oldRun), null);
  const restarted = lifecycle.begin("restarted");
  assert.equal(lifecycle.finish(oldRun)?.id, restarted.id);
  assert.equal(lifecycle.isVisible(restarted), true);
  assert.equal(lifecycle.finish(restarted), null);
});

test("stale queued Worker messages fail exact worker/request/generation guards", () => {
  const oldWorker = {};
  const currentWorker = {};
  assert.equal(isCurrentWorkerRun(oldWorker, currentWorker, 1, 1, 1, 2), false);
  assert.equal(isCurrentWorkerRun(oldWorker, currentWorker, 1, 1, 2, 2), false);
  assert.equal(isCurrentWorkerRun(currentWorker, currentWorker, 1, 2, 2, 2), false);
  assert.equal(isCurrentWorkerRun(currentWorker, currentWorker, 1, 1, 2, 2), true);

  // Surface errors have no request id in their protocol; the exact Worker and
  // generation still prevent an old error from clearing a restarted run.
  assert.equal(isCurrentWorkerRun(oldWorker, currentWorker, null, undefined, 1, 2), false);
  assert.equal(isCurrentWorkerRun(currentWorker, currentWorker, null, undefined, 2, 2), true);
});
