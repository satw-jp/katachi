import assert from "node:assert/strict";
import test from "node:test";

import type { HanaViewportStroke } from "./gesture.ts";
import {
  fitAdaptiveControlIndices,
  selectGeometryBoundedControlIndices,
} from "./adaptiveControl.ts";
import { summarizePointToPolylineDistance } from "./fidelityDiagnostics.ts";
import { deriveStroke3DFromRawIndices } from "./stroke3d.ts";

function rawStroke(): HanaViewportStroke {
  return {
    id: "gesture-adaptive",
    viewportId: "viewport-front",
    viewDirection: "front",
    pointerType: "pen",
    viewportSize: { width: 100, height: 100 },
    points: Array.from({ length: 241 }, (_, index) => ({
      x: index / 10,
      y: 0.24 * Math.sin(index / 7) + 0.08 * Math.sin(index / 2.5),
      pressure: 0.2 + index / 1000,
      time: index * 4,
    })),
  };
}

function pointToWorld(point: { x: number; y: number }) {
  return { x: point.x, y: 0, z: point.y };
}

test("geometry-bounded selection is deterministic and keeps Raw endpoints", () => {
  const points = rawStroke().points.map(pointToWorld);
  const first = selectGeometryBoundedControlIndices(points, 0.05);
  const second = selectGeometryBoundedControlIndices(points, 0.05);
  assert.deepEqual(first, second);
  assert.equal(first[0], 0);
  assert.equal(first[first.length - 1], points.length - 1);
  assert.ok(first.length > 2);
});

test("adaptive controls retain exact Raw provenance and satisfy smooth error bound", () => {
  const raw = rawStroke();
  const fit = fitAdaptiveControlIndices(raw, pointToWorld, {
    tolerance: 0.05,
    smoothness: 0,
  });
  assert.ok(fit.indices.length > 32);
  assert.equal(fit.smoothToleranceMet, true);
  assert.ok(fit.maxControlDeviation <= fit.tolerance);
  assert.ok(fit.maxSmoothDeviation <= fit.tolerance);
  assert.equal(fit.indices[0], 0);
  assert.equal(fit.indices.at(-1), raw.points.length - 1);
  for (let index = 1; index < fit.indices.length; index += 1) {
    assert.ok(fit.indices[index] > fit.indices[index - 1]);
  }

  const rawWorld = raw.points.map(pointToWorld);
  const stroke = deriveStroke3DFromRawIndices(raw, pointToWorld, fit.indices);
  const controls = stroke.controlPoints.map((point) => point.position);
  const fidelity = summarizePointToPolylineDistance(rawWorld, controls, fit.tolerance);
  assert.equal(fidelity.aboveRadiusCount, 0);
  assert.ok(controls.every((point, index) => {
    const sourceIndex = fit.indices[index];
    const source = raw.points[sourceIndex];
    const provenance = stroke.controlPoints[index].provenance;
    return point.x === rawWorld[sourceIndex].x
      && point.z === rawWorld[sourceIndex].z
      && provenance.sourcePointStart === sourceIndex
      && provenance.sourcePointEnd === sourceIndex
      && provenance.pressure === source.pressure
      && provenance.time === source.time;
  }));
});
